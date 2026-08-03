import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import {
  appleNotifications,
  googleRtdn,
  stripeWebhook,
} from "./billing/webhooks";
import {
  authComponent,
  createAuth,
  googleAuthConfigured,
  trustedOrigins,
} from "./lib/auth";

const http = httpRouter();

/**
 * Which social sign-in buttons the login screen should render. This has to be
 * an HTTP route rather than a query: the Convex client runs with
 * `expectAuth: true`, so it holds queries until a session exists, and the
 * login screen by definition has none. Reports configuration only, never a
 * credential.
 */
function socialProvidersCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({ Vary: "Origin" });
  if (origin && trustedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

http.route({
  path: "/auth-providers",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const headers = socialProvidersCorsHeaders(request);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(null, { status: 204, headers });
  }),
});

http.route({
  path: "/auth-providers",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const headers = socialProvidersCorsHeaders(request);
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "public, max-age=300");
    return new Response(JSON.stringify({ google: googleAuthConfigured }), {
      headers,
    });
  }),
});

authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: trustedOrigins,
  },
});

http.route({
  path: "/billing/stripe/webhook",
  method: "POST",
  handler: stripeWebhook,
});
http.route({
  path: "/billing/apple/notifications",
  method: "POST",
  handler: appleNotifications,
});
http.route({
  path: "/billing/google/rtdn",
  method: "POST",
  handler: googleRtdn,
});

export default http;
