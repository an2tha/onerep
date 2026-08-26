import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

/**
 * Inbound billing notification route.
 *
 * Two of them: Stripe on the web, App Store Server Notifications V2 from the
 * iOS app. Play RTDN has no endpoint because Play billing has no code behind
 * it any more.
 *
 * Both handlers follow the same shape:
 *   1. read the raw body as text *before* parsing — Stripe's signature is
 *      computed over exact bytes, and Apple's payload *is* a signature;
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

/**
 * App Store Server Notifications V2.
 *
 * The whole body is a single JWS, so there is no signature header to read and
 * nothing to compare it against but Apple's root certificate. A 401 here means
 * a payload Apple did not sign, which is not something Apple will fix by
 * retrying; anything that throws downstream answers 500, which it will retry
 * five times over the next few days.
 */
export const appleNotification = httpAction(async (ctx, request) => {
  const body = await request.text();
  let payload: string | undefined;
  try {
    payload = JSON.parse(body)?.signedPayload;
  } catch {
    return new Response("Malformed body", { status: 400 });
  }
  if (typeof payload !== "string" || payload.length === 0) {
    return new Response("Missing signedPayload", { status: 400 });
  }

  const result = await ctx.runAction(internal.billing.apple.handleNotification, {
    payload,
  });

  if (!result.verified) {
    return new Response("Invalid signature", { status: 401 });
  }
  return new Response(null, { status: 200 });
});
