import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action, env, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser, type CurrentUser } from "../lib/auth";
import {
  DEFAULT_MONTHLY_PRICE_LABEL,
  normalizeMonthlyPriceLabel,
} from "../lib/subscriptionPrice";
import { isProCompedForEveryone, rollupForUser } from "./entitlement";
import { MONTHLY_PRODUCT_ID, PRO_ENTITLEMENT, nonEmptyString } from "./types";

/**
 * OneRep Pro is sold on the web through Stripe and nowhere else.
 *
 * There is no in-app purchase path on any platform, so this module exposes no
 * receipt redemption or restore endpoint — a client cannot present a store
 * receipt for the server to honour, and legacy App Store / Play rows no longer
 * grant the entitlement.
 */

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

/** Start a Stripe Checkout Session. This is the only way to buy OneRep Pro. */
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
 * Re-read the user's Stripe subscriptions.
 *
 * This is what the client's "refresh" control resolves to. Legacy App Store and
 * Play rows are skipped: we no longer hold credentials for those APIs, and they
 * no longer grant the entitlement.
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
      if (subscription.platform !== "stripe") continue;
      try {
        await ctx.runAction(internal.billing.stripe.refreshSubscription, {
          platformSubscriptionId: subscription.platformSubscriptionId,
          userId: user._id,
        });
        refreshed += 1;
      } catch {
        // A transient Stripe failure must not surface as an error here; the
        // reconciliation cron will retry.
      }
    }
    return { refreshed };
  },
});

/**
 * Hands subscription management to Stripe's Customer Portal.
 *
 * Preferred over `cancelSubscription`: the portal covers cancelling, resuming,
 * swapping payment methods, and downloading invoices, and it stays correct as
 * Stripe changes its own billing rules. Under Managed Payments the buyer also
 * has Link's own order page, but the portal is the surface we can link to
 * directly from Settings.
 */
export const createManagementSession = action({
  args: {},
  handler: async (
    ctx,
    _args,
  ): Promise<
    { kind: "portal"; url: string } | { kind: "none"; reason: string }
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

    return {
      kind: "none",
      reason: stripeSubscription
        ? "This subscription has no Stripe customer on record yet. Try again in a moment."
        : "No active subscription to manage.",
    };
  },
});

/** Cancel the user's Stripe subscription at the end of the paid period. */
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

    return {
      canceled: false,
      managementUrl: null,
      reason: "No active subscription to cancel.",
    };
  },
});

export { DEFAULT_MONTHLY_PRICE_LABEL };
