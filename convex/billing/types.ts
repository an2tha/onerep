import { v } from "convex/values";

/**
 * Shared vocabulary for the self-owned billing stack.
 *
 * This module is deliberately dependency-free (no `_generated` imports) so it
 * can be pulled into `convex/schema.ts`, the V8 runtime, and the `"use node"`
 * platform clients alike.
 */

export const PRO_ENTITLEMENT = "OneRep Pro";
export const MONTHLY_PACKAGE_IDENTIFIER = "monthly";

export const billingPlatform = v.union(
  v.literal("apple"),
  v.literal("google"),
  v.literal("stripe"),
);
export type BillingPlatform = "apple" | "google" | "stripe";

export const billingState = v.union(
  v.literal("active"),
  v.literal("grace_period"),
  v.literal("billing_retry"),
  v.literal("canceled"),
  v.literal("expired"),
  v.literal("paused"),
  v.literal("refunded"),
);
export type BillingState =
  | "active"
  | "grace_period"
  | "billing_retry"
  | "canceled"
  | "expired"
  | "paused"
  | "refunded";

export const billingEnvironment = v.union(
  v.literal("production"),
  v.literal("sandbox"),
);
export type BillingEnvironment = "production" | "sandbox";

export const subscriptionSource = v.union(
  v.literal("revenuecat_api"),
  v.literal("revenuecat_webhook"),
  v.literal("manual"),
  v.literal("apple_api"),
  v.literal("apple_notification"),
  v.literal("google_api"),
  v.literal("google_rtdn"),
  v.literal("stripe_api"),
  v.literal("stripe_webhook"),
);
export type SubscriptionSource =
  | "revenuecat_api"
  | "revenuecat_webhook"
  | "manual"
  | "apple_api"
  | "apple_notification"
  | "google_api"
  | "google_rtdn"
  | "stripe_api"
  | "stripe_webhook";

/** Product identifiers, kept identical across the three stores. */
export const MONTHLY_PRODUCT_ID = "onerep_pro_monthly";

/** Error code surfaced when a store subscription already belongs elsewhere. */
export const SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT =
  "SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT";

export type NormalizedSubscriptionStatus = {
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
  source: SubscriptionSource;
  platform?: BillingPlatform;
  state?: BillingState;
  autoRenew?: boolean;
  gracePeriodExpiresAt?: number;
  fetchedAt: number;
};

/** A platform subscription reduced to the fields the rollup cares about. */
export type PlatformSubscriptionFacts = {
  platform: BillingPlatform;
  platformSubscriptionId: string;
  platformCustomerId?: string;
  productId: string;
  state: BillingState;
  autoRenew: boolean;
  expiresAt: number;
  gracePeriodExpiresAt?: number;
  environment: BillingEnvironment;
  managementUrl?: string | null;
  sourceUpdatedAt?: number;
  latestRaw?: unknown;
};

/**
 * Whether a subscription in this state currently grants the entitlement.
 *
 * `canceled` means auto-renew is off but the paid period has not elapsed, so it
 * grants until `expiresAt`. `billing_retry` and `grace_period` both keep access
 * while the store retries payment — revoking there churns customers who are one
 * card update away from renewing. Only `expired`, `refunded`, and `paused`
 * revoke outright.
 */
export function stateGrantsAccess(
  state: BillingState,
  expiresAt: number,
  now: number,
  gracePeriodExpiresAt?: number,
): boolean {
  switch (state) {
    case "active":
      return true;
    case "grace_period":
      return (gracePeriodExpiresAt ?? expiresAt) > now;
    case "billing_retry":
      // Apple keeps the entitlement alive through billing retry only when a
      // grace period is configured; without one, fall back to the paid period.
      return (gracePeriodExpiresAt ?? expiresAt) > now;
    case "canceled":
      return expiresAt > now;
    case "expired":
    case "refunded":
    case "paused":
      return false;
  }
}

/** Store label used by the client for management/cancellation copy. */
export function storeLabelForPlatform(platform: BillingPlatform): string {
  switch (platform) {
    case "apple":
      return "app_store";
    case "google":
      return "play_store";
    case "stripe":
      return "stripe";
  }
}

export function platformForStore(store: string | null | undefined) {
  switch (store?.toLowerCase()) {
    case "app_store":
    case "mac_app_store":
    case "apple":
      return "apple" as const;
    case "play_store":
    case "google":
      return "google" as const;
    case "stripe":
    case "rc_billing":
      return "stripe" as const;
    default:
      return undefined;
  }
}

export function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function isoDateFromMs(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

type ConvexSafeJson =
  | null
  | boolean
  | number
  | string
  | ConvexSafeJson[]
  | { [key: string]: ConvexSafeJson };

function convexSafeFieldName(key: string, fallback: string) {
  const asciiKey = key.replace(/[^\x20-\x7e]/g, "_");
  if (!asciiKey || asciiKey.startsWith("$") || asciiKey.startsWith("_")) {
    return fallback;
  }
  return asciiKey;
}

/**
 * Coerce an arbitrary store payload into something Convex will accept as
 * `v.any()`: drops `undefined`, and rewrites field names that Convex rejects
 * (non-ASCII, or a leading `$`/`_`).
 */
export function convexSafeJson(value: unknown): ConvexSafeJson | undefined {
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
