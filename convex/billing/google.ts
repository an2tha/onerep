import { v } from "convex/values";
import { internal } from "../_generated/api";
import { env, internalAction, type ActionCtx } from "../_generated/server";
import {
  MONTHLY_PRODUCT_ID,
  SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
  nonEmptyString,
  type BillingState,
} from "./types";

/**
 * Google Play Developer API client and Real-time Developer Notifications
 * handler.
 *
 * Stays in the default V8 runtime: the service-account OAuth exchange (RS256
 * JWT) and the Pub/Sub OIDC token check are both expressible with
 * `crypto.subtle`, so there is no reason to pay a Node cold start here.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";
const REQUEST_TIMEOUT_MS = 8_000;

type ServiceAccount = { client_email: string; private_key: string };

type RtdnConfig = {
  audience: string;
  serviceAccountEmail: string;
  packageName: string;
};

function rtdnConfig(): RtdnConfig | null {
  const audience = nonEmptyString(env.GOOGLE_PUBSUB_AUDIENCE);
  const serviceAccountEmail = nonEmptyString(
    env.GOOGLE_PUBSUB_SERVICE_ACCOUNT,
  );
  const packageName = nonEmptyString(env.GOOGLE_PACKAGE_NAME);
  if (!audience || !serviceAccountEmail || !packageName) return null;
  try {
    const account = serviceAccount();
    if (
      account.client_email !== serviceAccountEmail ||
      !account.private_key.includes("PRIVATE KEY")
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return { audience, serviceAccountEmail, packageName };
}

type PlaySubscriptionV2 = {
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  testPurchase?: unknown;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
  };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
};

function base64UrlEncode(bytes: Uint8Array | string) {
  const raw =
    typeof bytes === "string"
      ? bytes
      : String.fromCharCode(...Array.from(bytes));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToBytes(segment: string) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function serviceAccount(): ServiceAccount {
  const raw = nonEmptyString(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured in Convex");
  }
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing required fields");
  }
  return parsed;
}

/** Import a PKCS#8 PEM private key for RS256 signing via WebCrypto. */
async function importPrivateKey(pem: string) {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bytes = Uint8Array.from(atob(body), (character) =>
    character.charCodeAt(0),
  );
  return await crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Exchange a signed service-account assertion for an access token.
 *
 * Not cached deliberately: Convex actions are short-lived and stateless, and a
 * token fetch is a single extra round trip on an already-rare code path.
 */
async function accessToken() {
  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: account.client_email,
      scope: ANDROID_PUBLISHER_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    }),
  );

  const key = await importPrivateKey(account.private_key);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${header}.${claims}`),
    ),
  );
  const assertion = `${header}.${claims}.${base64UrlEncode(signature)}`;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Google token exchange returned no access token");
  }
  return payload.access_token;
}

async function playFetch(path: string, init?: RequestInit) {
  const packageName = nonEmptyString(env.GOOGLE_PACKAGE_NAME);
  if (!packageName) {
    throw new Error("GOOGLE_PACKAGE_NAME is not configured in Convex");
  }
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
        packageName,
      )}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...init?.headers,
        },
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Google Play Developer API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Map Play's `subscriptionState` onto our entitlement state machine.
 *
 * `ON_HOLD` and `PAUSED` revoke: Play has stopped the entitlement itself.
 * `CANCELED` still grants, because the user keeps what they paid for until
 * `expiryTime`.
 */
export function googleStateFor(
  subscriptionState: string | undefined,
): BillingState {
  switch (subscriptionState) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return "active";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "grace_period";
    case "SUBSCRIPTION_STATE_CANCELED":
      return "canceled";
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return "billing_retry";
    case "SUBSCRIPTION_STATE_PAUSED":
    case "SUBSCRIPTION_STATE_PENDING":
      return "paused";
    case "SUBSCRIPTION_STATE_EXPIRED":
    default:
      return "expired";
  }
}

function expiryOf(subscription: PlaySubscriptionV2) {
  const times = (subscription.lineItems ?? [])
    .map((item) => (item.expiryTime ? Date.parse(item.expiryTime) : NaN))
    .filter((time) => Number.isFinite(time));
  return times.length > 0 ? Math.max(...times) : Date.now();
}

function autoRenewOf(subscription: PlaySubscriptionV2) {
  return (subscription.lineItems ?? []).some(
    (item) => item.autoRenewingPlan?.autoRenewEnabled === true,
  );
}

function productOf(subscription: PlaySubscriptionV2) {
  return (
    nonEmptyString(subscription.lineItems?.[0]?.productId) ?? MONTHLY_PRODUCT_ID
  );
}

/**
 * Acknowledge a purchase.
 *
 * Play automatically refunds any purchase left unacknowledged for three days,
 * so this happens server-side the moment we validate — never on the client,
 * which may not survive long enough to do it.
 */
async function acknowledge(productId: string, purchaseToken: string) {
  const response = await playFetch(
    `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(
      purchaseToken,
    )}:acknowledge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  // 410 means the purchase is gone; nothing to acknowledge and nothing to fix.
  if (!response.ok && response.status !== 410) {
    throw new Error(`Google acknowledge failed (${response.status})`);
  }
}

