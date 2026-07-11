import { v } from "convex/values";
import {
  RevenueCat,
  type Customer,
  type Entitlement,
  type Subscription,
} from "convex-revenuecat";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  env,
  internalMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthUser, safeGetAuthUser, type CurrentUser } from "./lib/auth";
import {
  DEFAULT_MONTHLY_PRICE_LABEL,
  normalizeMonthlyPriceLabel,
} from "./lib/subscriptionPrice";

export const ONEREP_PRO_ENTITLEMENT = "OneRep Pro";
export const MONTHLY_PACKAGE_IDENTIFIER = "monthly";
const revenuecat = new RevenueCat(components.revenuecat);

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
  source: "revenuecat_api" | "revenuecat_webhook" | "manual";
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

type RevenueCatV2Subscription = {
  id?: unknown;
  store?: unknown;
  status?: unknown;
  auto_renewal_status?: unknown;
  current_period_ends_at?: unknown;
  ends_at?: unknown;
  gives_access?: unknown;
};

type RevenueCatV2ListSubscriptionsResponse = {
  items?: RevenueCatV2Subscription[];
  next_page?: unknown;
};

type ConvexSafeJson =
  | null
  | boolean
  | number
  | string
  | ConvexSafeJson[]
  | { [key: string]: ConvexSafeJson };

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function monthlyPriceLabel() {
  return normalizeMonthlyPriceLabel(env.REVENUECAT_MONTHLY_PRICE_LABEL);
}

function convexSafeFieldName(key: string, fallback: string) {
  const asciiKey = key.replace(/[^\x20-\x7e]/g, "_");
  if (!asciiKey || asciiKey.startsWith("$") || asciiKey.startsWith("_")) {
    return fallback;
  }
  return asciiKey;
}

function convexSafeJson(value: unknown): ConvexSafeJson | undefined {
  if (value === null) return null;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => convexSafeJson(item) ?? null);
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const result: { [key: string]: ConvexSafeJson } = {};
  const usedKeys = new Set<string>();
  for (const [key, rawValue] of Object.entries(value)) {
    const safeValue = convexSafeJson(rawValue);
    if (safeValue === undefined) continue;

    const baseKey = convexSafeFieldName(key, `field_${usedKeys.size}`);
    let safeKey = baseKey;
    let suffix = 1;
    while (usedKeys.has(safeKey)) {
      safeKey = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    usedKeys.add(safeKey);
    result[safeKey] = safeValue;
  }
  return result;
}

function revenueCatAppUserId(user: CurrentUser) {
  return nonEmptyString(user.subject) ?? user._id;
}

function revenueCatV2ApiKey() {
  const apiKey = nonEmptyString(env.REVENUECAT_API_V2_SECRET_KEY);
  if (!apiKey) {
    throw new Error("RevenueCat API v2 secret key is not configured in Convex");
  }
  return apiKey;
}

function revenueCatProjectId() {
  const projectId = nonEmptyString(env.REVENUECAT_PROJECT_ID);
  if (!projectId) {
    throw new Error("RevenueCat project id is not configured in Convex");
  }
  return projectId;
}

async function revenueCatApiError(response: Response, label: string) {
  let message: string | undefined;
  try {
    const payload = (await response.json()) as { message?: unknown };
    message = nonEmptyString(payload.message);
  } catch {
    try {
      message = nonEmptyString(await response.text());
    } catch {
      message = undefined;
    }
  }
  throw new Error(
    `${label} failed (${response.status})${message ? `: ${message}` : ""}`,
  );
}

