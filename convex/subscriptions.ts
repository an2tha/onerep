/**
 * Compatibility API for clients released before the self-owned billing cutover.
 *
 * Keep these public function names until the web deployment and supported
 * native app versions all call `billing/public` directly. The implementation
 * delegates to the current billing stack and has no RevenueCat server/runtime
 * dependency.
 */
import { api } from "./_generated/api";
import { action, query } from "./_generated/server";

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const result = await ctx.runQuery(api.billing.public.getStatus, {});
    return {
      ...result,
      checkoutUrl: null,
      // Withheld deliberately. In-app purchases are gone, so an older build
      // that still ships a store SDK must not be handed a key to configure it
      // with — it would offer a purchase the server will no longer honour.
      nativeSdkKey: null,
    };
  },
});

export const createCheckout = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> =>
    await ctx.runAction(api.billing.public.createCheckout, {}),
});

export const refreshFromRevenueCat = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(api.billing.public.refreshStatus, {});
    const result = await ctx.runQuery(api.billing.public.getStatus, {});
    return result.status;
  },
});

export const cancelFromRevenueCat = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(api.billing.public.cancelSubscription, {});
    const result = await ctx.runQuery(api.billing.public.getStatus, {});
    return result.status;
  },
});