async function syncFromGoogle(
  ctx: ActionCtx,
  purchaseToken: string,
  productId: string,
  userId: string,
): Promise<{ granted: boolean; state: BillingState | null }> {
  const response = await playFetch(
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
  if (response.status === 404 || response.status === 410) {
    return { granted: false, state: null };
  }
  if (!response.ok) {
    throw new Error(`Google subscription lookup failed (${response.status})`);
  }

  const subscription = (await response.json()) as PlaySubscriptionV2;
  const state = googleStateFor(subscription.subscriptionState);
  const expiresAt = expiryOf(subscription);
  const resolvedProductId = productOf(subscription) ?? productId;

  if (subscription.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    await acknowledge(resolvedProductId, purchaseToken);
  }

  await ctx.runMutation(internal.billing.store.upsertPlatformSubscription, {
    userId,
    platform: "google",
    platformSubscriptionId: purchaseToken,
    platformCustomerId:
      subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId,
    productId: resolvedProductId,
    state,
    autoRenew: autoRenewOf(subscription),
    expiresAt,
    environment: subscription.testPurchase ? "sandbox" : "production",
    sourceUpdatedAt: expiresAt,
    latestRaw: subscription,
  });

  // An upgrade/downgrade issues a new token and supersedes the old one; retire
  // the predecessor so it stops granting access and stops being revalidated.
  const linked = nonEmptyString(subscription.linkedPurchaseToken);
  if (linked && linked !== purchaseToken) {
    const previous = await ctx.runQuery(
      internal.billing.store.getSubscriptionByPlatformId,
      { platform: "google", platformSubscriptionId: linked },
    );
    if (previous) {
      await ctx.runMutation(internal.billing.store.upsertPlatformSubscription, {
        userId: previous.userId,
        platform: "google",
        platformSubscriptionId: linked,
        productId: previous.productId,
        state: "expired",
        autoRenew: false,
        expiresAt: Date.now(),
        environment: previous.environment,
      });
    }
  }

  return { granted: state !== "expired" && state !== "refunded", state };
}

export const redeemPurchaseToken = internalAction({
  args: {
    userId: v.string(),
    purchaseToken: v.string(),
    productId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ granted: boolean; state: string | null; error?: string }> => {
    const existing = await ctx.runQuery(
      internal.billing.store.getSubscriptionByPlatformId,
      { platform: "google", platformSubscriptionId: args.purchaseToken },
    );
    if (existing && existing.userId !== args.userId) {
      return {
        granted: false,
        state: null,
        error: SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
      };
    }

    const result = await syncFromGoogle(
      ctx,
      args.purchaseToken,
      args.productId,
      args.userId,
    );
    return { granted: result.granted, state: result.state };
  },
});

export const refreshSubscription = internalAction({
  args: {
    purchaseToken: v.string(),
    productId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) =>
    await syncFromGoogle(ctx, args.purchaseToken, args.productId, args.userId),
});

// ── Pub/Sub push verification ────────────────────────────────────────────────

type Jwk = {
  kid?: string;
  n?: string;
  e?: string;
  alg?: string;
  kty?: string;
};

async function googleSigningKey(kid: string) {
  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) {
    throw new Error(`Could not fetch Google JWKS (${response.status})`);
  }
  const payload = (await response.json()) as { keys?: Jwk[] };
  const jwk = payload.keys?.find((candidate) => candidate.kid === kid);
  if (!jwk) return null;
  return await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Verify the OIDC token Pub/Sub attaches to a push delivery.
 *
 * This is the only thing standing between the RTDN route and the open
 * internet — the notification body itself carries no signature.
 */
export function validateGoogleOidcClaims(
  claims: {
    aud?: string;
    email?: string;
    email_verified?: boolean;
    exp?: number;
    iat?: number;
    iss?: string;
  },
  config: RtdnConfig,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    claims.iss !== "https://accounts.google.com" &&
    claims.iss !== "accounts.google.com"
  ) {
    return false;
  }
  if (
    claims.aud !== config.audience ||
    claims.email !== config.serviceAccountEmail ||
    claims.email_verified !== true
  ) {
    return false;
  }
  if (
    !claims.iat ||
    !claims.exp ||
    claims.iat < now - 3_600 ||
    claims.iat > now + 300 ||
    claims.exp <= now ||
    claims.exp > claims.iat + 3_900
  ) {
    return false;
  }
  return true;
}

