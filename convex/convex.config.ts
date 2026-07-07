import { defineApp } from "convex/server";
import { v } from "convex/values";
import crons from "@convex-dev/crons/convex.config.js";
import betterAuth from "@convex-dev/better-auth/convex.config";

const app = defineApp({
  env: {
    OPENAI_API_KEY: v.optional(v.string()),
    OPENAI_WORKOUT_PRESET_MODEL: v.optional(v.string()),
    OPENAI_METRIC_MODEL: v.optional(v.string()),
    OPENAI_COACH_MODEL: v.optional(v.string()),
    REVENUECAT_SECRET_KEY: v.optional(v.string()),
    REVENUECAT_PUBLIC_SDK_KEY: v.optional(v.string()),
    REVENUECAT_WEB_CHECKOUT_URL: v.optional(v.string()),
    REVENUECAT_MONTHLY_PRICE_LABEL: v.optional(v.string()),
  },
});
app.use(crons);
app.use(betterAuth);
export default app;
