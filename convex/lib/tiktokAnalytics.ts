import { ConvexError, v, type Infer } from "convex/values";

const count = v.union(v.number(), v.null());
const coverage = v.union(
  v.literal("available"),
  v.literal("partial"),
  v.literal("unverified"),
  v.literal("unavailable"),
);
const video = v.object({
  url: v.string(),
  title: v.string(),
  publishedOn: v.string(),
  views: count,
  likes: count,
  comments: count,
  shares: count,
});
export const tikTokSnapshotValidator = v.object({
  provider: v.literal("metricool"),
  brandId: v.literal("7632357"),
  accountHandle: v.literal("onerep.life"),
  timezone: v.literal("Europe/Berlin"),
  capturedAt: v.number(),
  connectedAt: v.number(),
  accountAsOf: v.union(v.string(), v.null()),
  followers: count,
  // At most 60 reporting days plus the preceding follower baseline.
  history: v.optional(
    v.array(
      v.object({
        date: v.string(),
        videoViews: count,
        followers: count,
      }),
    ),
  ),
  windows: v.array(
    v.object({
      key: v.union(
        v.literal("yesterday"),
        v.literal("last7"),
        v.literal("last30"),
      ),
      from: v.string(),
      to: v.string(),
      videoCoverage: coverage,
      activityCoverage: coverage,
      videos: count,
      views: count,
      likes: count,
      comments: count,
      shares: count,
      netFollowers: count,
      profileViews: count,
      accountViews: count,
      topVideos: v.array(video),
    }),
  ),
});
export type TikTokSnapshot = Infer<typeof tikTokSnapshotValidator>;
export type TikTokWindow = TikTokSnapshot["windows"][number];

function validDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}
function validateCount(value: number | null, signed = false) {
  if (
    value !== null &&
    (!Number.isSafeInteger(value) || (!signed && value < 0))
  )
    throw new ConvexError("TikTok counts must be finite integers or null.");
}

/** A small private cache, with unknown activity kept separate from published-video totals. */
export function normalizeTikTokSnapshot(
  input: TikTokSnapshot,
  now: number,
): TikTokSnapshot {
  if (
    ![input.capturedAt, input.connectedAt].every(Number.isFinite) ||
    input.connectedAt < 0 ||
    input.connectedAt > input.capturedAt ||
    input.capturedAt > now + 300_000
  )
    throw new ConvexError("Invalid TikTok snapshot time.");
  if (input.accountAsOf !== null && !validDate(input.accountAsOf))
    throw new ConvexError("Invalid TikTok account date.");
  validateCount(input.followers);
  if (input.history) {
    if (input.history.length > 61)
      throw new ConvexError("Store at most 61 days of TikTok history.");
    for (const [index, point] of input.history.entries()) {
      if (
        !validDate(point.date) ||
        (index > 0 &&
          Date.parse(point.date) - Date.parse(input.history[index - 1].date) !==
            86_400_000) ||
        input.windows.some((window) => point.date > window.to)
      )
        throw new ConvexError(
          "TikTok history must contain consecutive dated observations.",
        );
      validateCount(point.videoViews);
      validateCount(point.followers);
    }
  }
  if (
    input.windows.length !== 3 ||
    new Set(input.windows.map((window) => window.key)).size !== 3
  )
    throw new ConvexError(
      "Provide yesterday, 7-day, and 30-day TikTok windows.",
    );
  return {
    ...input,
    followers: input.accountAsOf === null ? null : input.followers,
    windows: input.windows.map((window) => {
      const days = { yesterday: 1, last7: 7, last30: 30 }[window.key];
      if (
        !validDate(window.from) ||
        !validDate(window.to) ||
        (Date.parse(window.to) - Date.parse(window.from)) / 86_400_000 !==
          days - 1
      )
        throw new ConvexError("Invalid TikTok reporting window.");
      if (window.topVideos.length > 3)
        throw new ConvexError(
          "Store at most three top TikTok videos per window.",
        );
      for (const value of [
        window.videos,
        window.views,
        window.likes,
        window.comments,
        window.shares,
        window.profileViews,
        window.accountViews,
      ])
        validateCount(value);
      validateCount(window.netFollowers, true);
      const videoUnknown = ["unverified", "unavailable"].includes(
        window.videoCoverage,
      );
      const activityUnknown = ["unverified", "unavailable"].includes(
        window.activityCoverage,
      );
      const topVideos = window.topVideos.map((item) => {
        let url: URL;
        try {
          url = new URL(item.url);
        } catch {
          throw new ConvexError("Invalid TikTok video URL.");
        }
        if (
          url.protocol !== "https:" ||
          url.hostname !== "www.tiktok.com" ||
          !/^\/@onerep\.life\/video\/\d+$/.test(url.pathname) ||
          url.username ||
          url.password
        )
          throw new ConvexError(
            "Video links must belong to the OneRep TikTok account.",
          );
        if (
          !validDate(item.publishedOn) ||
          item.publishedOn < window.from ||
          item.publishedOn > window.to
        )
          throw new ConvexError(
            "TikTok video is outside the reporting window.",
          );
        for (const value of [
          item.views,
          item.likes,
          item.comments,
          item.shares,
        ])
          validateCount(value);
        url.search = "";
        url.hash = "";
        return {
          ...item,
          title: item.title.slice(0, 180),
          url: url.toString(),
        };
      });
      return {
        ...window,
        videos: videoUnknown ? null : window.videos,
        views: videoUnknown ? null : window.views,
        likes: videoUnknown ? null : window.likes,
        comments: videoUnknown ? null : window.comments,
        shares: videoUnknown ? null : window.shares,
        netFollowers: activityUnknown ? null : window.netFollowers,
        profileViews: activityUnknown ? null : window.profileViews,
        accountViews: activityUnknown ? null : window.accountViews,
        topVideos: videoUnknown ? [] : topVideos,
      };
    }),
  };
}