async function verifyPubSubToken(token: string, config: RtdnConfig) {
  const [headerSegment, payloadSegment, signatureSegment] = token.split(".");
  if (!headerSegment || !payloadSegment || !signatureSegment) return false;

  const header = JSON.parse(
    new TextDecoder().decode(base64UrlDecodeToBytes(headerSegment)),
  ) as { kid?: string; alg?: string };
  if (header.alg !== "RS256" || !header.kid) return false;

  const key = await googleSigningKey(header.kid);
  if (!key) return false;

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlDecodeToBytes(signatureSegment),
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
  );
  if (!verified) return false;

  const claims = JSON.parse(
    new TextDecoder().decode(base64UrlDecodeToBytes(payloadSegment)),
  ) as {
    aud?: string;
    email?: string;
    email_verified?: boolean;
    exp?: number;
    iat?: number;
    iss?: string;
  };
  return validateGoogleOidcClaims(claims, config);
}

type RtdnMessage = {
  message?: { data?: string; messageId?: string; message_id?: string };
};

type RtdnPayload = {
  packageName?: string;
  subscriptionNotification?: {
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  testNotification?: unknown;
};

/**
 * Handle a Real-time Developer Notification.
 *
 * RTDN bodies carry only a purchase token and a notification type — never the
 * subscription state — so the Play API call is mandatory regardless, which
 * conveniently makes out-of-order delivery a non-issue.
 */
export const handleRtdn = internalAction({
  args: { token: v.string(), payload: v.string() },
  handler: async (ctx, args) => {
    const config = rtdnConfig();
    if (!config) {
      return { verified: false as const, unconfigured: true as const };
    }
    if (args.token.length > 16_384 || !(await verifyPubSubToken(args.token, config))) {
      return { verified: false as const };
    }

    let envelope: RtdnMessage;
    try {
      envelope = JSON.parse(args.payload) as RtdnMessage;
    } catch {
      return { verified: true as const, ignored: true as const };
    }

    const messageId =
      nonEmptyString(envelope.message?.messageId) ??
      nonEmptyString(envelope.message?.message_id);
    const data = nonEmptyString(envelope.message?.data);
    if (!messageId || !data) {
      return { verified: true as const, ignored: true as const };
    }

    let notification: RtdnPayload;
    try {
      notification = JSON.parse(
        new TextDecoder().decode(base64UrlDecodeToBytes(data)),
      ) as RtdnPayload;
    } catch {
      return { verified: true as const, ignored: true as const };
    }

    if (notification.packageName !== config.packageName) {
      return { verified: false as const };
    }

    const subscriptionNotification = notification.subscriptionNotification;
    if (!subscriptionNotification) {
      return { verified: true as const, ignored: true as const };
    }
    const purchaseToken = nonEmptyString(
      subscriptionNotification.purchaseToken,
    );
    const subscriptionId = nonEmptyString(
      subscriptionNotification.subscriptionId,
    );
    if (!purchaseToken || purchaseToken.length > 4_096 || !subscriptionId) {
      return { verified: false as const };
    }
    const claim = await ctx.runMutation(internal.billing.store.claimEvent, {
      platform: "google",
      eventId: messageId,
      eventType: String(
        subscriptionNotification?.notificationType ?? "unknown",
      ),
      platformSubscriptionId: purchaseToken,
    });
    if (!claim.claimed) {
      return { verified: true as const, duplicate: true as const };
    }

    try {
      const existing = await ctx.runQuery(
        internal.billing.store.getSubscriptionByPlatformId,
        { platform: "google", platformSubscriptionId: purchaseToken },
      );
      const userId =
        existing?.userId ?? (await resolveUserIdFromToken(ctx, purchaseToken));

      if (!userId) {
        await ctx.runMutation(internal.billing.store.finishEvent, {
          eventDocId: claim.eventDocId,
          status: "failed",
          error: "Could not attribute the Play notification to a OneRep user",
          platformSubscriptionId: purchaseToken,
        });
        return { verified: true as const, unattributed: true as const };
      }

      await syncFromGoogle(
        ctx,
        purchaseToken,
        subscriptionId,
        userId,
      );
      await ctx.runMutation(internal.billing.store.finishEvent, {
        eventDocId: claim.eventDocId,
        status: "processed",
        platformSubscriptionId: purchaseToken,
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

/**
 * Attribute a purchase we have never seen via the obfuscated account id the
 * client attached at purchase time.
 */
async function resolveUserIdFromToken(ctx: ActionCtx, purchaseToken: string) {
  const response = await playFetch(
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
  if (!response.ok) return null;
  const subscription = (await response.json()) as PlaySubscriptionV2;
  const accountId = nonEmptyString(
    subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId,
  );
  if (!accountId) return null;
  return await ctx.runQuery(
    internal.billing.store.findUserIdByAppAccountToken,
    {
      appAccountToken: accountId,
    },
  );
}
