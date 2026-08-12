import type { ActionCtx } from "../_generated/server";

/**
 * The seam between the open codebase and whatever actually moves money.
 *
 * `convex/billing/stripe.ts` registers the internal actions and delegates every
 * call to a module at `./provider` that satisfies this interface. That module
 * is generated, gitignored, and comes in two flavors:
 *
 *   - the checked-in stub (`provider.stub.ts`, copied into place by
 *     `scripts/ensure-billing-provider.mjs`), which declines politely; or
 *   - a private implementation that is not in this repository and never
 *     will be.
 *
 * If you are reading this in the open-source tree and wondering where the
 * payment code went: that's the point.
 */
export interface BillingProvider {
  createCheckoutSession(
    ctx: ActionCtx,
    args: {
      userId: string;
      email?: string;
      successUrl: string;
      cancelUrl: string;
    },
  ): Promise<{ url: string; sessionId: string }>;

  createPortalSession(
    ctx: ActionCtx,
    args: { customerId: string; returnUrl: string },
  ): Promise<{ url: string }>;

  cancelSubscription(
    ctx: ActionCtx,
    args: { userId: string; platformSubscriptionId: string },
  ): Promise<{ canceledAt: number }>;

  refreshSubscription(
    ctx: ActionCtx,
    args: { platformSubscriptionId: string; userId?: string },
  ): Promise<{ stored: true } | { stored: false; reason: string }>;

  handleWebhook(
    ctx: ActionCtx,
    args: { payload: string; signature: string },
  ): Promise<
    | { verified: false; message: string }
    | {
        verified: true;
        duplicate?: true;
        ignored?: true;
        unattributed?: true;
        processed?: true;
      }
  >;
}
