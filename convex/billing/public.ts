import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action, env, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser, type CurrentUser } from "../lib/auth";
import {
  DEFAULT_MONTHLY_PRICE_LABEL,
  normalizeMonthlyPriceLabel,
} from "../lib/subscriptionPrice";
import { isProCompedForEveryone, rollupForUser } from "./entitlement";
import {
  MONTHLY_PRODUCT_ID,
  PRO_ENTITLEMENT,
  SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
  nonEmptyString,
} from "./types";

/**
 * The stable identifier we hand to the stores.
 *
 * Kept stable across billing implementations so migrated rows and in-flight
 * purchases resolve to the same person.
 */
export function billingAppUserId(user: CurrentUser) {
  return nonEmptyString(user.subject) ?? user._id;
}

function monthlyPriceLabel() {
  return normalizeMonthlyPriceLabel(
    nonEmptyString(env.BILLING_MONTHLY_PRICE_LABEL),
  );
}

const APPROVED_CHECKOUT_ORIGIN = "https://app.onerep.life";

function checkoutReturnUrl(
  name: "BILLING_CHECKOUT_SUCCESS_URL" | "BILLING_CHECKOUT_CANCEL_URL",
  expectedHash: "#success" | "#failed",
) {
  const raw =
    name === "BILLING_CHECKOUT_SUCCESS_URL"
      ? nonEmptyString(env.BILLING_CHECKOUT_SUCCESS_URL)
      : nonEmptyString(env.BILLING_CHECKOUT_CANCEL_URL);
  if (!raw) throw new Error(`${name} is not configured in Convex`);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} is invalid`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== APPROVED_CHECKOUT_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/settings" ||
    parsed.search ||
    parsed.hash !== expectedHash
  ) {
    throw new Error(`${name} is not an approved settings URL`);
  }
  return parsed.toString();
}

/** Serve product ids from the server so pricing changes don't need a release. */
function offering() {
  return {
    entitlementId: PRO_ENTITLEMENT,
    monthlyProductId: MONTHLY_PRODUCT_ID,
    monthlyPriceLabel: monthlyPriceLabel(),
  };
}

/** The status reported while Pro is comped for everyone. */
function compedStatus(appUserId: string, now: number) {
  return {
    appUserId,
    entitlementId: PRO_ENTITLEMENT,
    isActive: true,
    hasActiveSubscription: false,
    activeSubscriptions: [],
    managementUrl: null,
    productIdentifier: null,
    store: null,
    expiresAt: null,
    state: "active" as const,
    autoRenew: false,
    source: "manual" as const,
    fetchedAt: now,
    updatedAt: now,
  };
}

/**
 * The per-user subscription status the app renders and gates on.
 *
 * Recomputes from the stored platform rows and never issues an HTTP request,
 * so a period that elapsed naturally is reflected without waiting for a cron.
 * The client calls `refreshStatus` when it wants a re-read from the platform.
 */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) {
      return {
        appUserId: null,
        checkoutUrl: null,
        webProvider: "stripe" as const,
        offering: offering(),
        monthlyPriceLabel: monthlyPriceLabel(),
        status: null,
        subscriptions: [],
      };
    }

    const appUserId = billingAppUserId(user);
    const now = Date.now();
    const subscriptions = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(20);

    // Recompute from the platform rows so an expiry that has simply elapsed is
    // reflected immediately, without waiting for the revalidation cron.
    const rollup = rollupForUser(appUserId, subscriptions, now);
    const comped = isProCompedForEveryone();
    // A comp must win over a lapsed real subscription, otherwise the UI would
    // show a paywall for access the server is in fact granting.
    const status = comped ? compedStatus(appUserId, now) : rollup;

    return {
      appUserId,
      // Stripe Checkout URLs are minted per session by `createCheckout`.
      checkoutUrl: null,
      webProvider: "stripe" as const,
      offering: offering(),
      monthlyPriceLabel: monthlyPriceLabel(),
      status: status
        ? {
            isActive: status.isActive,
            hasActiveSubscription: status.hasActiveSubscription,
            activeSubscriptions: status.activeSubscriptions,
            managementUrl: status.managementUrl ?? null,
            productIdentifier: status.productIdentifier ?? null,
            store: status.store ?? null,
            expiresAt: status.expiresAt ?? null,
            state: status.state ?? null,
            autoRenew: status.autoRenew ?? null,
            source: status.source,
            fetchedAt: status.fetchedAt,
            updatedAt: "updatedAt" in status ? status.updatedAt : now,
          }
        : null,
      subscriptions: subscriptions.map((subscription) => ({
        platform: subscription.platform,
        productId: subscription.productId,
        state: subscription.state,
        autoRenew: subscription.autoRenew,
        expiresAt: subscription.expiresAt,
      })),
    };
  },
});

/**
 * Everything the client needs to start a native purchase.
 *
 * A mutation-backed action rather than part of `getStatus` because it persists
 * the `appAccountToken` mapping on first use — that record is what lets a store
 * notification for a purchase we never observed still find the right account.
 */
export const getPurchaseContext = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    appAccountToken: string;
    monthlyProductId: string;
    monthlyPriceLabel: string;
  }> => {
    const user = await getAuthUser(ctx);
    const { appAccountToken }: { appAccountToken: string } =
      await ctx.runMutation(
        internal.billing.identity.getOrCreateAppAccountToken,
        { userId: user._id },
      );
    return {
      appAccountToken,
      monthlyProductId: MONTHLY_PRODUCT_ID,
      monthlyPriceLabel: monthlyPriceLabel(),
    };
  },
});

/** Start a Stripe Checkout Session for web purchases. */
export const createCheckout = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const user = await getAuthUser(ctx);
    await ctx.runMutation(internal.security.claim, {
      userId: user._id,
      action: "checkout",
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    const successUrl = checkoutReturnUrl(
      "BILLING_CHECKOUT_SUCCESS_URL",
      "#success",
    );
    const cancelUrl = checkoutReturnUrl(
      "BILLING_CHECKOUT_CANCEL_URL",
      "#failed",
    );

    const session: { url: string } = await ctx.runAction(
      internal.billing.stripe.createCheckoutSession,
      {
        userId: user._id,
        email: user.email,
        successUrl,
        cancelUrl,
      },
    );
    return { url: session.url };
  },
});

/**
 * Redeem a purchase made through the native store.
 *
 * The client sends the signed JWS (iOS) or purchase token (Android) and never
 * grants entitlement itself; the server validates against Apple/Google and
 * writes the state. Only after this succeeds should the client finish or
 * acknowledge the transaction.
 */
export const redeemPurchase = action({
  args: {
    platform: v.union(v.literal("apple"), v.literal("google")),
    // Apple: the JWS transaction. Google: the purchase token.
    receipt: v.string(),
    productId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    granted: boolean;
    state: string | null;
    error?: string;
  }> => {
    const user = await getAuthUser(ctx);
    if (args.receipt.length === 0 || args.receipt.length > 4_096) {
      throw new Error("Receipt must be between 1 and 4096 characters");
    }
    if (args.platform === "apple") {
      return await ctx.runAction(internal.billing.apple.redeemTransaction, {
        userId: user._id,
        signedTransaction: args.receipt,
      });
    }
    return await ctx.runAction(internal.billing.google.redeemPurchaseToken, {
      userId: user._id,
      purchaseToken: args.receipt,
      productId: args.productId ?? MONTHLY_PRODUCT_ID,
    });
  },
});

/**
 * Re-read the user's subscriptions from every platform they hold one on.
 *
 * This is also what "restore purchases" resolves to on web, where there is no
 * store receipt to replay.
 */
export const refreshStatus = action({
  args: {},
  handler: async (ctx): Promise<{ refreshed: number }> => {
    const user = await getAuthUser(ctx);
    const subscriptions: Doc<"billingSubscriptions">[] = await ctx.runQuery(
      internal.billing.store.listSubscriptionsForUser,
      { userId: user._id },
    );

    let refreshed = 0;
    for (const subscription of subscriptions) {
      try {
        if (subscription.platform === "stripe") {
          await ctx.runAction(internal.billing.stripe.refreshSubscription, {
            platformSubscriptionId: subscription.platformSubscriptionId,
            userId: user._id,
          });
        } else if (subscription.platform === "apple") {
          await ctx.runAction(internal.billing.apple.refreshSubscription, {
            originalTransactionId: subscription.platformSubscriptionId,
            userId: user._id,
          });
        } else {
          await ctx.runAction(internal.billing.google.refreshSubscription, {
            purchaseToken: subscription.platformSubscriptionId,
            productId: subscription.productId,
            userId: user._id,
          });
        }
        refreshed += 1;
      } catch {
        // One unreachable store must not block the others; the reconciliation
        // cron will retry.
      }
    }
    return { refreshed };
  },
});

/**
 * Cancel the user's subscription where that is possible for us to do.
 *
 * Apple and Google only allow the account holder to cancel, through their own
 * UI, so those return the management URL for the client to open instead.
 */
/**
 * Hands subscription management to Stripe's Customer Portal.
 *
 * Preferred over `cancelSubscription`: the portal covers cancelling, resuming,
 * swapping payment methods, and downloading invoices, and it stays correct as
 * Stripe changes its own billing rules. Under Managed Payments the buyer also
 * has Link's own order page, but the portal is the surface we can link to
 * directly from Settings.
 *
 * Store subscriptions are not Stripe's to manage, so those still return the
 * platform's own deep link.
 */
export const createManagementSession = action({
  args: {},
  handler: async (
    ctx,
    _args,
  ): Promise<
    | { kind: "portal"; url: string }
    | { kind: "store"; url: string }
    | { kind: "none"; reason: string }
  > => {
    const user = await getAuthUser(ctx);
    const subscriptions: Doc<"billingSubscriptions">[] = await ctx.runQuery(
      internal.billing.store.listSubscriptionsForUser,
      { userId: user._id },
    );

    const stripeSubscription = subscriptions.find(
      (subscription) =>
        subscription.platform === "stripe" &&
        subscription.state !== "expired" &&
        subscription.state !== "refunded",
    );
    if (stripeSubscription?.platformCustomerId) {
      const { url }: { url: string } = await ctx.runAction(
        internal.billing.stripe.createPortalSession,
        {
          customerId: stripeSubscription.platformCustomerId,
          // Reuses the vetted checkout return URL, which is already pinned to
          // the approved origin.
          returnUrl: checkoutReturnUrl(
            "BILLING_CHECKOUT_SUCCESS_URL",
            "#success",
          ),
        },
      );
      return { kind: "portal", url };
    }

    const native = subscriptions.find(
      (subscription) =>
        subscription.platform !== "stripe" &&
        subscription.state !== "expired" &&
        subscription.state !== "refunded",
    );
    if (native) {
      return {
        kind: "store",
        url:
          native.platform === "google"
            ? "https://play.google.com/store/account/subscriptions"
            : "https://apps.apple.com/account/subscriptions",
      };
    }

    return {
      kind: "none",
      reason: stripeSubscription
        ? "This subscription has no Stripe customer on record yet. Try again in a moment."
        : "No active subscription to manage.",
    };
  },
});

export const cancelSubscription = action({
  args: {},
  handler: async (
    ctx,
    _args,
  ): Promise<
    | { canceled: true; expiresAt: number }
    | { canceled: false; managementUrl: string | null; reason: string }
  > => {
    const user = await getAuthUser(ctx);
    const subscriptions: Doc<"billingSubscriptions">[] = await ctx.runQuery(
      internal.billing.store.listSubscriptionsForUser,
      { userId: user._id },
    );

    const stripeSubscription = subscriptions.find(
      (subscription) =>
        subscription.platform === "stripe" &&
        subscription.state !== "expired" &&
        subscription.state !== "refunded",
    );
    if (stripeSubscription) {
      const result: { canceledAt: number } = await ctx.runAction(
        internal.billing.stripe.cancelSubscription,
        {
          userId: user._id,
          platformSubscriptionId: stripeSubscription.platformSubscriptionId,
        },
      );
      return { canceled: true, expiresAt: result.canceledAt };
    }

    const native = subscriptions.find(
      (subscription) => subscription.platform !== "stripe",
    );
    return {
      canceled: false,
      managementUrl:
        native?.platform === "google"
          ? "https://play.google.com/store/account/subscriptions"
          : "https://apps.apple.com/account/subscriptions",
      reason: native
        ? "Store subscriptions must be cancelled from the store account that bought them."
        : "No active subscription to cancel.",
    };
  },
});

/**
 * Replay store purchases found on the device against this account.
 *
 * If a store subscription already belongs to a different OneRep account we
 * refuse rather than silently transferring it — keeping it with the original
 * owner is the safer default, and support can move it deliberately.
 */
export const restorePurchases = action({
  args: {
    platform: v.union(v.literal("apple"), v.literal("google")),
    receipts: v.array(
      v.object({ receipt: v.string(), productId: v.optional(v.string()) }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ restored: number; conflicts: number }> => {
    const user = await getAuthUser(ctx);
    await ctx.runMutation(internal.security.claim, {
      userId: user._id,
      action: "purchase_restore",
      limit: 2,
      windowMs: 60 * 60 * 1000,
    });
    const deduplicated = Array.from(
      new Map(args.receipts.map((item) => [item.receipt, item])).values(),
    );
    if (deduplicated.length > 20) {
      throw new Error("A restore batch can contain at most 20 unique receipts");
    }
    if (
      deduplicated.some(
        (item) => item.receipt.length === 0 || item.receipt.length > 4_096,
      )
    ) {
      throw new Error("Receipt must be between 1 and 4096 characters");
    }
    let restored = 0;
    let conflicts = 0;

    for (const item of deduplicated) {
      const result: { granted: boolean; error?: string } =
        args.platform === "apple"
          ? await ctx.runAction(internal.billing.apple.redeemTransaction, {
              userId: user._id,
              signedTransaction: item.receipt,
            })
          : await ctx.runAction(internal.billing.google.redeemPurchaseToken, {
              userId: user._id,
              purchaseToken: item.receipt,
              productId: item.productId ?? MONTHLY_PRODUCT_ID,
            });

      if (result.error === SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT) {
        conflicts += 1;
      } else if (result.granted) {
        restored += 1;
      }
    }

    return { restored, conflicts };
  },
});

export { DEFAULT_MONTHLY_PRICE_LABEL };
