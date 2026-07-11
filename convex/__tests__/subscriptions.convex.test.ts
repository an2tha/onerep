import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const baseStatus = {
  userId: "subscription-user",
  appUserId: "revenuecat-user",
  entitlementId: "OneRep Pro",
  isActive: false,
  hasActiveSubscription: false,
  activeSubscriptions: [],
  managementUrl: null,
  productIdentifier: null,
  store: null,
  expiresAt: null,
  source: "revenuecat_api" as const,
  fetchedAt: 100,
};

describe("subscription status cache", () => {
  test("skips duplicate entitlement observations", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertStatus, baseStatus);
    const first = await t.run(async (ctx) =>
      ctx.db
        .query("subscriptionStates")
        .withIndex("by_userId", (q) => q.eq("userId", baseStatus.userId))
        .unique(),
    );

    await t.mutation(internal.subscriptions.upsertStatus, {
      ...baseStatus,
      // A different transport and fetch time should not create an otherwise
      // pointless write or reactive invalidation.
      source: "revenuecat_webhook",
      fetchedAt: 200,
    });
    const duplicate = await t.run(async (ctx) =>
      ctx.db
        .query("subscriptionStates")
        .withIndex("by_userId", (q) => q.eq("userId", baseStatus.userId))
        .unique(),
    );

    expect(duplicate?._id).toBe(first?._id);
    expect(duplicate?.fetchedAt).toBe(100);
    expect(duplicate?.source).toBe("revenuecat_api");
  });

  test("writes when the entitlement itself changes", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertStatus, baseStatus);
    await t.mutation(internal.subscriptions.upsertStatus, {
      ...baseStatus,
      activeSubscriptions: ["monthly"],
      isActive: true,
      hasActiveSubscription: true,
      productIdentifier: "monthly",
      source: "revenuecat_webhook",
      fetchedAt: 300,
    });

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("subscriptionStates")
          .withIndex("by_userId", (q) => q.eq("userId", baseStatus.userId))
          .unique(),
      ),
    ).resolves.toMatchObject({
      activeSubscriptions: ["monthly"],
      fetchedAt: 300,
      hasActiveSubscription: true,
      isActive: true,
      productIdentifier: "monthly",
      source: "revenuecat_webhook",
    });
  });
});
