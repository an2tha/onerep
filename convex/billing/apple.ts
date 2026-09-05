"use node";

import {
  APIException,
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  VerificationException,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { env, internalAction, type ActionCtx } from "../_generated/server";
import { APPLE_ROOT_CA_G3_BASE64 } from "./appleRootCertificates";
import {
  appleNotificationIsActionable,
  applySubscriptionFacts,
  type AppleStatusFacts,
} from "./appleState";
import {
  appleProductGrantsPro,
  convexSafeJson,
  nonEmptyString,
  parseAppleAppId,
} from "./types";

/**
 * StoreKit 2, from the server's side of the transaction.
 *
 * The device is not a source of truth here and never becomes one. A purchase
 * on the phone produces a signed transaction; the app hands that over; this
 * module verifies the signature against Apple's root, then throws the payload
 * away and asks the App Store Server API what the subscription's state
 * actually is. Everything after that is the same road Stripe rows travel:
 * `store.upsertPlatformSubscription`, a rollup, an entitlement.
 *
 * The reason for the round trip is that a signed transaction describes a
 * moment — the moment money changed hands — and an entitlement is a claim
 * about now. Between the two sit refunds, revocations, family sharing being
 * withdrawn, and a billing retry that has been failing for nine days.
 *
 * `"use node"` because certificate chain validation needs `node:crypto`. This
 * module therefore cannot host queries or mutations; every write goes through
 * `convex/billing/store.ts`, as it does for Stripe.
 */

const BUNDLE_ID_FALLBACK = "com.ananthh.onerep";

/** How long a purchase may sit unattributed before we stop hoping. */
const UNATTRIBUTED_RETRY_MS = 60 * 1000;

function appleCredentials() {
  const signingKey = nonEmptyString(env.BILLING_APPLE_PRIVATE_KEY);
  const keyId = nonEmptyString(env.BILLING_APPLE_KEY_ID);
  const issuerId = nonEmptyString(env.BILLING_APPLE_ISSUER_ID);
  const appAppleId = parseAppleAppId(env.BILLING_APPLE_APP_APPLE_ID);
  if (!signingKey || !keyId || !issuerId || appAppleId === undefined) {
    return null;
  }

  return {
    // Convex environment variables are single-line, and a PKCS#8 key is not.
    // Accepting the escaped form costs one replace and saves an afternoon.
    signingKey: signingKey.includes("\\n")
      ? signingKey.replace(/\\n/g, "\n")
      : signingKey,
    keyId,
    issuerId,
    bundleId: nonEmptyString(env.BILLING_APPLE_BUNDLE_ID) ?? BUNDLE_ID_FALLBACK,
    appAppleId,
  };
}

export function appleBillingConfigured() {
  return appleCredentials() !== null;
}

function rootCertificates() {
  return [Buffer.from(APPLE_ROOT_CA_G3_BASE64, "base64")];
}

/**
 * Verifiers and API clients come in pairs, one per App Store environment.
 *
 * Sandbox is not a debugging convenience that can be switched off in
 * production: every TestFlight build and every App Review session transacts
 * there, against the same production bundle id. A build that only knows how to
 * talk to the production environment fails review on the first tap.
 */
function clientsFor(environment: Environment) {
  const credentials = appleCredentials();
  if (!credentials) {
    throw new Error("Apple in-app purchases are not configured in Convex");
  }

  const api = new AppStoreServerAPIClient(
    credentials.signingKey,
    credentials.keyId,
    credentials.issuerId,
    credentials.bundleId,
    environment,
  );

  const verifier = new SignedDataVerifier(
    rootCertificates(),
    // Online revocation checks: a revoked signing certificate is exactly the
    // situation where the offline answer is confidently wrong.
    true,
    environment,
    credentials.bundleId,
    // Apple omits the app id in sandbox, and passing one there fails the check.
    environment === Environment.PRODUCTION ? credentials.appAppleId : undefined,
  );

  return { api, verifier };
}

const ENVIRONMENTS = [Environment.PRODUCTION, Environment.SANDBOX] as const;

function environmentFrom(value: string | null | undefined) {
  return value === "production" || value === Environment.PRODUCTION
    ? Environment.PRODUCTION
    : Environment.SANDBOX;
}

/**
 * Verify a signed payload without being told which environment it came from.
 *
 * The verifier checks the payload's own environment against its configured
 * one, so the only way to identify an unknown payload is to offer it to both
 * and see which stops complaining. Production is tried first because that is
 * where the paying customers are.
 */
async function verifyInEitherEnvironment<T>(
  verify: (verifier: SignedDataVerifier) => Promise<T>,
): Promise<{ payload: T; environment: Environment }> {
  let lastError: unknown;
  for (const environment of ENVIRONMENTS) {
    try {
      const { verifier } = clientsFor(environment);
      return { payload: await verify(verifier), environment };
    } catch (error) {
      if (!(error instanceof VerificationException)) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("Signed payload failed verification");
}

/** Apple's "we have never heard of that transaction" code. */
const TRANSACTION_ID_NOT_FOUND = 4040010;

function isNotFound(error: unknown) {
  return (
    error instanceof APIException &&
    (error.httpStatusCode === 404 ||
      error.apiError === TRANSACTION_ID_NOT_FOUND)
  );
}

type StatusLookup = {
  transaction: JWSTransactionDecodedPayload;
  status: AppleStatusFacts;
  environment: Environment;
};

/**
 * Ask Apple for the current state of the subscription a transaction belongs to.
 *
 * `getAllSubscriptionStatuses` answers for the whole subscription group, so the
 * result is filtered back down to the originalTransactionId we asked about —
 * a user who has switched plans within the group has more than one row in
 * there, and only one of them is theirs to renew.
 */
async function lookupSubscription(
  originalTransactionId: string,
  preferred?: Environment,
): Promise<StatusLookup | null> {
  const order = preferred
    ? [preferred, ...ENVIRONMENTS.filter((item) => item !== preferred)]
    : [...ENVIRONMENTS];

  for (const environment of order) {
    const { api, verifier } = clientsFor(environment);
    let response;
    try {
      response = await api.getAllSubscriptionStatuses(originalTransactionId);
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }

    for (const group of response.data ?? []) {
      for (const item of group.lastTransactions ?? []) {
        if (item.originalTransactionId !== originalTransactionId) continue;
        if (!item.signedTransactionInfo) continue;

        const transaction = await verifier.verifyAndDecodeTransaction(
          item.signedTransactionInfo,
        );
        const renewal = item.signedRenewalInfo
          ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
          : undefined;

        return {
          transaction,
          environment,
          status: {
            status: item.status ?? 0,
            autoRenewStatus: renewal?.autoRenewStatus ?? null,
            expiresDate: transaction.expiresDate ?? null,
            gracePeriodExpiresDate: renewal?.gracePeriodExpiresDate ?? null,
            revocationDate: transaction.revocationDate ?? null,
          },
        };
      }
    }
  }

  return null;
}

/**
 * Work out whose subscription this is.
 *
 * In order of how much they can be trusted: the `appAccountToken` the app
 * attached at purchase time, which is a UUID we minted and stored against the
 * account; the row we already hold for this originalTransactionId; and the
 * caller's own authenticated id, which is only offered when a signed-in user
 * is standing there redeeming or restoring.
 */
async function attribute(
  ctx: ActionCtx,
  transaction: JWSTransactionDecodedPayload,
  fallbackUserId?: string,
): Promise<string | null> {
  const token = nonEmptyString(transaction.appAccountToken);
  if (token) {
    const owner: string | null = await ctx.runQuery(
      internal.billing.store.findUserIdByAppAccountToken,
      { appAccountToken: token.toLowerCase() },
    );
    if (owner) return owner;
  }

  const originalTransactionId = nonEmptyString(
    transaction.originalTransactionId,
  );
  if (originalTransactionId) {
    const existing = await ctx.runQuery(
      internal.billing.store.getSubscriptionByPlatformId,
      { platform: "apple", platformSubscriptionId: originalTransactionId },
    );
    if (existing) return existing.userId;
  }

  return fallbackUserId ?? null;
}

async function storeSubscription(
  ctx: ActionCtx,
  userId: string,
  lookup: StatusLookup,
) {
  const { transaction, status } = lookup;
  const originalTransactionId = nonEmptyString(
    transaction.originalTransactionId,
  );
  const productId = nonEmptyString(transaction.productId);
  if (!originalTransactionId || !productId) {
    return { stored: false as const, reason: "incomplete-transaction" };
  }
  // A valid signature proves that this app received a transaction. It does
  // not prove that the product is one we sell as OneRep Pro. Keep this
  // boundary explicit so another subscription in the bundle cannot unlock it.
  if (!appleProductGrantsPro(productId)) {
    return { stored: false as const, reason: "unsupported-product" };
  }

  const facts = applySubscriptionFacts(
    {
      originalTransactionId,
      productId,
      expiresDate: transaction.expiresDate ?? null,
      environment: transaction.environment ?? null,
      signedDate: transaction.signedDate ?? null,
      appAccountToken: transaction.appAccountToken ?? null,
    },
    status,
    convexSafeJson({
      originalTransactionId,
      productId,
      status: status.status,
      autoRenewStatus: status.autoRenewStatus,
      expiresDate: status.expiresDate,
      revocationDate: status.revocationDate,
      environment: transaction.environment ?? null,
    }),
  );

  await ctx.runMutation(internal.billing.store.upsertPlatformSubscription, {
    userId,
    ...facts,
  });

  return {
    stored: true as const,
    state: facts.state,
    expiresAt: facts.expiresAt,
    productId,
  };
}

/**
 * Redeem a transaction the app just produced, or is restoring.
 *
 * Called with the authenticated user's id, so a purchase made before the
 * account existed — App Review buying on a fresh install, someone restoring
 * onto a second account — still lands somewhere. The `appAccountToken` check in
 * `attribute` means it cannot land on somebody else's account by accident, and
 * a stolen transaction cannot be redeemed twice onto two accounts: the second
 * redemption moves the row, and `upsertPlatformSubscription` recomputes the
 * loser's rollup on the way past.
 */
export const redeemTransaction = internalAction({
  args: { userId: v.string(), signedTransaction: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { stored: true; state: string; expiresAt: number; productId: string }
    | { stored: false; reason: string }
  > => {
    if (!appleBillingConfigured()) {
      return { stored: false, reason: "apple-billing-not-configured" };
    }

    let verified;
    try {
      verified = await verifyInEitherEnvironment((verifier) =>
        verifier.verifyAndDecodeTransaction(args.signedTransaction),
      );
    } catch {
      // Deliberately opaque: the only client that can reach this is one holding
      // a payload Apple did not sign, and it is not owed an explanation.
      return { stored: false, reason: "verification-failed" };
    }

    const originalTransactionId = nonEmptyString(
      verified.payload.originalTransactionId,
    );
    if (!originalTransactionId) {
      return { stored: false, reason: "incomplete-transaction" };
    }

    const lookup = await lookupSubscription(
      originalTransactionId,
      verified.environment,
    );
    if (!lookup) return { stored: false, reason: "not-found-at-apple" };

    const userId = await attribute(ctx, lookup.transaction, args.userId);
    if (!userId) return { stored: false, reason: "unattributed" };

    return await storeSubscription(ctx, userId, lookup);
  },
});

/** Re-read one App Store subscription. The cron and Settings' refresh path. */
export const refreshSubscription = internalAction({
  args: {
    platformSubscriptionId: v.string(),
    userId: v.optional(v.string()),
    environment: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ stored: true } | { stored: false; reason: string }> => {
    if (!appleBillingConfigured()) {
      return { stored: false, reason: "apple-billing-not-configured" };
    }

    const lookup = await lookupSubscription(
      args.platformSubscriptionId,
      args.environment ? environmentFrom(args.environment) : undefined,
    );
    if (!lookup) return { stored: false, reason: "not-found-at-apple" };

    const userId = await attribute(ctx, lookup.transaction, args.userId);
    if (!userId) return { stored: false, reason: "unattributed" };

    const result = await storeSubscription(ctx, userId, lookup);
    return result.stored ? { stored: true } : result;
  },
});

/**
 * An App Store Server Notification V2.
 *
 * Same five steps as the Stripe webhook, for the same reasons: verify before
 * persisting, claim the id so replays are free, re-read from the API rather
 * than trusting the body, and answer 200 for anything that is not worth Apple
 * retrying. Apple retries a non-2xx five times over the following days, which
 * is generous enough that failing loudly on a transient error is the right
 * move and failing loudly on an unknown notification type is not.
 */
export const handleNotification = internalAction({
  args: { payload: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { verified: false; message: string }
    | { verified: true; duplicate?: true; ignored?: true; processed?: true }
  > => {
    if (!appleBillingConfigured()) {
      return { verified: false, message: "apple-billing-not-configured" };
    }

    let notification: ResponseBodyV2DecodedPayload;
    try {
      notification = (
        await verifyInEitherEnvironment((verifier) =>
          verifier.verifyAndDecodeNotification(args.payload),
        )
      ).payload;
    } catch {
      return { verified: false, message: "Invalid signature" };
    }

    const notificationType = notification.notificationType ?? "UNKNOWN";
    const claim = await ctx.runMutation(internal.billing.store.claimEvent, {
      platform: "apple",
      eventId: notification.notificationUUID ?? crypto.randomUUID(),
      eventType: notification.subtype
        ? `${notificationType}.${notification.subtype}`
        : notificationType,
      signedAt: notification.signedDate,
      raw: convexSafeJson({
        notificationType,
        subtype: notification.subtype ?? null,
        environment: notification.data?.environment ?? null,
        bundleId: notification.data?.bundleId ?? null,
      }),
    });
    if (!claim.claimed) return { verified: true, duplicate: true };

    async function finish(
      status: "processed" | "ignored" | "failed",
      detail?: { error?: string; platformSubscriptionId?: string },
    ) {
      await ctx.runMutation(internal.billing.store.finishEvent, {
        eventDocId: claim.eventDocId,
        status,
        error: detail?.error,
        platformSubscriptionId: detail?.platformSubscriptionId,
      });
    }

    if (!appleNotificationIsActionable(notificationType)) {
      await finish("ignored");
      return { verified: true, ignored: true };
    }

    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) {
      await finish("ignored");
      return { verified: true, ignored: true };
    }

    try {
      const environment = environmentFrom(notification.data?.environment);
      const { verifier } = clientsFor(environment);
      const transaction =
        await verifier.verifyAndDecodeTransaction(signedTransaction);
      const originalTransactionId = nonEmptyString(
        transaction.originalTransactionId,
      );
      if (!originalTransactionId) {
        await finish("ignored");
        return { verified: true, ignored: true };
      }

      const userId = await attribute(ctx, transaction);
      if (!userId) {
        // The purchase beat its own redemption call to the server, which is a
        // race the client wins often enough to plan for. Retry once, by which
        // time the app will have redeemed it and minted the attribution.
        await ctx.scheduler.runAfter(
          UNATTRIBUTED_RETRY_MS,
          internal.billing.apple.refreshSubscription,
          {
            platformSubscriptionId: originalTransactionId,
            environment: notification.data?.environment ?? undefined,
          },
        );
        await finish("ignored", {
          platformSubscriptionId: originalTransactionId,
        });
        return { verified: true, ignored: true };
      }

      const lookup = await lookupSubscription(
        originalTransactionId,
        environment,
      );
      if (!lookup) {
        await finish("ignored", {
          platformSubscriptionId: originalTransactionId,
        });
        return { verified: true, ignored: true };
      }

      const stored = await storeSubscription(ctx, userId, lookup);
      if (!stored.stored) {
        await finish("ignored", {
          platformSubscriptionId: originalTransactionId,
        });
        return { verified: true, ignored: true };
      }
      await finish("processed", {
        platformSubscriptionId: originalTransactionId,
      });
      return { verified: true, processed: true };
    } catch (error) {
      await finish("failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
