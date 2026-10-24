import { ConvexError, v, type Infer } from "convex/values";

const count = v.union(v.number(), v.null());
const content = v.object({
  url: v.string(),
  title: v.string(),
  publishedOn: v.string(),
  views: count,
  likes: count,
  comments: count,
  saves: count,
  shares: count,
});
export const instagramSnapshotValidator = v.object({
  provider: v.literal("metricool"),
  brandId: v.literal("7632357"),
  accountHandle: v.literal("onerep_app"),
  timezone: v.literal("Europe/Berlin"),
  capturedAt: v.number(),
  accountAsOf: v.union(v.string(), v.null()),
  followers: count,
  history: v.array(
    v.object({ date: v.string(), contentViews: count, followers: count }),
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
      contentCoverage: v.union(
        v.literal("available"),
        v.literal("partial"),
        v.literal("unverified"),
        v.literal("unavailable"),
      ),
      contentCount: count,
      feedPosts: count,
      reels: count,
      views: count,
      likes: count,
      comments: count,
      saves: count,
      shares: count,
      topContent: v.array(content),
    }),
  ),
});
export type InstagramSnapshot = Infer<typeof instagramSnapshotValidator>;

function validDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}
function validateCount(value: number | null) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0))
    throw new ConvexError(
      "Instagram counts must be finite nonnegative integers or null.",
    );
}

/** Brand-level organic content only. Empty initial provider responses remain unknown. */
export function normalizeInstagramSnapshot(
  input: InstagramSnapshot,
  now: number,
): InstagramSnapshot {
  if (
    !Number.isFinite(input.capturedAt) ||
    input.capturedAt < 0 ||
    input.capturedAt > now + 300_000
  )
    throw new ConvexError("Invalid Instagram snapshot time.");
  if (input.accountAsOf !== null && !validDate(input.accountAsOf))
    throw new ConvexError("Invalid Instagram account date.");
  validateCount(input.followers);
  if (
    input.windows.length !== 3 ||
    new Set(input.windows.map((w) => w.key)).size !== 3
  )
    throw new ConvexError("Provide exactly three Instagram windows.");
  const end = input.windows[0].to;
  for (const window of input.windows) {
    const days = { yesterday: 1, last7: 7, last30: 30 }[window.key];
    if (
      !validDate(window.from) ||
      !validDate(window.to) ||
      window.to !== end ||
      (Date.parse(window.to) - Date.parse(window.from)) / 86_400_000 !==
        days - 1
    )
      throw new ConvexError("Invalid Instagram reporting window.");
  }
  if (input.accountAsOf && input.accountAsOf > end)
    throw new ConvexError(
      "Instagram account date exceeds the reporting window.",
    );
  if (input.history.length > 61)
    throw new ConvexError("Store at most 61 Instagram history days.");
  for (const [index, point] of input.history.entries()) {
    if (
      !validDate(point.date) ||
      point.date > end ||
      point.date <
        new Date(Date.parse(end) - 60 * 86_400_000)
          .toISOString()
          .slice(0, 10) ||
      (index > 0 &&
        Date.parse(point.date) - Date.parse(input.history[index - 1].date) !==
          86_400_000)
    )
      throw new ConvexError(
        "Instagram history must contain consecutive dates within the reporting range.",
      );
    validateCount(point.contentViews);
    validateCount(point.followers);
  }
  return {
    ...input,
    followers: input.accountAsOf === null ? null : input.followers,
    windows: input.windows.map((window) => {
      for (const value of [
        window.contentCount,
        window.feedPosts,
        window.reels,
        window.views,
        window.likes,
        window.comments,
        window.saves,
        window.shares,
      ])
        validateCount(value);
      if (window.topContent.length > 3)
        throw new ConvexError("Store at most three Instagram content items.");
      const topContent = window.topContent.map((item) => {
        let url: URL;
        try {
          url = new URL(item.url);
        } catch {
          throw new ConvexError("Invalid Instagram URL.");
        }
        if (
          url.protocol !== "https:" ||
          url.hostname !== "www.instagram.com" ||
          url.port ||
          url.username ||
          url.password ||
          !/^\/(p|reel)\/[A-Za-z0-9_-]+\/$/.test(url.pathname)
        )
          throw new ConvexError(
            "Only public Instagram content URLs are allowed.",
          );
        if (
          !validDate(item.publishedOn) ||
          item.publishedOn < window.from ||
          item.publishedOn > window.to
        )
          throw new ConvexError(
            "Instagram content is outside its reporting window.",
          );
        for (const value of [
          item.views,
          item.likes,
          item.comments,
          item.saves,
          item.shares,
        ])
          validateCount(value);
        url.search = "";
        url.hash = "";
        return {
          ...item,
          url: url.toString(),
          title: item.title.slice(0, 180),
        };
      });
      const known = ["available", "partial"].includes(window.contentCoverage);
      return {
        ...window,
        contentCount: known ? window.contentCount : null,
        feedPosts: known ? window.feedPosts : null,
        reels: known ? window.reels : null,
        views: known ? window.views : null,
        likes: known ? window.likes : null,
        comments: known ? window.comments : null,
        saves: known ? window.saves : null,
        shares: known ? window.shares : null,
        topContent: known ? topContent : [],
      };
    }),
  };
}
