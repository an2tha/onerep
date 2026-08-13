import type { BillingProvider } from "./providerTypes";

/**
 * The billing provider that ships with the open repository.
 *
 * It implements the full `BillingProvider` interface and does exactly nothing
 * with it: checkout and management throw, webhooks fail verification, and
 * refresh reports that there was nothing to refresh. Every other part of the
 * billing system — entitlement rollups, the schema, the client hooks — works
 * unchanged; there is simply no way to create a paid subscription through this
 * build. Every account is treated as Pro unless `BILLING_COMP_ALL_USERS` is
 * explicitly set to `false` — so in practice, nobody ever sees these errors
 * unless they went looking for them.
 *
 * `scripts/ensure-billing-provider.mjs` copies this file to
 * `convex/billing/provider.ts` when no provider is present.
 */

const NOT_AVAILABLE =
  "Billing is not available in this build. Unset BILLING_COMP_ALL_USERS (or set it to true) and every account gets Pro instead.";

export const provider: BillingProvider = {
  async createCheckoutSession() {
    throw new Error(NOT_AVAILABLE);
  },

  async createPortalSession() {
    throw new Error(NOT_AVAILABLE);
  },

  async cancelSubscription() {
    throw new Error(NOT_AVAILABLE);
  },

  async refreshSubscription() {
    return { stored: false as const, reason: "billing-disabled" };
  },

  async handleWebhook() {
    return {
      verified: false as const,
      message: "Billing webhooks are not handled in this build",
    };
  },
};
