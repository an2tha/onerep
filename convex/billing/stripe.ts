"use node";

import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "../_generated/api";
import { env, internalAction, type ActionCtx } from "../_generated/server";
import { MONTHLY_PRODUCT_ID, nonEmptyString, type BillingState } from "./types";

/**
 * Stripe client and normalizer for web billing.
 *
 * Runs in the Node runtime so we can use the official SDK, including
 * `constructEventAsync` for webhook signature verification. Stripe volume is
 * low enough that the Node cold start does not matter here.
 *
 * This file exports only actions: `"use node"` modules cannot host queries or
 * mutations, so every database write goes through `convex/billing/store.ts`.
 */

function stripeClient() {
  const apiKey = nonEmptyString(env.STRIPE_SECRET_KEY);
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured in Convex");
  }
  return new Stripe(apiKey, { apiVersion: "2026-07-29.dahlia" });
}

/**
 * Map a Stripe subscription status onto our entitlement state machine.
 *
 * `past_due` intentionally maps to `billing_retry` rather than revoking: Stripe
 * Smart Retries are still working the card, and cutting access off mid-dunning
 * churns customers who would otherwise recover.
 */
export function stripeStateFor(
  subscription: Stripe.Subscription,
): BillingState {
  switch (subscription.status) {
    case "active":
    case "trialing":
      return subscription.cancel_at_period_end ? "canceled" : "active";
    case "past_due":
      return "billing_retry";
    case "paused":
      return "paused";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "expired";
    case "incomplete":
      return "expired";
    default:
      return "expired";
  }
}

function periodEndMs(subscription: Stripe.Subscription) {
  // Stripe moved the period boundary onto subscription items; fall back to the
  // top-level field for older API shapes.
  const itemEnd = subscription.items?.data?.[0]?.current_period_end;
  const raw =
    itemEnd ??
    (subscription as unknown as { current_period_end?: number })
      .current_period_end;
  return typeof raw === "number" ? raw * 1000 : Date.now();
}

