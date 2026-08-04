import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";
import { hasActiveProEntitlement, rollupForUser } from "../billing/entitlement";
import { stateGrantsAccess, type BillingState } from "../billing/types";

const modules = import.meta.glob("../**/*.ts");

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user_1",
    platform: "stripe" as const,
    platformSubscriptionId: "sub_1",
    productId: "onerep_pro_monthly",
    state: "active" as BillingState,
    autoRenew: true,
    expiresAt: NOW + 7 * DAY,
    environment: "production" as const,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("stateGrantsAccess", () => {
  const future = NOW + DAY;
  const past = NOW - DAY;

  test.each<[BillingState, number, number | undefined, boolean]>([
    ["active", past, undefined, true],
    ["active", future, undefined, true],
    ["canceled", future, undefined, true],
    ["canceled", past, undefined, false],
    ["grace_period", past, future, true],
    ["grace_period", past, past, false],
    ["grace_period", future, undefined, true],
    ["billing_retry", past, future, true],
    ["billing_retry", past, past, false],
    ["expired", future, future, false],
    ["refunded", future, future, false],
    ["paused", future, future, false],
  ])(
    "%s expiring %d grace %s -> %s",
    (state, expiresAt, gracePeriodExpiresAt, expected) => {
      expect(
        stateGrantsAccess(state, expiresAt, NOW, gracePeriodExpiresAt),
      ).toBe(expected);
    },
  );
});

describe("rollupForUser", () => {
  test("reports no entitlement when the user has no subscriptions", () => {
    const status = rollupForUser("user_1", [], NOW);
    expect(status.isActive).toBe(false);
    expect(status.store).toBeNull();
    expect(status.activeSubscriptions).toEqual([]);
  });

  test("grants access from a cancelled subscription still inside its period", () => {
    const status = rollupForUser(
      "user_1",
      [subscription({ state: "canceled" }) as never],
      NOW,
    );
    expect(status.isActive).toBe(true);
    expect(status.store).toBe("stripe");
    expect(status.state).toBe("canceled");
  });

  test("prefers the granting subscription when the user holds two", () => {
    const status = rollupForUser(
      "user_1",
      [
        subscription({
          platformSubscriptionId: "sub_dead",
          state: "expired",
          expiresAt: NOW - DAY,
        }) as never,
        subscription({ state: "active" }) as never,
      ],
      NOW,
    );
    expect(status.isActive).toBe(true);
    expect(status.store).toBe("stripe");
    // Only the granting subscription counts as active.
    expect(status.activeSubscriptions).toHaveLength(1);
  });

  // In-app purchases were removed outright, so a row left over from that era
  // must not keep granting Pro no matter how healthy it last looked.
  test.each(["apple", "google"])(
    "an active %s row left over from in-app purchases grants nothing",
    (platform) => {
      const status = rollupForUser(
        "user_1",
        [subscription({ platform, state: "active" }) as never],
        NOW,
      );
      expect(status.isActive).toBe(false);
      expect(status.activeSubscriptions).toEqual([]);
    },
  );

  test("revokes when every subscription has lapsed", () => {
    const status = rollupForUser(
      "user_1",
      [subscription({ state: "expired", expiresAt: NOW - DAY }) as never],
      NOW,
    );
    expect(status.isActive).toBe(false);
    expect(status.hasActiveSubscription).toBe(false);
  });
});

describe("hasActiveProEntitlement", () => {
  test("grants from a live platform row", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("billingSubscriptions", subscription());
    });
    const granted = await t.run(
      async (ctx) => await hasActiveProEntitlement(ctx, "user_1"),
    );
    expect(granted).toBe(true);
  });

  test("ignores a stale legacy rollup without a platform subscription", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptionStates", {
        userId: "user_2",
        appUserId: "user_2",
        entitlementId: "OneRep Pro",
        isActive: true,
        hasActiveSubscription: true,
        activeSubscriptions: ["monthly"],
        managementUrl: null,
        productIdentifier: "monthly",
        store: "app_store",
        expiresAt: null,
        source: "revenuecat_webhook",
        fetchedAt: NOW,
        updatedAt: NOW,
      });
    });
    const granted = await t.run(
      async (ctx) => await hasActiveProEntitlement(ctx, "user_2"),
    );
    expect(granted).toBe(false);
  });

  test("a migrated user's expired platform row overrides a stale rollup", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "billingSubscriptions",
        subscription({
          userId: "user_3",
          state: "expired",
          expiresAt: NOW - DAY,
        }),
      );
      await ctx.db.insert("subscriptionStates", {
        userId: "user_3",
        appUserId: "user_3",
        entitlementId: "OneRep Pro",
        isActive: true,
        hasActiveSubscription: true,
        activeSubscriptions: ["monthly"],
        managementUrl: null,
        productIdentifier: "monthly",
        store: "app_store",
        expiresAt: null,
        source: "revenuecat_webhook",
        fetchedAt: NOW,
        updatedAt: NOW,
      });
    });
    const granted = await t.run(
      async (ctx) => await hasActiveProEntitlement(ctx, "user_3"),
    );
    expect(granted).toBe(false);
  });

  test("grandfathering keeps a migrated subscriber alive during cutover", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "billingSubscriptions",
        subscription({
          userId: "user_4",
          state: "expired",
          expiresAt: NOW - DAY,
          originRevenueCat: true,
          grandfatheredUntil: Date.now() + 60 * DAY,
        }),
      );
    });
    const granted = await t.run(
      async (ctx) => await hasActiveProEntitlement(ctx, "user_4"),
    );
    expect(granted).toBe(true);
  });

  test("a legacy store row does not grant, even grandfathered", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "billingSubscriptions",
        subscription({
          userId: "user_store",
          platform: "apple",
          platformSubscriptionId: "orig_store",
          state: "active",
          expiresAt: NOW + 30 * DAY,
          originRevenueCat: true,
          grandfatheredUntil: Date.now() + 60 * DAY,
        }),
      );
    });
    const granted = await t.run(
      async (ctx) => await hasActiveProEntitlement(ctx, "user_store"),
    );
    expect(granted).toBe(false);
  });

  test("a refund is never grandfathered", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "billingSubscriptions",
        subscription({
          userId: "user_5",
          state: "refunded",
          expiresAt: NOW - DAY,
          originRevenueCat: true,
          grandfatheredUntil: Date.now() + 60 * DAY,
        }),
      );
    });
    const granted = await t.run(
      async (ctx) => await hasActiveProEntitlement(ctx, "user_5"),
    );
    expect(granted).toBe(false);
  });
});

