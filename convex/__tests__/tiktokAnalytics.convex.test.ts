import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { TikTokSnapshot } from "../lib/tiktokAnalytics";

const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.unstubAllEnvs());
function snapshot(): TikTokSnapshot {
  const now = Date.now();
  return {
    provider: "metricool",
    brandId: "7632357",
    accountHandle: "onerep.life",
    timezone: "Europe/Berlin",
    capturedAt: now,
    connectedAt: now - 3_600_000,
    accountAsOf: "2026-10-23",
    followers: 3,
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
      videoCoverage: "available",
      activityCoverage: "unverified",
      videos: 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      netFollowers: 0,
      profileViews: 0,
      accountViews: 0,
      topVideos: [],
    })),
  };
}

test("TikTok reads require an admin and unknown activity is not stored as zero", async () => {
  vi.stubEnv("ANALYTICS_ADMIN_USER_IDS", "issuer|admin");
  const t = convexTest(schema, modules);
  const admin = t.withIdentity({ tokenIdentifier: "issuer|admin" });
  expect(await admin.query(api.analytics.tiktokSnapshot, {})).toBeNull();
  await expect(t.query(api.analytics.tiktokSnapshot, {})).rejects.toThrow(
    "restricted",
  );
  await expect(
    t
      .withIdentity({ tokenIdentifier: "issuer|member" })
      .query(api.analytics.tiktokSnapshot, {}),
  ).rejects.toThrow("restricted");
  await t.mutation(internal.analytics.syncTikTokSnapshot, {
    snapshot: snapshot(),
  });
  const result = await admin.query(api.analytics.tiktokSnapshot, {});
  expect(result?.windows[0]).toMatchObject({
    videos: 0,
    views: 0,
    netFollowers: null,
    profileViews: null,
    accountViews: null,
  });
  expect(result).not.toHaveProperty("_id");
  expect(result).not.toHaveProperty("_creationTime");
});

test("snapshots replace a single bounded record, reject stale writes, and remove video tracking parameters", async () => {
  const t = convexTest(schema, modules);
  const data = snapshot();
  data.windows[1].videos = 1;
  data.windows[1].topVideos = [
    {
      url: "https://www.tiktok.com/@onerep.life/video/7699502918365351190?utm_source=tracking#fragment",
      title: "Workout logging",
      publishedOn: "2026-10-22",
      views: 278,
      likes: 2,
      comments: 0,
      shares: 0,
    },
  ];
  await t.mutation(internal.analytics.syncTikTokSnapshot, { snapshot: data });
  await t.mutation(internal.analytics.syncTikTokSnapshot, {
    snapshot: { ...data, capturedAt: data.capturedAt + 1 },
  });
  const rows = await t.run((ctx) =>
    ctx.db.query("analyticsSocialSnapshots").take(2),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].windows[1].topVideos[0].url).toBe(
    "https://www.tiktok.com/@onerep.life/video/7699502918365351190",
  );
  await expect(
    t.mutation(internal.analytics.syncTikTokSnapshot, { snapshot: data }),
  ).rejects.toThrow("newer");
});

test("unsafe links, malformed windows, excessive lists, and invalid counts are rejected", async () => {
  const t = convexTest(schema, modules);
  for (const url of [
    "javascript:alert(1)",
    "https://evil.test/@onerep.life/video/123",
    "https://www.tiktok.com/@someoneelse/video/123",
  ]) {
    const data = snapshot();
    data.windows[0].topVideos = [
      {
        url,
        title: "Video",
        publishedOn: "2026-10-23",
        views: 1,
        likes: 0,
        comments: 0,
        shares: 0,
      },
    ];
    await expect(
      t.mutation(internal.analytics.syncTikTokSnapshot, { snapshot: data }),
    ).rejects.toThrow();
  }
  const badDates = snapshot();
  badDates.windows[1].from = "2026-10-20";
  await expect(
    t.mutation(internal.analytics.syncTikTokSnapshot, { snapshot: badDates }),
  ).rejects.toThrow("window");
  const badCount = snapshot();
  badCount.followers = -1;
  await expect(
    t.mutation(internal.analytics.syncTikTokSnapshot, { snapshot: badCount }),
  ).rejects.toThrow("counts");
  const excessive = snapshot();
  excessive.windows.push(excessive.windows[0]);
  await expect(
    t.mutation(internal.analytics.syncTikTokSnapshot, { snapshot: excessive }),
  ).rejects.toThrow("windows");
});

test("dated chart history preserves missing observations and rejects gaps, duplicates, future dates, and unbounded series", async () => {
  const t = convexTest(schema, modules);
  const data = snapshot();
  data.history = [
    { date: "2026-10-22", videoViews: 1591, followers: null },
    { date: "2026-10-23", videoViews: 0, followers: 3 },
  ];
  await t.mutation(internal.analytics.syncTikTokSnapshot, { snapshot: data });
  const rows = await t.run((ctx) =>
    ctx.db.query("analyticsSocialSnapshots").take(1),
  );
  expect(rows[0].history).toEqual(data.history);
  for (const history of [
    [data.history[0], data.history[0]],
    [data.history[0], { ...data.history[1], date: "2026-10-24" }],
    [{ ...data.history[0], date: "2026-02-30" }],
    [{ ...data.history[0], videoViews: -1 }],
    Array.from({ length: 62 }, () => data.history![0]),
  ]) {
    await expect(
      t.mutation(internal.analytics.syncTikTokSnapshot, {
        snapshot: { ...data, history },
      }),
    ).rejects.toThrow();
  }
});
