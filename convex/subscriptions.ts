/**
 * Compatibility API for clients released before the self-owned billing cutover.
 *
 * Keep these public function names until the web deployment and supported
 * native app versions all call `billing/public` directly. The implementation
 * delegates to the current billing stack and has no RevenueCat server/runtime
 * dependency.
 */
import { api } from "./_generated/api";
import { action, env, query } from "./_generated/server";

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const result = await ctx.runQuery(api.billing.public.getStatus, {});
    return {
      ...result,
      checkoutUrl: null,
      nativeSdkKey: env.REVENUECAT_PUBLIC_SDK_KEY ?? null,
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
