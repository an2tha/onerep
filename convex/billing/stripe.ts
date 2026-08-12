"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { provider } from "./provider";

/**
 * Internal billing actions for web billing.
 *
 * This module owns the action registrations (so the
 * `internal.billing.stripe.*` references stay stable) and nothing else. The
 * actual payment work is delegated to `./provider`, a gitignored module: the
 * stub in the open repository, a private implementation in production. See
 * `providerTypes.ts` for the contract and the rationale.
 *
 * `"use node"` because the private provider needs the Node runtime for the
 * platform SDK; the modules cannot host queries or mutations, so every
 * database write goes through `convex/billing/store.ts`.
 */

export { stripeStateFor } from "./stripeState";

/** Create a Checkout Session for the monthly plan. */
export const createCheckoutSession = internalAction({
  args: {
    userId: v.string(),
    email: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => provider.createCheckoutSession(ctx, args),
});

/** A customer portal session for self-serve subscription management. */
export const createPortalSession = internalAction({
  args: { customerId: v.string(), returnUrl: v.string() },
  handler: async (ctx, args) => provider.createPortalSession(ctx, args),
});

/** Cancel at period end, so the customer keeps what they already paid for. */
export const cancelSubscription = internalAction({
  args: { userId: v.string(), platformSubscriptionId: v.string() },
  handler: async (ctx, args) => provider.cancelSubscription(ctx, args),
});

/** Re-read one subscription from the platform and store the result. */
export const refreshSubscription = internalAction({
  args: { platformSubscriptionId: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => provider.refreshSubscription(ctx, args),
});

/** Verify and process an inbound billing webhook. */
export const handleWebhook = internalAction({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, args) => provider.handleWebhook(ctx, args),
});
