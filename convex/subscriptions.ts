import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  env,
  internalMutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { getAuthUser, safeGetAuthUser } from "./lib/auth";

export const ONEREP_PRO_ENTITLEMENT = "OneRep Pro";
export const MONTHLY_PACKAGE_IDENTIFIER = "monthly";
const DEFAULT_WEB_CHECKOUT_URL =
  "https://pay.rev.cat/sandbox/mqvkhnnxqaxmwfms/";
const DEFAULT_MONTHLY_PRICE_LABEL = "$9.99/month";

type NormalizedSubscriptionStatus = {
  appUserId: string;
  entitlementId: string;
  isActive: boolean;
  hasActiveSubscription: boolean;
  activeSubscriptions: string[];
  managementUrl: string | null;
  productIdentifier: string | null;
  store: string | null;
  expiresAt: string | null;
  rawCustomerInfo?: unknown;
  source: "revenuecat_api" | "manual";
  fetchedAt: number;
};

type RevenueCatSubscriberResponse = {
  subscriber?: {
    management_url?: unknown;
    subscriptions?: Record<
      string,
      {
        expires_date?: unknown;
        store?: unknown;
        product_identifier?: unknown;
      }
    >;
    entitlements?: Record<
      string,
      {
        expires_date?: unknown;
        product_identifier?: unknown;
      }
    >;
  };
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isFutureDate(value: unknown, now: number) {
  const date = nonEmptyString(value);
  if (!date) return false;
  const time = Date.parse(date);
  return Number.isFinite(time) && time > now;
}

function buildCheckoutUrl(appUserId: string, email?: string) {
  const base = env.REVENUECAT_WEB_CHECKOUT_URL ?? DEFAULT_WEB_CHECKOUT_URL;
  const url = new URL(
    `${base.replace(/\/+$/, "")}/${encodeURIComponent(appUserId)}`,
  );
  url.searchParams.set("package_id", MONTHLY_PACKAGE_IDENTIFIER);
  url.searchParams.set("hide_back_button", "true");
  if (email) url.searchParams.set("email", email);
  return url.toString();
}

function normalizeRevenueCatSubscriber(
  appUserId: string,
  payload: RevenueCatSubscriberResponse,
  fetchedAt: number,
): NormalizedSubscriptionStatus {
  const subscriber = payload.subscriber;
  const now = Date.now();
  const entitlement = subscriber?.entitlements?.[ONEREP_PRO_ENTITLEMENT];
  const subscriptionEntries = Object.entries(subscriber?.subscriptions ?? {});
  const activeSubscriptions = subscriptionEntries
    .filter(([, subscription]) => isFutureDate(subscription.expires_date, now))
    .map(([identifier]) => identifier);
  const isActive = isFutureDate(entitlement?.expires_date, now);
  const firstActive = subscriptionEntries.find(([identifier]) =>
    activeSubscriptions.includes(identifier),
  );

  return {
    appUserId,
    entitlementId: ONEREP_PRO_ENTITLEMENT,
    isActive,
    hasActiveSubscription: isActive || activeSubscriptions.length > 0,
    activeSubscriptions,
    managementUrl: nonEmptyString(subscriber?.management_url) ?? null,
    productIdentifier:
      nonEmptyString(entitlement?.product_identifier) ??
      nonEmptyString(firstActive?.[1].product_identifier) ??
      firstActive?.[0] ??
      null,
    store: nonEmptyString(firstActive?.[1].store) ?? null,
    expiresAt:
      nonEmptyString(entitlement?.expires_date) ??
      nonEmptyString(firstActive?.[1].expires_date) ??
      null,
    rawCustomerInfo: payload,
    source: "revenuecat_api",
    fetchedAt,
  };
}

async function fetchRevenueCatStatus(appUserId: string) {
  const apiKey = env.REVENUECAT_SECRET_KEY;
  if (!apiKey) {
    throw new Error("RevenueCat secret key is not configured in Convex");
  }

  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(
      appUserId,
    )}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`RevenueCat status request failed (${response.status})`);
  }

  return (await response.json()) as RevenueCatSubscriberResponse;
}

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) {
      return {
        appUserId: null,
        checkoutUrl: null,
        monthlyPriceLabel:
          env.REVENUECAT_MONTHLY_PRICE_LABEL ?? DEFAULT_MONTHLY_PRICE_LABEL,
        nativeSdkKey: null,
        status: null,
      };
    }

    const existing = await ctx.db
      .query("subscriptionStates")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    return {
      appUserId: user._id,
      checkoutUrl: buildCheckoutUrl(user._id, user.email),
      monthlyPriceLabel:
        env.REVENUECAT_MONTHLY_PRICE_LABEL ?? DEFAULT_MONTHLY_PRICE_LABEL,
      nativeSdkKey: env.REVENUECAT_PUBLIC_SDK_KEY ?? null,
      status: existing
        ? {
            isActive: existing.isActive,
            hasActiveSubscription: existing.hasActiveSubscription,
            activeSubscriptions: existing.activeSubscriptions,
            managementUrl: existing.managementUrl ?? null,
            productIdentifier: existing.productIdentifier ?? null,
            store: existing.store ?? null,
            expiresAt: existing.expiresAt ?? null,
            source: existing.source,
            fetchedAt: existing.fetchedAt,
            updatedAt: existing.updatedAt,
          }
        : null,
    };
  },
});

