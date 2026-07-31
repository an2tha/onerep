"use node";

import {
  createPrivateKey,
  createSign,
  verify,
  X509Certificate,
} from "node:crypto";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { env, internalAction, type ActionCtx } from "../_generated/server";
import {
  MONTHLY_PRODUCT_ID,
  SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
  nonEmptyString,
  type BillingEnvironment,
  type BillingState,
} from "./types";

/**
 * App Store Server API client and App Store Server Notifications v2 verifier.
 *
 * Runs in the Node runtime because ASSN v2 payloads are JWS whose `x5c` header
 * carries an X.509 chain that must be walked back to Apple Root CA G3.
 * `crypto.subtle` can verify a signature but cannot validate a certificate
 * chain, so `node:crypto`'s `X509Certificate` is required here.
 */

const PRODUCTION_HOST = "https://api.storekit.itunes.apple.com";
const SANDBOX_HOST = "https://api.storekit-sandbox.itunes.apple.com";
const APPLE_AUDIENCE = "appstoreconnect-v1";
const REQUEST_TIMEOUT_MS = 8_000;

type AppleTransaction = {
  originalTransactionId?: string;
  transactionId?: string;
  productId?: string;
  expiresDate?: number;
  purchaseDate?: number;
  environment?: string;
  revocationDate?: number;
  revocationReason?: number;
  appAccountToken?: string;
  bundleId?: string;
};

type AppleRenewalInfo = {
  autoRenewStatus?: number;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  originalTransactionId?: string;
  productId?: string;
};

type AppleNotificationPayload = {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  signedDate?: number;
  data?: {
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

function base64UrlDecode(segment: string) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return Buffer.from(padded, "base64");
}

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeJwsPayload<T>(jws: string): T {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Malformed Apple JWS");
  return JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as T;
}

// ── App Store Server API auth ────────────────────────────────────────────────

/**
 * Mint the ES256 JWT the App Store Server API expects.
 *
 * `dsaEncoding: "ieee-p1363"` is what makes Node emit the raw r‖s form JOSE
 * requires; the default DER encoding is rejected by Apple.
 */
function appStoreServerToken() {
  const issuerId = nonEmptyString(env.APPLE_ISSUER_ID);
  const keyId = nonEmptyString(env.APPLE_KEY_ID);
  const bundleId = nonEmptyString(env.APPLE_BUNDLE_ID);
  const privateKeyPem = nonEmptyString(env.APPLE_PRIVATE_KEY);
  if (!issuerId || !keyId || !bundleId || !privateKeyPem) {
    throw new Error(
      "Apple App Store Server API is not configured (APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_BUNDLE_ID, APPLE_PRIVATE_KEY)",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }),
  );
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: issuerId,
      iat: now,
      // Apple rejects tokens valid for more than an hour.
      exp: now + 30 * 60,
      aud: APPLE_AUDIENCE,
      bid: bundleId,
    }),
  );

  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign({
    // Env vars flatten newlines; restore them so the PEM parses.
    key: createPrivateKey(privateKeyPem.replace(/\\n/g, "\n")),
    dsaEncoding: "ieee-p1363",
  });

  return `${header}.${payload}.${base64UrlEncode(signature)}`;
}

function appleHost(environment: BillingEnvironment) {
  return environment === "sandbox" ? SANDBOX_HOST : PRODUCTION_HOST;
}

function configuredEnvironment(): BillingEnvironment {
  return nonEmptyString(env.APPLE_ENVIRONMENT)?.toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";
}

