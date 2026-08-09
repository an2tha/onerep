/**
 * Firebase Cloud Messaging, HTTP v1.
 *
 * One transport for both platforms. The alternative — APNs over HTTP/2 for
 * iOS, FCM for Android — means two auth schemes, two payload shapes and two
 * ways for a release to be silently undeliverable on one platform only. Adding
 * Firebase to the iOS build costs a plist; running two senders costs forever.
 *
 * Configured entirely by environment, and absent configuration this module
 * reports itself unavailable rather than throwing. A deployment with no push
 * credentials should behave like a deployment with no push, not like a broken
 * one.
 */

import { env } from "../_generated/server";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Refresh a minute early; a token that expires mid-flight is a lost send. */
const TOKEN_SKEW_MS = 60_000;

export type FcmConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

export function resolveFcmConfig(): FcmConfig | null {
  const projectId = env.FCM_PROJECT_ID?.trim() ?? "";
  const clientEmail = env.FCM_CLIENT_EMAIL?.trim() ?? "";
  // Convex environment values keep literal "\n" rather than newlines, and a PEM
  // with the wrong line breaks fails deep inside the crypto import with an
  // error that says nothing about newlines.
  const privateKey = (env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

export function hasPushCredentials() {
  return resolveFcmConfig() !== null;
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

async function signJwt(config: FcmConfig) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlFromString(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const claims = base64UrlFromString(
    JSON.stringify({
      iss: config.clientEmail,
      scope: FCM_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(config.privateKey) as unknown as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput) as unknown as ArrayBuffer,
  );
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

/**
 * Cached per isolate. Access tokens last an hour and a cron sweep may send to
 * hundreds of users in one invocation; minting one JWT per notification would
 * be an RSA signature and a round trip per person, for nothing.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(config: FcmConfig) {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > Date.now()) {
    return cachedToken.value;
  }
  const assertion = await signJwt(config);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `FCM token exchange failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) throw new Error("FCM token exchange returned no token");
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

export type PushMessage = {
  title: string;
  body: string;
  /** Deep link the tap resolves to, e.g. `onerep://coach/review`. */
  link?: string;
  data?: Record<string, string>;
};

/**
 * Flat rather than a tagged union: the mobile tsconfig runs with
 * `strict: false`, where narrowing on `ok` does not work and the failure
 * fields would be unreachable after an `if (!result.ok)`.
 *
 * `retriable: false` means the token is dead — unregistered or malformed — and
 * the row should go. `true` means upstream trouble: keep it, try next sweep.
 */
export type PushSendResult = {
  ok: boolean;
  retriable?: boolean;
  error?: string;
};

/**
 * FCM's vocabulary for "this token will never work again".
 *
 * Deliberately narrow. INVALID_ARGUMENT is absent because FCM also returns it
 * for a malformed *message* — and classifying a payload bug as token death
 * would let one bad release quietly delete every push registration in the
 * table in a single sweep. A payload error is retriable by definition: the
 * next deploy fixes it, the tokens were never the problem.
 */
const DEAD_TOKEN_CODES = new Set(["UNREGISTERED", "SENDER_ID_MISMATCH"]);

export async function sendPush(
  config: FcmConfig,
  token: string,
  message: PushMessage,
): Promise<PushSendResult> {
  let bearer: string;
  try {
    bearer = await accessToken(config);
  } catch (error) {
    return {
      ok: false,
      retriable: true,
      error: error instanceof Error ? error.message : "token exchange failed",
    };
  }

  const data: Record<string, string> = { ...(message.data ?? {}) };
  if (message.link) data.link = message.link;

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          data,
          android: {
            priority: "normal",
            notification: { channel_id: "coach", click_action: message.link },
          },
          apns: {
            headers: { "apns-priority": "5" },
            payload: { aps: { sound: "default" } },
          },
        },
      }),
    },
  );

  if (response.ok) return { ok: true };

  const text = (await response.text()).slice(0, 400);
  // A 401 usually means the cached token went stale early; drop it so the next
  // attempt mints a fresh one rather than looping on the same dead bearer.
  if (response.status === 401) cachedToken = null;

  let code = "";
  try {
    const parsed = JSON.parse(text) as {
      error?: { details?: Array<{ errorCode?: string }>; status?: string };
    };
    code =
      parsed.error?.details?.find((detail) => detail.errorCode)?.errorCode ??
      parsed.error?.status ??
      "";
  } catch {
    // Non-JSON error body; status alone decides.
  }

  const dead = DEAD_TOKEN_CODES.has(code) || response.status === 404;
  return {
    ok: false,
    retriable: !dead,
    error: `FCM ${response.status} ${code}: ${text}`,
  };
}
