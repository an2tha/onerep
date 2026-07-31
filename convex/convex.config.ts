import { defineApp } from "convex/server";
import { v } from "convex/values";
import crons from "@convex-dev/crons/convex.config.js";
import betterAuth from "@convex-dev/better-auth/convex.config";

const app = defineApp({
  env: {
    OPENAI_API_KEY: v.optional(v.string()),
    OPENAI_MODEL: v.optional(v.string()),
    // Temporary compatibility for installed app versions that still bootstrap
    // the old native purchase SDK. Remove after those versions are retired.
    REVENUECAT_PUBLIC_SDK_KEY: v.optional(v.string()),
    STRIPE_SECRET_KEY: v.optional(v.string()),
    STRIPE_WEBHOOK_SECRET: v.optional(v.string()),
    STRIPE_PRICE_ID_MONTHLY: v.optional(v.string()),
    BILLING_COMP_ALL_USERS: v.optional(v.string()),
    BILLING_MONTHLY_PRICE_LABEL: v.optional(v.string()),
    BILLING_CHECKOUT_SUCCESS_URL: v.optional(v.string()),
    BILLING_CHECKOUT_CANCEL_URL: v.optional(v.string()),
    APPLE_ISSUER_ID: v.optional(v.string()),
    APPLE_KEY_ID: v.optional(v.string()),
    APPLE_PRIVATE_KEY: v.optional(v.string()),
    APPLE_BUNDLE_ID: v.optional(v.string()),
    APPLE_ENVIRONMENT: v.optional(v.string()),
    // Apple Root CA - G3, PEM encoded. Download from
    // https://www.apple.com/certificateauthority/ — the ASSN v2 x5c chain is
    // verified against it, so notifications are rejected without it.
    APPLE_ROOT_CA_G3: v.optional(v.string()),
    GOOGLE_SERVICE_ACCOUNT_JSON: v.optional(v.string()),
    GOOGLE_PACKAGE_NAME: v.optional(v.string()),
    GOOGLE_PUBSUB_AUDIENCE: v.optional(v.string()),
    GOOGLE_PUBSUB_SERVICE_ACCOUNT: v.optional(v.string()),
    DATASOURCE_URL: v.optional(v.string()),
    DATASOURCE_API_TOKEN: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    AUTH_EMAIL_FROM: v.optional(v.string()),
    AUTH_EMAIL_LOGO_URL: v.optional(v.string()),
  },
});
app.use(crons);
app.use(betterAuth);
export default app;
