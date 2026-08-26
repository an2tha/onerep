import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action, env, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser, type CurrentUser } from "../lib/auth";
import {
  DEFAULT_MONTHLY_PRICE_LABEL,
  normalizeMonthlyPriceLabel,
} from "../lib/subscriptionPrice";
import {
  isProCompedForEveryone,
  rollupForUser,
  subscriptionGrantsAccess,
} from "./entitlement";
import { MONTHLY_PRODUCT_ID, PRO_ENTITLEMENT, nonEmptyString } from "./types";

/**
 * OneRep Pro is sold two ways: Stripe Checkout on the web, and StoreKit 2 in
 * the iOS app.
 *
 * Both end in the same place. A purchase produces a row in
 * `billingSubscriptions`, the rollup reduces every row a user holds to one
 * entitlement, and nothing downstream asks where the money came from. A
 * subscriber who bought on the web keeps Pro on their phone; one who bought on
 * the phone keeps it in a browser.
 *
 * What the client is trusted with, exactly: handing over a payload Apple
 * signed. Everything else — whether that payload is genuine, whose it is, and
 * whether it still entitles anyone to anything — is decided in
 * `convex/billing/apple.ts` against Apple's own API.
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

/** Where an App Store subscriber cancels. Apple owns that screen; we link. */
const APPLE_MANAGEMENT_URL = "https://apps.apple.com/account/subscriptions";

/**
 * Whether the server can verify App Store purchases at all.
 *
 * Read from the environment rather than by importing `apple.ts`, which is a
 * Node module and cannot be pulled into a V8 query. The app uses this to
 * decide whether to show a purchase button, so a half-configured deployment
 * shows no button rather than one that fails on tap.
 */
function appleBillingAvailable() {
  return (
    nonEmptyString(env.BILLING_APPLE_ISSUER_ID) !== undefined &&
    nonEmptyString(env.BILLING_APPLE_KEY_ID) !== undefined &&
    nonEmptyString(env.BILLING_APPLE_PRIVATE_KEY) !== undefined
  );
}

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
        appleProvider: appleBillingAvailable(),
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
      appleProvider: appleBillingAvailable(),
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

    // Refuse to sell Pro to someone who already owns it. Without this, a user
    // whose entitlement hasn't surfaced yet presses Continue again and ends up
    // with two Stripe customers, two live subscriptions, and two charges a
    // month — of which the app can only ever cancel the first.
    const existing: Doc<"billingSubscriptions">[] = await ctx.runQuery(
      internal.billing.store.listSubscriptionsForUser,
      { userId: user._id },
    );
    const now = Date.now();
    if (existing.some((row) => subscriptionGrantsAccess(row, now))) {
      throw new Error(
        "You're already on OneRep Pro. Manage the plan you have from Settings.",
      );
    }

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
 * The `appAccountToken` the app attaches to an App Store purchase.
 *
 * Minted once per account and never rotated. The app asks for it before every
 * purchase rather than caching it, because the cost is one query and the
 * failure mode of a stale cache is a renewal three years from now that nothing
 * can attribute to anyone.
 */
export const getStoreIdentity = action({
  args: {},
  handler: async (ctx): Promise<{ appAccountToken: string }> => {
    const user = await getAuthUser(ctx);
    const appAccountToken: string = await ctx.runMutation(
      internal.billing.store.ensureAppAccountToken,
      { userId: user._id, token: crypto.randomUUID() },
    );
    return { appAccountToken };
  },
});

/**
 * Hand over a StoreKit transaction for verification.
 *
 * Serves both purchase and restore — they are the same operation from here,
 * and the app calls this for every transaction StoreKit reports, including the
 * ones that arrive unprompted through `Transaction.updates` when a renewal or
 * a family-sharing change lands while the app happens to be open.
 *
 * The rate limit is generous because a legitimate restore on an account with
 * several products is several calls in a row, and stingy enough that a client
 * grinding forged payloads against the verifier gives up early.
 */
export const redeemAppleTransaction = action({
  args: { signedTransaction: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ redeemed: boolean; reason?: string }> => {
    const user = await getAuthUser(ctx);
    await ctx.runMutation(internal.security.claim, {
      userId: user._id,
      action: "purchase_restore",
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });

    const result = await ctx.runAction(internal.billing.apple.redeemTransaction, {
      userId: user._id,
      signedTransaction: args.signedTransaction,
    });

    // Property-presence narrowing rather than the `stored` discriminant:
    // `tsconfig.app.json` turns strictNullChecks off, and without it a boolean
    // literal discriminant does not narrow. See the note in `mcp/oauthServer`.
    if (!("reason" in result)) return { redeemed: true };
    return { redeemed: false, reason: result.reason };
  },
});

/**
 * Re-read the user's subscriptions from whoever is billing them.
 *
 * Stripe and Apple both; Play rows are skipped, having no credentials behind
 * them any more. A failure on one platform must not sink the others, which is
 * why each is tried in its own try block and the count is of successes.
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
          refreshed += 1;
        } else if (subscription.platform === "apple") {
          await ctx.runAction(internal.billing.apple.refreshSubscription, {
            platformSubscriptionId: subscription.platformSubscriptionId,
            userId: user._id,
            environment: subscription.environment,
          });
          refreshed += 1;
        }
      } catch {
        // A transient store failure must not surface as an error here; the
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
    // Apple owns cancellation and payment method changes for anything bought
    // through StoreKit; there is no server-side portal to mint, only a URL that
    // deep-links into the Settings app.
    const appleSubscription = subscriptions.find(
      (subscription) =>
        subscription.platform === "apple" &&
        subscription.state !== "expired" &&
        subscription.state !== "refunded",
    );
    if (appleSubscription && !stripeSubscription) {
      return { kind: "store", url: APPLE_MANAGEMENT_URL };
    }

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
    if (!stripeSubscription) {
      const appleSubscription = subscriptions.find(
        (subscription) =>
          subscription.platform === "apple" &&
          subscription.state !== "expired" &&
          subscription.state !== "refunded",
      );
      if (appleSubscription) {
        // Apple does not let an app cancel its own subscription, and it is not
        // being difficult: the charge is Apple's, so the off switch is Apple's.
        return {
          canceled: false,
          managementUrl: APPLE_MANAGEMENT_URL,
          reason: "Manage this subscription in the App Store.",
        };
      }
    }

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