export const createCheckout = action({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return { url: buildCheckoutUrl(user._id, user.email) };
  },
});

export const refreshFromRevenueCat = action({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    const fetchedAt = Date.now();
    const payload = await fetchRevenueCatStatus(user._id);
    const status = normalizeRevenueCatSubscriber(user._id, payload, fetchedAt);
    await ctx.runMutation(internal.subscriptions.upsertStatus, {
      userId: user._id,
      ...status,
    });
    return status;
  },
});

export const upsertStatus = internalMutation({
  args: {
    userId: v.string(),
    appUserId: v.string(),
    entitlementId: v.string(),
    isActive: v.boolean(),
    hasActiveSubscription: v.boolean(),
    activeSubscriptions: v.array(v.string()),
    managementUrl: v.union(v.string(), v.null()),
    productIdentifier: v.union(v.string(), v.null()),
    store: v.union(v.string(), v.null()),
    expiresAt: v.union(v.string(), v.null()),
    rawCustomerInfo: v.optional(v.any()),
    source: v.union(v.literal("revenuecat_api"), v.literal("manual")),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, ...status } = args;
    await upsertStatusForUser(ctx, userId, status);
  },
});

async function upsertStatusForUser(
  ctx: MutationCtx,
  userId: string,
  status: NormalizedSubscriptionStatus,
) {
  const existing = await ctx.db
    .query("subscriptionStates")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const now = Date.now();
  const patch: {
    userId: string;
    appUserId: string;
    entitlementId: string;
    isActive: boolean;
    hasActiveSubscription: boolean;
    activeSubscriptions: string[];
    source: "revenuecat_api" | "manual";
    fetchedAt: number;
    updatedAt: number;
    managementUrl: string | null;
    productIdentifier: string | null;
    store: string | null;
    expiresAt: string | null;
    rawCustomerInfo?: unknown;
  } = {
    userId,
    appUserId: status.appUserId,
    entitlementId: status.entitlementId,
    isActive: status.isActive,
    hasActiveSubscription: status.hasActiveSubscription,
    activeSubscriptions: status.activeSubscriptions,
    managementUrl: status.managementUrl,
    productIdentifier: status.productIdentifier,
    store: status.store,
    expiresAt: status.expiresAt,
    source: status.source,
    fetchedAt: status.fetchedAt,
    updatedAt: now,
  };
  if (status.rawCustomerInfo !== undefined) {
    patch.rawCustomerInfo = status.rawCustomerInfo;
  }
  if (existing) {
    await ctx.db.patch(existing._id, patch);
  } else {
    await ctx.db.insert("subscriptionStates", patch);
  }
}
