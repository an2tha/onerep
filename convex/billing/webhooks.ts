import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

/**
 * Inbound billing notification route.
 *
 * Stripe is the only payment provider: subscriptions are sold on the web and
 * there is no in-app purchase path, so there are no App Store Server
 * Notification or Play RTDN endpoints to serve.
 *
 * The handler follows the shape the platform requires:
 *   1. read the raw body as text *before* parsing — Stripe's signature is
 *      computed over exact bytes;
 *   2. verify the signature, returning 401 without persisting anything;
 *   3. claim the event id for idempotency, so replays are free;
 *   4. fetch authoritative state from Stripe rather than trusting the
 *      notification body, which makes out-of-order delivery harmless;
 *   5. return 200 for handled-or-ignored, and 500 only for transient failures
 *      that are worth Stripe retrying.
 */

export const stripeWebhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 401 });

  const payload = await request.text();
  const result = await ctx.runAction(internal.billing.stripe.handleWebhook, {
    payload,
    signature,
  });

  if (!result.verified) {
    return new Response("Invalid signature", { status: 401 });
  }
  return new Response(null, { status: 200 });
});
