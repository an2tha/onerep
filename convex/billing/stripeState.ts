import type Stripe from "stripe";
import type { BillingState } from "./types";

/**
 * Map a Stripe subscription status onto our entitlement state machine.
 *
 * `past_due` intentionally maps to `billing_retry` rather than revoking: Stripe
 * Smart Retries are still working the card, and cutting access off mid-dunning
 * churns customers who would otherwise recover.
 *
 * Pure and side-effect free, which is why it lives here and not in the
 * provider: the tests want it, and the tests don't get to see the provider.
 */
export function stripeStateFor(
  subscription: Pick<Stripe.Subscription, "status" | "cancel_at_period_end">,
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