async function fetchRevenueCatV2(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.revenuecat.com/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${revenueCatV2ApiKey()}`,
      Accept: "application/json",
      ...init?.headers,
    },
  });
  return response;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isCancelableWebSubscription(subscription: RevenueCatV2Subscription) {
  const id = nonEmptyString(subscription.id);
  const store = nonEmptyString(subscription.store)?.toLowerCase();
  const status = nonEmptyString(subscription.status)?.toLowerCase();
  const autoRenewalStatus = nonEmptyString(
    subscription.auto_renewal_status,
  )?.toLowerCase();

  if (!id || store !== "rc_billing") return false;
  if (autoRenewalStatus === "will_not_renew") return false;
  return (
    subscription.gives_access === true ||
    status === "active" ||
    status === "trialing"
  );
}

async function listRevenueCatV2Subscriptions(appUserId: string) {
  const projectId = revenueCatProjectId();
  let path = `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(
    appUserId,
  )}/subscriptions?limit=20`;
  const subscriptions: RevenueCatV2Subscription[] = [];

  for (let page = 0; page < 5; page += 1) {
    const response = await fetchRevenueCatV2(path);
    if (response.status === 404) return subscriptions;
    if (!response.ok) {
      await revenueCatApiError(response, "RevenueCat subscriptions request");
    }

    const payload =
      (await response.json()) as RevenueCatV2ListSubscriptionsResponse;
    subscriptions.push(...(payload.items ?? []));
    const nextPage = nonEmptyString(payload.next_page);
    if (!nextPage) break;
    path = nextPage.startsWith("/v2") ? nextPage.slice(3) : nextPage;
  }

  return subscriptions;
}

function pickCancelableRevenueCatSubscription(
  subscriptions: RevenueCatV2Subscription[],
) {
  return subscriptions
    .filter(isCancelableWebSubscription)
    .sort(
      (a, b) =>
        numberValue(b.current_period_ends_at ?? b.ends_at) -
        numberValue(a.current_period_ends_at ?? a.ends_at),
    )[0];
}

async function cancelRevenueCatV2Subscription(subscriptionId: string) {
  const projectId = revenueCatProjectId();
  const response = await fetchRevenueCatV2(
    `/projects/${encodeURIComponent(projectId)}/subscriptions/${encodeURIComponent(
      subscriptionId,
    )}/actions/cancel`,
    { method: "POST" },
  );
  if (!response.ok) {
    await revenueCatApiError(response, "RevenueCat cancel request");
  }
}

function isFutureDate(value: unknown, now: number) {
  const date = nonEmptyString(value);
  if (!date) return false;
  const time = Date.parse(date);
  return Number.isFinite(time) && time > now;
}

function buildCheckoutUrl(appUserId: string, email?: string) {
  const base = nonEmptyString(env.REVENUECAT_WEB_CHECKOUT_URL);
  if (!base) return null;
  const url = new URL(
    `${base.replace(/\/+$/, "")}/${encodeURIComponent(appUserId)}`,
  );
  url.searchParams.set("package_id", MONTHLY_PACKAGE_IDENTIFIER);
  url.searchParams.set("hide_back_button", "true");
  if (email) url.searchParams.set("email", email);
  return url.toString();
}

function inactiveStatus(
  appUserId: string,
  fetchedAt: number,
  source: NormalizedSubscriptionStatus["source"] = "revenuecat_api",
): NormalizedSubscriptionStatus {
  return {
    appUserId,
    entitlementId: ONEREP_PRO_ENTITLEMENT,
    isActive: false,
    hasActiveSubscription: false,
    activeSubscriptions: [],
    managementUrl: null,
    productIdentifier: null,
    store: null,
    expiresAt: null,
    source,
    fetchedAt,
  };
}

function isoDateFromMs(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

async function getWebhookStatus(
  ctx: QueryCtx,
  appUserId: string,
  fetchedAt: number,
): Promise<NormalizedSubscriptionStatus | null> {
  const [customer, entitlement, activeSubscriptions] = await Promise.all([
    revenuecat.getCustomer(ctx, { appUserId }),
    revenuecat.getEntitlement(ctx, {
      appUserId,
      entitlementId: ONEREP_PRO_ENTITLEMENT,
    }),
    revenuecat.getActiveSubscriptions(ctx, { appUserId }),
  ]);

  if (!customer && !entitlement && activeSubscriptions.length === 0) {
    return null;
  }

  return normalizeRevenueCatWebhookState(
    appUserId,
    customer,
    entitlement,
    activeSubscriptions,
    fetchedAt,
  );
}

function normalizeRevenueCatWebhookState(
  appUserId: string,
  customer: Customer | null,
  entitlement: Entitlement | null,
  activeSubscriptions: Subscription[],
  fetchedAt: number,
): NormalizedSubscriptionStatus {
  const firstActive = activeSubscriptions[0];
  const isActive = entitlement?.isActive === true;
  const expiresAt =
    isoDateFromMs(entitlement?.expiresAtMs) ??
    isoDateFromMs(firstActive?.expirationAtMs);

  return {
    appUserId,
    entitlementId: ONEREP_PRO_ENTITLEMENT,
    isActive,
    hasActiveSubscription: isActive || activeSubscriptions.length > 0,
    activeSubscriptions: activeSubscriptions.map(
      (subscription) => subscription.productId,
    ),
    managementUrl: customer?.managementUrl ?? null,
    productIdentifier: entitlement?.productId ?? firstActive?.productId ?? null,
    store: entitlement?.store ?? firstActive?.store ?? null,
    expiresAt,
    source: "revenuecat_webhook",
    fetchedAt,
  };
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
    rawCustomerInfo: convexSafeJson(payload),
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

  if (response.status === 404) {
    return null;
  }

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
        monthlyPriceLabel: monthlyPriceLabel(),
        nativeSdkKey: null,
        status: null,
      };
    }

    const appUserId = revenueCatAppUserId(user);
    const fetchedAt = Date.now();
    const existing = await ctx.db
      .query("subscriptionStates")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const webhookStatus = await getWebhookStatus(ctx, appUserId, fetchedAt);
    const status = webhookStatus ?? existing;

    return {
      appUserId,
      checkoutUrl: buildCheckoutUrl(appUserId, user.email),
      monthlyPriceLabel: monthlyPriceLabel(),
      nativeSdkKey: env.REVENUECAT_PUBLIC_SDK_KEY ?? null,
      status: status
        ? {
            isActive: status.isActive,
            hasActiveSubscription: status.hasActiveSubscription,
            activeSubscriptions: status.activeSubscriptions,
            managementUrl: status.managementUrl ?? null,
            productIdentifier: status.productIdentifier ?? null,
            store: status.store ?? null,
            expiresAt: status.expiresAt ?? null,
            source: status.source,
            fetchedAt: status.fetchedAt,
            updatedAt: "updatedAt" in status ? status.updatedAt : fetchedAt,
          }
        : null,
    };
  },
});

export const createCheckout = action({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    const appUserId = revenueCatAppUserId(user);
    const url = buildCheckoutUrl(appUserId, user.email);
    if (!url) {
      throw new Error("RevenueCat web checkout URL is not configured");
    }
    return { url };
  },
});

export const refreshFromRevenueCat = action({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    const appUserId = revenueCatAppUserId(user);
    const fetchedAt = Date.now();
    const payload = await fetchRevenueCatStatus(appUserId);
    const status = payload
      ? normalizeRevenueCatSubscriber(appUserId, payload, fetchedAt)
      : inactiveStatus(appUserId, fetchedAt);
    await ctx.runMutation(internal.subscriptions.upsertStatus, {
      userId: user._id,
      ...status,
    });
    return status;
  },
});

export const cancelFromRevenueCat = action({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    const appUserId = revenueCatAppUserId(user);
    const subscription = pickCancelableRevenueCatSubscription(
      await listRevenueCatV2Subscriptions(appUserId),
    );
    const subscriptionId = nonEmptyString(subscription?.id);
    if (!subscriptionId) {
      throw new Error("No active RevenueCat web subscription found to cancel");
    }

    await cancelRevenueCatV2Subscription(subscriptionId);

    const fetchedAt = Date.now();
    const payload = await fetchRevenueCatStatus(appUserId);
    const status = payload
      ? normalizeRevenueCatSubscriber(appUserId, payload, fetchedAt)
      : inactiveStatus(appUserId, fetchedAt);
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
    source: v.union(
      v.literal("revenuecat_api"),
      v.literal("revenuecat_webhook"),
      v.literal("manual"),
    ),
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

  // Manual refreshes, SDK callbacks, and webhook delivery can all report the
  // same entitlement within a few seconds. Avoid turning those observations
  // into competing writes to the one per-user status document.
  if (existing && sameSubscriptionStatus(existing, status)) return;

  const now = Date.now();
  const patch: {
    userId: string;
    appUserId: string;
    entitlementId: string;
    isActive: boolean;
    hasActiveSubscription: boolean;
    activeSubscriptions: string[];
    source: "revenuecat_api" | "revenuecat_webhook" | "manual";
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

function sameSubscriptionStatus(
  existing: Doc<"subscriptionStates">,
  incoming: NormalizedSubscriptionStatus,
) {
  return (
    existing.appUserId === incoming.appUserId &&
    existing.entitlementId === incoming.entitlementId &&
    existing.isActive === incoming.isActive &&
    existing.hasActiveSubscription === incoming.hasActiveSubscription &&
    sameStringSet(existing.activeSubscriptions, incoming.activeSubscriptions) &&
    existing.managementUrl === incoming.managementUrl &&
    existing.productIdentifier === incoming.productIdentifier &&
    existing.store === incoming.store &&
    existing.expiresAt === incoming.expiresAt
  );
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}
