import { defineApp } from "convex/server";
import { v } from "convex/values";
import crons from "@convex-dev/crons/convex.config.js";
import betterAuth from "@convex-dev/better-auth/convex.config";
import migrations from "@convex-dev/migrations/convex.config.js";

const app = defineApp({
  env: {
    OPENAI_MODEL: v.optional(v.string()),
    OPENROUTER_API_KEY: v.optional(v.string()),
    OPENROUTER_MODEL: v.optional(v.string()),
    AI_PROCESSOR_APPROVED: v.optional(v.string()),
    // "true" removes the monthly AI request caps for every account. For
    // self-hosted installs paying for their own inference; never set on the
    // hosted app.
    AI_USAGE_UNLIMITED: v.optional(v.string()),
    STRIPE_SECRET_KEY: v.optional(v.string()),
    STRIPE_WEBHOOK_SECRET: v.optional(v.string()),
    STRIPE_PRICE_ID_MONTHLY: v.optional(v.string()),
    BILLING_COMP_ALL_USERS: v.optional(v.string()),
    BILLING_MONTHLY_PRICE_LABEL: v.optional(v.string()),
    BILLING_CHECKOUT_SUCCESS_URL: v.optional(v.string()),
    BILLING_CHECKOUT_CANCEL_URL: v.optional(v.string()),
    // App Store Server API credentials, for verifying StoreKit purchases and
    // the notifications that follow them. The key trio and numeric app Apple
    // ID are required together; with any missing the iOS app shows no purchase
    // button rather than one that fails on tap. The private key is the .p8
    // contents; an escaped "\n" form is accepted for Convex's single-line env.
    BILLING_APPLE_ISSUER_ID: v.optional(v.string()),
    BILLING_APPLE_KEY_ID: v.optional(v.string()),
    BILLING_APPLE_PRIVATE_KEY: v.optional(v.string()),
    BILLING_APPLE_BUNDLE_ID: v.optional(v.string()),
    BILLING_APPLE_APP_APPLE_ID: v.optional(v.string()),
    DATASOURCE_URL: v.optional(v.string()),
    DATASOURCE_API_TOKEN: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    EMAIL_VERIFICATION_REQUIRED: v.optional(v.string()),
    AUTH_EMAIL_FROM: v.optional(v.string()),
    // Coach outreach. The kill switch is separate from the credentials on
    // purpose: a deployment can hold working push keys and still be forbidden
    // from speaking first, which is what every environment except production
    // wants.
    COACH_PROACTIVE_ENABLED: v.optional(v.string()),
    COACH_REVIEW_PRO_ONLY: v.optional(v.string()),
    FCM_PROJECT_ID: v.optional(v.string()),
    FCM_CLIENT_EMAIL: v.optional(v.string()),
    FCM_PRIVATE_KEY: v.optional(v.string()),
    // Apple is spoken to directly: the iOS shell registers an APNs device
    // token, which FCM has no way to address.
    APNS_KEY_ID: v.optional(v.string()),
    APNS_TEAM_ID: v.optional(v.string()),
    APNS_PRIVATE_KEY: v.optional(v.string()),
    APNS_BUNDLE_ID: v.optional(v.string()),
    /** "sandbox" for development builds; anything else means production. */
    APNS_ENVIRONMENT: v.optional(v.string()),
  },
});
app.use(crons);
app.use(betterAuth);
app.use(migrations);
export default app;
