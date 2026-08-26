/**
 * Apple Push Notification service, HTTP/2 provider API, token-based auth.
 *
 * iOS used to be routed through FCM on the theory that one transport beats
 * two. The theory was wrong in a specific way: Capacitor's push plugin on iOS
 * hands back a raw APNs device token, not an FCM registration token, so every
 * iOS send FCM ever attempted was addressed to something FCM had never heard
 * of. One transport is only cheaper when both platforms can actually speak it.
 *
 * So Apple gets talked to directly. It costs a second credential set and this
 * file, and it buys iOS push that arrives. Android stays on FCM.
 *
 * Configured entirely by environment; absent configuration this module reports
 * itself unavailable rather than throwing.
 */

import { env } from "../_generated/server";
import type { PushMessage, PushSendResult } from "./fcm";

export type ApnsConfig = {
  /** The .p8 key's ten-character identifier. */
  keyId: string;
  /** The Apple Developer team, which is the JWT's issuer. */
  teamId: string;
  /** PKCS#8 PEM, ES256. */
  privateKey: string;
  /** The app's bundle id — APNs calls it the topic. */
  bundleId: string;
  host: string;
};

const PRODUCTION_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";

/**
 * Apple rejects a provider token minted more than an hour ago and throttles
 * anyone minting them more often than every twenty minutes. Fifty minutes sits
 * comfortably between the two walls.
 */
const TOKEN_TTL_MS = 50 * 60_000;

export function resolveApnsConfig(): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim() ?? "";
  const teamId = env.APNS_TEAM_ID?.trim() ?? "";
  const bundleId = env.APNS_BUNDLE_ID?.trim() ?? "";
  // Convex environment values keep literal "\n" rather than newlines, and a
  // PEM with the wrong line breaks fails deep inside the crypto import with an
  // error that mentions everything except newlines.
  const privateKey = (env.APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!keyId || !teamId || !bundleId || !privateKey) return null;
  // Sandbox is the deliberate choice, not the default: a build signed for
  // development whose tokens are sent to the production host fails with
  // BadDeviceToken, which reads exactly like a dead registration.
  const host =
    env.APNS_ENVIRONMENT?.trim() === "sandbox" ? SANDBOX_HOST : PRODUCTION_HOST;
  return { keyId, teamId, privateKey, bundleId, host };
}

export function hasApnsCredentials() {
  return resolveApnsConfig() !== null;
}

function base64UrlFromBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlFromString(value: string) {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function pemToPkcs8(pem: string) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Cached per isolate, keyed by nothing: a deployment has one APNs key, and a
 * cron sweep touching hundreds of users should sign once, not once per person.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Test seam. Nothing in production has a reason to call this. */
export function resetApnsTokenCache() {
  cachedToken = null;
}

async function providerToken(config: ApnsConfig) {
  if (cachedToken && cachedToken.expiresAt > Date.now())
    return cachedToken.value;

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlFromString(
    JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }),
  );
  const claims = base64UrlFromString(
    JSON.stringify({ iss: config.teamId, iat: issuedAt }),
  );
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(config.privateKey) as unknown as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto returns the raw r‖s pair ES256 wants, which is the one place
  // this differs pleasantly from the RSA path in fcm.ts.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput) as unknown as ArrayBuffer,
  );
  const token = `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
  cachedToken = { value: token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

/**
 * Apple's vocabulary for "this device token will never work again".
 *
 * Narrow on purpose, as in fcm.ts. BadTopic, PayloadTooLarge and the rest are
 * bugs in the sender: classifying them as token death would let one bad
 * release quietly empty the registration table in a single sweep.
 */
const DEAD_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
]);

export async function sendApnsPush(
  config: ApnsConfig,
  deviceToken: string,
  message: PushMessage,
): Promise<PushSendResult> {
  let bearer: string;
  try {
    bearer = await providerToken(config);
  } catch (error) {
    return {
      ok: false,
      retriable: true,
      error: error instanceof Error ? error.message : "APNs signing failed",
    };
  }

  const payload: Record<string, unknown> = {
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
    },
    ...(message.data ?? {}),
  };
  if (message.link) payload.link = message.link;

  const response = await fetch(`${config.host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${bearer}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      // 5 rather than 10: this is a coach, not an alarm, and the phone may
      // hold it until the screen is on. Matches what the FCM path asked for.
      "apns-priority": "5",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) return { ok: true };

  const text = (await response.text()).slice(0, 400);
  // 403 is a rejected provider token — expired, or minted from a key that has
  // since been revoked. Drop the cached one so the next attempt signs afresh
  // instead of looping on a bearer Apple has already refused.
  if (response.status === 403) cachedToken = null;

  let reason = "";
  try {
    reason = (JSON.parse(text) as { reason?: string }).reason ?? "";
  } catch {
    // Non-JSON body; the status alone decides.
  }

  const dead = DEAD_TOKEN_REASONS.has(reason) || response.status === 410;
  return {
    ok: false,
    retriable: !dead,
    error: `APNs ${response.status} ${reason}: ${text}`,
  };
}
