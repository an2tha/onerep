import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

/**
 * Inbound store notification routes.
 *
 * Every handler follows the same shape:
 *   1. read the raw body as text *before* parsing — Stripe's signature and
 *      Apple's JWS are computed over exact bytes;
 *   2. verify the signature/token, returning 401 without persisting anything;
 *   3. claim the event id for idempotency, so replays are free;
 *   4. fetch authoritative state from the platform API rather than trusting the
 *      notification body, which makes out-of-order delivery harmless;
 *   5. return 200 for handled-or-ignored, and 500 only for transient failures
 *      that are worth the platform retrying.
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

export const appleNotifications = httpAction(async (ctx, request) => {
  const body = await request.text();
  let signedPayload: string | undefined;
  try {
    const parsed = JSON.parse(body) as { signedPayload?: unknown };
    signedPayload =
      typeof parsed.signedPayload === "string"
        ? parsed.signedPayload
        : undefined;
  } catch {
    return new Response("Malformed body", { status: 400 });
  }
  if (!signedPayload) {
    return new Response("Missing signedPayload", { status: 400 });
  }

  const result = await ctx.runAction(
    internal.billing.apple.handleNotification,
    {
      signedPayload,
    },
  );
  if (!result.verified) {
    return new Response("Invalid signature", { status: 401 });
  }
  return new Response(null, { status: 200 });
});

export const googleRtdn = httpAction(async (ctx, request) => {
  // Pub/Sub push authenticates with an OIDC bearer token, not a body signature.
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7)
    : null;
  if (!token) return new Response("Missing bearer token", { status: 401 });

  const body = await request.text();
  const result = await ctx.runAction(internal.billing.google.handleRtdn, {
    token,
    payload: body,
  });
  if ("unconfigured" in result && result.unconfigured) {
    return new Response("Google billing is not configured", { status: 503 });
  }
  if (!result.verified) {
    return new Response("Invalid token", { status: 401 });
  }
  return new Response(null, { status: 200 });
});