async function appleFetch(
  environment: BillingEnvironment,
  path: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${appleHost(environment)}${path}`, {
      headers: {
        Authorization: `Bearer ${appStoreServerToken()}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Apple App Store Server API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ── ASSN v2 signature verification ───────────────────────────────────────────

function appleRootCertificate() {
  const pem = nonEmptyString(env.APPLE_ROOT_CA_G3);
  if (!pem) {
    throw new Error(
      "APPLE_ROOT_CA_G3 is not configured. Download Apple Root CA - G3 from https://www.apple.com/certificateauthority/ and set it as a PEM string.",
    );
  }
  return new X509Certificate(pem.replace(/\\n/g, "\n"));
}

function certificateFromDerBase64(der: string) {
  return new X509Certificate(Buffer.from(der, "base64"));
}

/**
 * Verify an Apple JWS: walk the `x5c` chain up to Apple Root CA G3, confirm
 * every certificate is currently valid, then check the payload signature
 * against the leaf's public key.
 */
function verifyAppleJws(jws: string): boolean {
  const [headerSegment, payloadSegment, signatureSegment] = jws.split(".");
  if (!headerSegment || !payloadSegment || !signatureSegment) return false;

  const header = JSON.parse(
    base64UrlDecode(headerSegment).toString("utf8"),
  ) as { alg?: string; x5c?: string[] };
  if (header.alg !== "ES256") return false;

  const chain = header.x5c ?? [];
  if (chain.length < 2) return false;

  let certificates: X509Certificate[];
  let root: X509Certificate;
  try {
    certificates = chain.map(certificateFromDerBase64);
    root = appleRootCertificate();
  } catch {
    return false;
  }

  const now = Date.now();
  for (const certificate of certificates) {
    if (
      Date.parse(certificate.validFrom) > now ||
      Date.parse(certificate.validTo) < now
    ) {
      return false;
    }
  }

  // Each certificate must be signed by the next one up, and the last must be
  // signed by the pinned Apple root.
  for (let index = 0; index < certificates.length - 1; index += 1) {
    if (!certificates[index].verify(certificates[index + 1].publicKey)) {
      return false;
    }
  }
  // The chain terminates in an intermediate that the pinned root must have
  // signed. This is the step that makes the whole verification meaningful:
  // without it, anyone could present a self-consistent chain of their own.
  if (!certificates[certificates.length - 1].verify(root.publicKey)) {
    return false;
  }

  // Use the `verify` form rather than `createVerify` so the raw r‖s JOSE
  // signature encoding can be specified.
  const leaf = certificates[0];
  return verify(
    "SHA256",
    Buffer.from(`${headerSegment}.${payloadSegment}`),
    { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
    base64UrlDecode(signatureSegment),
  );
}

// ── State mapping ────────────────────────────────────────────────────────────

/**
 * Map Apple's subscription status code onto our entitlement state machine.
 *
 * 1=active, 2=expired, 3=billing retry, 4=grace period, 5=revoked.
 * Billing retry and grace period both keep access, because Apple is still
 * attempting to collect and the customer usually recovers.
 */
export function appleStateFor(
  status: number,
  transaction: AppleTransaction,
  renewal: AppleRenewalInfo,
): BillingState {
  if (transaction.revocationDate) return "refunded";
  switch (status) {
    case 1:
      return renewal.autoRenewStatus === 0 ? "canceled" : "active";
    case 3:
      return "billing_retry";
    case 4:
      return "grace_period";
    case 5:
      return "refunded";
    case 2:
    default:
      return "expired";
  }
}

function environmentOf(value: string | undefined): BillingEnvironment {
  return value?.toLowerCase() === "sandbox" ? "sandbox" : "production";
}

// ── Core operations ──────────────────────────────────────────────────────────

/**
 * Fetch the authoritative status for one subscription and persist it.
 *
 * Apple's `originalTransactionId` is the stable identity of a subscription
 * across every renewal, which is why it is our `platformSubscriptionId`.
 */
async function syncFromApple(
  ctx: ActionCtx,
  originalTransactionId: string,
  userId: string,
  options: {
    environment?: BillingEnvironment;
  } = {},
): Promise<{ granted: boolean; state: BillingState | null }> {
  const environment = options.environment ?? configuredEnvironment();
  let response = await appleFetch(
    environment,
    `/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
  );

  // A production lookup for a sandbox purchase 404s; retry the other host
  // rather than treating a sandbox tester as an expired customer.
  let resolvedEnvironment = environment;
  if (response.status === 404 && environment === "production") {
    resolvedEnvironment = "sandbox";
    response = await appleFetch(
      "sandbox",
      `/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    );
  }

  if (response.status === 404) return { granted: false, state: null };
  if (!response.ok) {
    throw new Error(
      `Apple subscription status request failed (${response.status})`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{
      lastTransactions?: Array<{
        status?: number;
        originalTransactionId?: string;
        signedTransactionInfo?: string;
        signedRenewalInfo?: string;
      }>;
    }>;
  };

  const entry = payload.data
    ?.flatMap((group) => group.lastTransactions ?? [])
    .find(
      (candidate) =>
        candidate.originalTransactionId === originalTransactionId ||
        candidate.signedTransactionInfo,
    );
  if (!entry?.signedTransactionInfo) return { granted: false, state: null };

  const transaction = decodeJwsPayload<AppleTransaction>(
    entry.signedTransactionInfo,
  );
  const renewal = entry.signedRenewalInfo
    ? decodeJwsPayload<AppleRenewalInfo>(entry.signedRenewalInfo)
    : {};

  const state = appleStateFor(entry.status ?? 2, transaction, renewal);
  const expiresAt = transaction.expiresDate ?? Date.now();

  await ctx.runMutation(internal.billing.store.upsertPlatformSubscription, {
    userId,
    platform: "apple",
    platformSubscriptionId: originalTransactionId,
    productId: transaction.productId ?? MONTHLY_PRODUCT_ID,
    state,
    autoRenew: renewal.autoRenewStatus === 1,
    expiresAt,
    gracePeriodExpiresAt: renewal.gracePeriodExpiresDate,
    environment: environmentOf(transaction.environment) ?? resolvedEnvironment,
    // Apple stamps each transaction; use it as the out-of-order guard.
    sourceUpdatedAt: transaction.purchaseDate ?? Date.now(),
    latestRaw: { transaction, renewal, status: entry.status },
  });

  return { granted: state !== "expired" && state !== "refunded", state };
}

/**
 * Redeem a signed StoreKit 2 transaction sent up by the app.
 *
 * The JWS is verified against Apple's certificate chain before we trust any
 * field in it, then the authoritative state is fetched from the server API.
 */
export const redeemTransaction = internalAction({
  args: { userId: v.string(), signedTransaction: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ granted: boolean; state: string | null; error?: string }> => {
    if (!verifyAppleJws(args.signedTransaction)) {
      return {
        granted: false,
        state: null,
        error: "Apple transaction signature is invalid",
      };
    }

    const transaction = decodeJwsPayload<AppleTransaction>(
      args.signedTransaction,
    );
    const bundleId = nonEmptyString(env.APPLE_BUNDLE_ID);
    if (bundleId && transaction.bundleId && transaction.bundleId !== bundleId) {
      return {
        granted: false,
        state: null,
        error: "Apple transaction is for a different app",
      };
    }

    const originalTransactionId = nonEmptyString(
      transaction.originalTransactionId,
    );
    if (!originalTransactionId) {
      return {
        granted: false,
        state: null,
        error: "Apple transaction has no originalTransactionId",
      };
    }

    // Refuse to silently move a subscription between OneRep accounts.
    const existing = await ctx.runQuery(
      internal.billing.store.getSubscriptionByPlatformId,
      { platform: "apple", platformSubscriptionId: originalTransactionId },
    );
    if (existing && existing.userId !== args.userId) {
      return {
        granted: false,
        state: null,
        error: SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      };
    }

    const result = await syncFromApple(
      ctx,
      originalTransactionId,
      args.userId,
      { environment: environmentOf(transaction.environment) },
    );
    return { granted: result.granted, state: result.state };
  },
});

export const refreshSubscription = internalAction({
  args: { originalTransactionId: v.string(), userId: v.string() },
  handler: async (ctx, args) =>
    await syncFromApple(ctx, args.originalTransactionId, args.userId),
});

/** Process an App Store Server Notification v2 payload. */
export const handleNotification = internalAction({
  args: { signedPayload: v.string() },
  handler: async (ctx, args) => {
    if (!verifyAppleJws(args.signedPayload)) {
      return { verified: false as const };
    }

    const notification = decodeJwsPayload<AppleNotificationPayload>(
      args.signedPayload,
    );
    const notificationUUID = nonEmptyString(notification.notificationUUID);
    if (!notificationUUID) {
      return { verified: true as const, ignored: true as const };
    }

    const claim = await ctx.runMutation(internal.billing.store.claimEvent, {
      platform: "apple",
      eventId: notificationUUID,
      eventType: [notification.notificationType, notification.subtype]
        .filter(Boolean)
        .join("."),
      signedAt: notification.signedDate,
    });
    if (!claim.claimed) {
      return { verified: true as const, duplicate: true as const };
    }

    try {
      const signedTransactionInfo = notification.data?.signedTransactionInfo;
      if (!signedTransactionInfo) {
        // TEST notifications and app-level events carry no transaction.
        await ctx.runMutation(internal.billing.store.finishEvent, {
          eventDocId: claim.eventDocId,
          status: "ignored",
        });
        return { verified: true as const, ignored: true as const };
      }

      const transaction = decodeJwsPayload<AppleTransaction>(
        signedTransactionInfo,
      );
      const originalTransactionId = nonEmptyString(
        transaction.originalTransactionId,
      );
      if (!originalTransactionId) {
        await ctx.runMutation(internal.billing.store.finishEvent, {
          eventDocId: claim.eventDocId,
          status: "ignored",
        });
        return { verified: true as const, ignored: true as const };
      }

      const existing = await ctx.runQuery(
        internal.billing.store.getSubscriptionByPlatformId,
        { platform: "apple", platformSubscriptionId: originalTransactionId },
      );
      // `appAccountToken` is the user id we attached at purchase time; it is the
      // only way to attribute a notification for a purchase we never saw.
      const userId =
        existing?.userId ??
        (await resolveUserIdFromAppAccountToken(
          ctx,
          transaction.appAccountToken,
        ));

      if (!userId) {
        await ctx.runMutation(internal.billing.store.finishEvent, {
          eventDocId: claim.eventDocId,
          status: "failed",
          error: "Could not attribute the Apple notification to a OneRep user",
          platformSubscriptionId: originalTransactionId,
        });
        return { verified: true as const, unattributed: true as const };
      }

      await syncFromApple(ctx, originalTransactionId, userId, {
        environment: environmentOf(notification.data?.environment),
      });
      await ctx.runMutation(internal.billing.store.finishEvent, {
        eventDocId: claim.eventDocId,
        status: "processed",
        platformSubscriptionId: originalTransactionId,
      });
      return { verified: true as const, processed: true as const };
    } catch (error) {
      await ctx.runMutation(internal.billing.store.finishEvent, {
        eventDocId: claim.eventDocId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});

async function resolveUserIdFromAppAccountToken(
  ctx: ActionCtx,
  appAccountToken: string | undefined,
) {
  const token = nonEmptyString(appAccountToken);
  if (!token) return null;
  return await ctx.runQuery(
    internal.billing.store.findUserIdByAppAccountToken,
    {
      appAccountToken: token,
    },
  );
}
