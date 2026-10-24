import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { InstagramSnapshot } from "../lib/instagramAnalytics";

const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.unstubAllEnvs());
function snapshot(): InstagramSnapshot {
  return {
    provider: "metricool",
    brandId: "7632357",
    accountHandle: "onerep_app",
    timezone: "Europe/Berlin",
    capturedAt: Date.now(),
    accountAsOf: "2026-10-23",
    followers: 4,
    history: [{ date: "2026-10-23", contentViews: null, followers: 4 }],
    windows: (
      [
        ["yesterday", "2026-10-23"],
        ["last7", "2026-10-17"],
        ["last30", "2026-09-24"],
      ] as const
    ).map(([key, from]) => ({
      key,
      from,
      to: "2026-10-23",
      contentCoverage: "unverified",
      contentCount: 0,
      feedPosts: 0,
      reels: 0,
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
      topContent: [],
    })),
  };
}
test("Instagram is admin-only and initial unknown zeros stay unavailable", async () => {
  vi.stubEnv("ANALYTICS_ADMIN_USER_IDS", "issuer|admin");
  const t = convexTest(schema, modules);
  const admin = t.withIdentity({ tokenIdentifier: "issuer|admin" });
  expect(await admin.query(api.analytics.instagramSnapshot, {})).toBeNull();
  await expect(t.query(api.analytics.instagramSnapshot, {})).rejects.toThrow(
    "restricted",
  );
  await expect(
    t
      .withIdentity({ tokenIdentifier: "issuer|member" })
      .query(api.analytics.instagramSnapshot, {}),
  ).rejects.toThrow("restricted");
  await t.mutation(internal.analytics.syncInstagramSnapshot, {
    snapshot: snapshot(),
  });
  const result = await admin.query(api.analytics.instagramSnapshot, {});
  expect(result?.followers).toBe(4);
  expect(result?.windows[0]).toMatchObject({
    views: null,
    contentCount: null,
    saves: null,
  });
  expect(result?.history[0].contentViews).toBeNull();
  expect(result).not.toHaveProperty("_id");
});
test("Instagram verified zeros survive, cache is bounded, and stale writes fail", async () => {
  const t = convexTest(schema, modules);
  const data = snapshot();
  data.windows[0].contentCoverage = "available";
  await t.mutation(internal.analytics.syncInstagramSnapshot, {
    snapshot: data,
  });
  await t.mutation(internal.analytics.syncInstagramSnapshot, {
    snapshot: { ...data, capturedAt: data.capturedAt + 1 },
  });
  const rows = await t.run((ctx) =>
    ctx.db.query("analyticsInstagramSnapshots").take(2),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].windows[0].views).toBe(0);
  await expect(
    t.mutation(internal.analytics.syncInstagramSnapshot, { snapshot: data }),
  ).rejects.toThrow("newer");
});
test("Instagram rejects unsafe links, invalid counts, dates and excessive history", async () => {
  const t = convexTest(schema, modules);
  for (const url of [
    "javascript:alert(1)",
    "https://evil.test/reel/abc/",
    "https://www.instagram.com/accounts/login/",
    "https://www.instagram.com:443@evil.test/reel/abc/",
  ]) {
    const data = snapshot();
    data.windows[0].topContent = [
      {
        url,
        title: "Post",
        publishedOn: "2026-10-23",
        views: 1,
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0,
      },
    ];
    await expect(
      t.mutation(internal.analytics.syncInstagramSnapshot, { snapshot: data }),
    ).rejects.toThrow();
  }
  for (const data of [
    { ...snapshot(), followers: -1 },
    {
      ...snapshot(),
      history: Array.from({ length: 62 }, () => snapshot().history[0]),
    },
    { ...snapshot(), history: [snapshot().history[0], snapshot().history[0]] },
    { ...snapshot(), accountAsOf: "2026-10-24" },
  ])
    await expect(
      t.mutation(internal.analytics.syncInstagramSnapshot, { snapshot: data }),
    ).rejects.toThrow();
});