function customerIdOf(subscription: Stripe.Subscription) {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

function productIdOf(subscription: Stripe.Subscription) {
  return (
    nonEmptyString(subscription.items?.data?.[0]?.price?.id) ??
    MONTHLY_PRODUCT_ID
  );
}

/**
 * Resolve the OneRep user a Stripe subscription belongs to.
 *
 * Checkout carries the user id in `client_reference_id` and we copy it into
 * subscription metadata, but a subscription created outside our flow (or an
 * older one) may only be reachable via the recorded checkout session or the
 * customer id we already stored.
 */
async function resolveUserId(
  ctx: ActionCtx,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = nonEmptyString(subscription.metadata?.onerepUserId);
  if (fromMetadata) return fromMetadata;

  const existing = await ctx.runQuery(
    internal.billing.store.getSubscriptionByPlatformId,
    { platform: "stripe", platformSubscriptionId: subscription.id },
  );
  if (existing) return existing.userId;

  return await ctx.runQuery(internal.billing.store.findUserIdByStripeCustomer, {
    stripeCustomerId: customerIdOf(subscription),
  });
}

/** Persist a Stripe subscription, using the platform response as the truth. */
async function storeSubscription(
  ctx: ActionCtx,
  subscription: Stripe.Subscription,
  userId: string,
  /**
   * When the observed state was true, in ms. `subscription.created` is fixed
   * for the life of the subscription and so is useless as an ordering guard —
   * callers pass the triggering event's timestamp, and a direct API read
   * defaults to now because it is by definition current.
   */
  observedAt: number = Date.now(),
) {
  const state = stripeStateFor(subscription);
  const expiresAt = periodEndMs(subscription);
  await ctx.runMutation(internal.billing.store.upsertPlatformSubscription, {
    userId,
    platform: "stripe",
    platformSubscriptionId: subscription.id,
    platformCustomerId: customerIdOf(subscription),
    productId: productIdOf(subscription),
    state,
    autoRenew: !subscription.cancel_at_period_end && state !== "expired",
    expiresAt,
    environment: subscription.livemode ? "production" : "sandbox",
    sourceUpdatedAt: observedAt,
    latestRaw: {
      id: subscription.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      livemode: subscription.livemode,
    },
  });
  return { state, expiresAt };
}

/** Create a Checkout Session for the monthly plan. */
export const createCheckoutSession = internalAction({
  args: {
    userId: v.string(),
    email: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const priceId = nonEmptyString(env.STRIPE_PRICE_ID_MONTHLY);
    if (!priceId) {
      throw new Error("STRIPE_PRICE_ID_MONTHLY is not configured in Convex");
    }
    const stripe = stripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      client_reference_id: args.userId,
      customer_email: args.email,
      // Stripe acts as merchant of record: it handles indirect tax compliance
      // across 80+ countries, fraud, disputes, and transaction support, so
      // OneRep does not need a local entity per country. The trade is that the
      // buyer sees Link as the merchant ("Sold through Link"), not OneRep.
      //
      // Requires accepting the Managed Payments terms in the Stripe dashboard;
      // without that, session creation fails outright. Only applies to new
      // subscriptions — existing ones cannot be moved onto it.
      managed_payments: { enabled: true },
      // Carry the identity onto the subscription itself so webhooks can
      // attribute it without a session lookup.
      subscription_data: { metadata: { onerepUserId: args.userId } },
      metadata: { onerepUserId: args.userId },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");

    await ctx.runMutation(internal.billing.store.recordCheckout, {
      userId: args.userId,
      sessionId: session.id,
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : undefined,
      status: session.status ?? "open",
    });

    return { url: session.url, sessionId: session.id };
  },
});

/** Cancel at period end, so the customer keeps what they already paid for. */
export const cancelSubscription = internalAction({
  args: { userId: v.string(), platformSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const stripe = stripeClient();
    const updated = await stripe.subscriptions.update(
      args.platformSubscriptionId,
      { cancel_at_period_end: true },
    );
    await storeSubscription(ctx, updated, args.userId);
    return { canceledAt: periodEndMs(updated) };
  },
});

/** Re-read one subscription from Stripe and store the result. */
export const refreshSubscription = internalAction({
  args: { platformSubscriptionId: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const stripe = stripeClient();
    const subscription = await stripe.subscriptions.retrieve(
      args.platformSubscriptionId,
    );
    const userId = args.userId ?? (await resolveUserId(ctx, subscription));
    if (!userId) return { stored: false as const, reason: "unattributed" };
    await storeSubscription(ctx, subscription, userId);
    return { stored: true as const };
  },
});

/**
 * Verify and process a Stripe webhook.
 *
 * The raw body is passed through untouched — the signature is computed over
 * exact bytes, so parsing before verifying would break it. The event body is
 * used only to identify *which* subscription changed; the state itself is then
 * re-read from the Stripe API, which makes out-of-order delivery harmless.
 */
export const handleWebhook = internalAction({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    const webhookSecret = nonEmptyString(env.STRIPE_WEBHOOK_SECRET);
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured in Convex");
    }
    const stripe = stripeClient();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        args.payload,
        args.signature,
        webhookSecret,
      );
    } catch (error) {
      return {
        verified: false as const,
        message: error instanceof Error ? error.message : "bad signature",
      };
    }

    const claim = await ctx.runMutation(internal.billing.store.claimEvent, {
      platform: "stripe",
      eventId: event.id,
      eventType: event.type,
      signedAt: event.created * 1000,
    });
    if (!claim.claimed) {
      return { verified: true as const, duplicate: true as const };
    }

    try {
      const subscriptionId = subscriptionIdForEvent(event);
      if (!subscriptionId) {
        await ctx.runMutation(internal.billing.store.finishEvent, {
          eventDocId: claim.eventDocId,
          status: "ignored",
        });
        return { verified: true as const, ignored: true as const };
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId =
        (await userIdFromEvent(ctx, event)) ??
        (await resolveUserId(ctx, subscription));

      if (!userId) {
        await ctx.runMutation(internal.billing.store.finishEvent, {
          eventDocId: claim.eventDocId,
          status: "failed",
          error: "Could not attribute the subscription to a OneRep user",
          platformSubscriptionId: subscriptionId,
        });
        return { verified: true as const, unattributed: true as const };
      }

      await storeSubscription(ctx, subscription, userId, event.created * 1000);
      await ctx.runMutation(internal.billing.store.finishEvent, {
        eventDocId: claim.eventDocId,
        status: "processed",
        platformSubscriptionId: subscriptionId,
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

function subscriptionIdForEvent(event: Stripe.Event): string | undefined {
  const object = event.data.object as unknown as Record<string, unknown>;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return typeof object.subscription === "string"
        ? object.subscription
        : undefined;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return nonEmptyString(object.id);
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const direct = nonEmptyString(object.subscription);
      if (direct) return direct;
      // Newer invoice shapes nest the subscription on the line items.
      const lines = (object.lines as { data?: unknown[] } | undefined)?.data;
      const first = lines?.[0] as
        | { subscription?: unknown; parent?: Record<string, unknown> }
        | undefined;
      return (
        nonEmptyString(first?.subscription) ??
        nonEmptyString(
          (
            first?.parent?.subscription_item_details as
              Record<string, unknown> | undefined
          )?.subscription,
        )
      );
    }
    default:
      return undefined;
  }
}

async function userIdFromEvent(ctx: ActionCtx, event: Stripe.Event) {
  const object = event.data.object as unknown as Record<string, unknown>;
  const direct =
    nonEmptyString(object.client_reference_id) ??
    nonEmptyString(
      (object.metadata as Record<string, unknown> | undefined)?.onerepUserId,
    );
  if (direct) return direct;

  if (event.type.startsWith("checkout.session.")) {
    const sessionId = nonEmptyString(object.id);
    if (sessionId) {
      const checkout = await ctx.runQuery(
        internal.billing.store.findCheckoutBySessionId,
        { sessionId },
      );
      return checkout?.userId ?? null;
    }
  }
  return null;
}