describe("store idempotency and ordering", () => {
  test("claimEvent claims once and rejects the replay", async () => {
    const t = convexTest(schema, modules);
    const args = {
      platform: "stripe",
      eventId: "evt_1",
      eventType: "customer.subscription.updated",
    };
    const first = await t.mutation(internal.billing.store.claimEvent, args);
    const second = await t.mutation(internal.billing.store.claimEvent, args);
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);

    const events = await t.run(
      async (ctx) => await ctx.db.query("billingEvents").collect(),
    );
    expect(events).toHaveLength(1);
  });

  test("an out-of-order platform update is dropped", async () => {
    const t = convexTest(schema, modules);
    const base = {
      userId: "user_6",
      platform: "stripe" as const,
      platformSubscriptionId: "sub_6",
      productId: "onerep_pro_monthly",
      autoRenew: true,
      environment: "production" as const,
    };

    await t.mutation(internal.billing.store.upsertPlatformSubscription, {
      ...base,
      state: "expired",
      expiresAt: NOW - DAY,
      sourceUpdatedAt: NOW,
    });
    // An older notification arriving late must not resurrect the subscription.
    await t.mutation(internal.billing.store.upsertPlatformSubscription, {
      ...base,
      state: "active",
      expiresAt: NOW + 30 * DAY,
      sourceUpdatedAt: NOW - HOUR,
    });

    const row = await t.run(
      async (ctx) => await ctx.db.query("billingSubscriptions").unique(),
    );
    expect(row?.state).toBe("expired");
  });

  test("upsert recomputes the rollup and the dedupe guard skips no-op writes", async () => {
    const t = convexTest(schema, modules);
    const args = {
      userId: "user_7",
      platform: "stripe" as const,
      platformSubscriptionId: "sub_7",
      productId: "onerep_pro_monthly",
      state: "active" as const,
      autoRenew: true,
      expiresAt: NOW + 30 * DAY,
      environment: "production" as const,
      sourceUpdatedAt: NOW,
    };
    await t.mutation(internal.billing.store.upsertPlatformSubscription, args);
    const afterFirst = await t.run(
      async (ctx) => await ctx.db.query("subscriptionStates").unique(),
    );
    expect(afterFirst?.isActive).toBe(true);
    expect(afterFirst?.store).toBe("stripe");

    await t.mutation(internal.billing.store.upsertPlatformSubscription, args);
    const afterSecond = await t.run(
      async (ctx) => await ctx.db.query("subscriptionStates").unique(),
    );
    // Identical state must not produce a competing write.
    expect(afterSecond?.updatedAt).toBe(afterFirst?.updatedAt);
  });

  test("reassigning a subscription revokes the previous owner", async () => {
    const t = convexTest(schema, modules);
    const args = {
      platform: "stripe" as const,
      platformSubscriptionId: "sub_shared",
      productId: "onerep_pro_monthly",
      state: "active" as const,
      autoRenew: true,
      expiresAt: NOW + 30 * DAY,
      environment: "production" as const,
    };
    await t.mutation(internal.billing.store.upsertPlatformSubscription, {
      ...args,
      userId: "user_old",
    });
    await t.mutation(internal.billing.store.upsertPlatformSubscription, {
      ...args,
      userId: "user_new",
    });

    const states = await t.run(
      async (ctx) => await ctx.db.query("subscriptionStates").collect(),
    );
    const byUser = Object.fromEntries(
      states.map((state) => [state.userId, state.isActive]),
    );
    expect(byUser.user_new).toBe(true);
    expect(byUser.user_old).toBe(false);
  });
});
