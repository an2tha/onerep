import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import {
  scoreSleep,
  scoreStrain,
  median,
  type LoadSession,
} from "../lib/sleepStrain";
import { shiftDate } from "../lib/healthSeries";
import { summarizeRecovery } from "../lib/recovery";

function dateKey(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error("Choose a valid date.");
  return date;
}
export async function sleepContext(
  ctx: QueryCtx,
  userId: string,
  date: string,
) {
  dateKey(date);
  const since = shiftDate(date, -55);
  const [days, imported, logged, prefs, review] = await Promise.all([
    ctx.db
      .query("healthMetrics")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", userId).gte("date", since).lte("date", date),
      )
      .take(60),
    ctx.db
      .query("healthWorkouts")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", userId).gte("date", since).lte("date", date),
      )
      .take(500),
    ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", userId).gte("date", since).lte("date", date),
      )
      .take(300),
    ctx.db
      .query("sleepPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
    ctx.db
      .query("sleepReviews")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .unique(),
  ]);
  const matchesLog = (
    w: (typeof imported)[number],
    l: (typeof logged)[number],
  ) =>
    (Boolean(w.linkedSessionId) &&
      l.sessionId === w.linkedSessionId &&
      l.date === w.linkedDate) ||
    l.exercises.some((e) => e.cardio?.source?.externalId === w.externalId) ||
    (l.date === w.date &&
      /onerep/i.test(`${w.sourceName ?? ""} ${w.sourceBundleId ?? ""}`) &&
      Math.abs(l.durationSeconds - w.durationSeconds) < 120 &&
      Math.abs(l.completedAt - w.endedAt) < 120000);
  const sessions: LoadSession[] = imported
    .filter((w) => !logged.some((l) => matchesLog(w, l)))
    .map((w) => ({
      id: String(w._id),
      name: w.activityName,
      date: w.date,
      startedAt: w.startedAt,
      minutes: w.durationSeconds / 60,
      ...(w.activeEnergyKcal !== undefined
        ? { energy: w.activeEnergyKcal }
        : {}),
      ...(w.avgHeartRateBpm !== undefined
        ? { heartRate: w.avgHeartRateBpm }
        : {}),
    }));
  for (const w of logged) {
    const sets = w.exercises
      .flatMap((e) => (Array.isArray(e.sets) ? e.sets : []))
      .filter((s) => s.completed && s.type !== "warmup");
    const efforts = sets
      .map((s) => s.rpe ?? (s.rir !== undefined ? 10 - s.rir : undefined))
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    const source = imported.find((i) => matchesLog(i, w));
    const zoneLoad = w.exercises.reduce(
      (sum, e) =>
        sum +
        [1, 2, 3, 4, 5].reduce(
          (s, zone) =>
            s +
            ((Number(e.cardio?.heartRateZones?.[`zone${zone}Seconds`]) || 0) /
              60) *
              zone *
              2,
          0,
        ),
      0,
    );
    sessions.push({
      id: String(w._id),
      name:
        w.exercises
          .slice(0, 2)
          .map((e) => String(e.name ?? "Workout"))
          .join(" · ") || "Workout",
      date: w.date,
      startedAt: source?.startedAt ?? w.completedAt - w.durationSeconds * 1000,
      minutes: w.durationSeconds / 60,
      hardSets: sets.length,
      ...(source?.activeEnergyKcal !== undefined
        ? { energy: source.activeEnergyKcal }
        : {}),
      ...(efforts.length
        ? { effort: efforts.reduce((s, n) => s + n, 0) / efforts.length }
        : {}),
      ...(zoneLoad ? { zoneLoad } : {}),
    });
  }
  const day = days.find((d) => d.date === date);
  const target = prefs?.targetMinutes ?? 480;
  const sleep = day ? scoreSleep(day, days, target) : null;
  const strain = scoreStrain(
    day,
    sessions.filter((s) => s.date === date),
    days,
  );
  const history = Array.from({ length: 28 }, (_, index) =>
    shiftDate(date, index - 27),
  ).map((key) => ({
    date: key,
    sleep: days.find((d) => d.date === key)
      ? scoreSleep(
          days.find((d) => d.date === key)!,
          days,
          target,
        )
      : null,
    strain: scoreStrain(
      days.find((d) => d.date === key),
      sessions.filter((s) => s.date === key),
      days.filter((d) => d.date < key),
    ),
  }));
  const recovery = summarizeRecovery(days, date);
  const [goals, checkIns, priorReviews] = await Promise.all([
    ctx.db
      .query("coachGoals")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .take(8),
    ctx.db
      .query("coachCheckIns")
      .withIndex("by_userId_and_date", (q) =>
        q
          .eq("userId", userId)
          .gte("date", shiftDate(date, -13))
          .lte("date", date),
      )
      .take(28),
    ctx.db
      .query("sleepReviews")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", userId).lt("date", date),
      )
      .order("desc")
      .take(3),
  ]);
  const fingerprint = JSON.stringify({
    day: day ?? null,
    target,
    days: days.map((d) => [d.date, d.updatedAt]),
    sessions,
    goals: goals.map((g) => [g._id, g.updatedAt]),
    checkIns: checkIns.map((c) => [c._id, c.updatedAt]),
  });
  return {
    date,
    sleep,
    strain,
    strainBaseline: median(
      history
        .filter((d) => d.date < date && d.strain.score !== null)
        .map((d) => d.strain.score!),
    ),
    history,
    recovery,
    goals: goals.map((g) => ({
      title: g.title,
      description: g.description ?? null,
    })),
    checkIns: checkIns.map((c) => ({
      date: c.date,
      sleepQuality: c.sleepQuality,
      energy: c.energy,
      soreness: c.soreness,
      note: c.note ?? null,
    })),
    preferences: {
      automaticReview: prefs?.automaticReview ?? false,
      targetMinutes: target,
    },
    review,
    previousReview:
      priorReviews.find((r) => r.status === "ready")?.review ?? null,
    fingerprint,
    reviewStale: Boolean(review && review.fingerprint !== fingerprint),
  };
}
export const dashboard = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    return sleepContext(ctx, user._id, date);
  },
});

