import { httpRouter } from "convex/server";
import {
  appleNotifications,
  googleRtdn,
  stripeWebhook,
} from "./billing/webhooks";
import { authComponent, createAuth, trustedOrigins } from "./lib/auth";

const http = httpRouter();

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
