import { defineApp } from "convex/server";
import { v } from "convex/values";
import crons from "@convex-dev/crons/convex.config.js";
import betterAuth from "@convex-dev/better-auth/convex.config";
import revenuecat from "convex-revenuecat/convex.config";

const app = defineApp({
  env: {
    AI_GATEWAY_API_KEY: v.optional(v.string()),
    AI_GATEWAY_MODEL: v.optional(v.string()),
    REVENUECAT_SECRET_KEY: v.optional(v.string()),
    REVENUECAT_API_V2_SECRET_KEY: v.optional(v.string()),
    REVENUECAT_PROJECT_ID: v.optional(v.string()),
    REVENUECAT_PUBLIC_SDK_KEY: v.optional(v.string()),
    REVENUECAT_WEB_CHECKOUT_URL: v.optional(v.string()),
    REVENUECAT_MONTHLY_PRICE_LABEL: v.optional(v.string()),
    REVENUECAT_WEBHOOK_AUTH: v.optional(v.string()),
  },
});
app.use(crons);
app.use(betterAuth);
app.use(revenuecat);
export default app;