export const reviewHistory = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const boundedLimit = Math.max(1, Math.min(60, Math.floor(limit)));
    const reviews = await ctx.db
      .query("sleepReviews")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(Math.min(120, boundedLimit * 2));

    return reviews
      .filter(
        (review) => review.status === "ready" && Boolean(review.review?.trim()),
      )
      .slice(0, boundedLimit)
      .map((review) => ({
        _id: review._id,
        date: review.date,
        review: review.review!,
        updatedAt: review.updatedAt,
      }));
  },
});

export const context = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: (ctx, args) => sleepContext(ctx, args.userId, args.date),
});
export const preferences = mutation({
  args: { automaticReview: v.boolean(), targetMinutes: v.number() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (
      !Number.isFinite(args.targetMinutes) ||
      args.targetMinutes < 420 ||
      args.targetMinutes > 600
    )
      throw new Error("Choose a sleep goal between 7 and 10 hours.");
    const existing = await ctx.db
      .query("sleepPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, args);
    else await ctx.db.insert("sleepPreferences", { userId: user._id, ...args });
  },
});
export const claimReview = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    fingerprint: v.string(),
    force: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sleepReviews")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();
    if (
      existing?.status === "pending" &&
      Date.now() - existing.updatedAt < 120000
    )
      return null;
    if (
      !args.force &&
      existing &&
      (existing.fingerprint === args.fingerprint ||
        Date.now() - existing.updatedAt < 6 * 3600000)
    )
      return null;
    const fields = {
      userId: args.userId,
      date: args.date,
      fingerprint: args.fingerprint,
      status: "pending" as const,
      updatedAt: Date.now(),
      error: undefined,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return ctx.db.insert("sleepReviews", fields);
  },
});
export const finishReview = internalMutation({
  args: {
    id: v.id("sleepReviews"),
    fingerprint: v.string(),
    review: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.fingerprint !== args.fingerprint) return;
    await ctx.db.patch(args.id, {
      status: args.error ? "error" : "ready",
      review: args.review,
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});
