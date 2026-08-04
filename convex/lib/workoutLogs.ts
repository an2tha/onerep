import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export type WorkoutLogWrite = {
  date: string;
  sessionId: string;
  slot?: 1 | 2;
  exercises: Doc<"workoutLogs">["exercises"];
  durationSeconds: number;
  /**
   * When the session actually finished. Omit for a live completion; supply it
   * when reconstructing a past workout so the log does not claim the user
   * trained at the moment they got around to typing it in.
   */
  completedAt?: number;
};

/**
 * The widest instant that can plausibly belong to a local calendar date.
 *
 * `date` is a *local* day computed on the client, but the server has no
 * timezone to resolve it against. Anchoring at UTC midnight and widening by the
 * UTC-12…UTC+14 offset range accepts every legitimate client while still
 * rejecting a timestamp from an unrelated week.
 */
function calendarDateWindow(date: string): { start: number; end: number } | null {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnightUtc)) return null;
  const HOUR = 3_600_000;
  return { start: midnightUtc - 14 * HOUR, end: midnightUtc + 38 * HOUR };
}

/**
 * Keeps a client-supplied `completedAt` inside its calendar day and out of the
 * future. Ordering and "when did I train" both read this field, so it is
 * clamped rather than trusted.
 */
export function clampCompletedAt(
  date: string,
  completedAt: number | undefined,
  now: number,
): number {
  if (completedAt === undefined || !Number.isFinite(completedAt)) return now;
  const window = calendarDateWindow(date);
  if (!window) return now;

  const upper = Math.min(window.end, now);
  // A future-dated log has no valid instant to land on; fall back to the write
  // time rather than silently backdating it to the window's edge.
  if (upper < window.start) return now;
  return Math.min(Math.max(completedAt, window.start), upper);
}

/**
 * Finds the session a write should land on.
 *
 * Old clients did not send a session ID. Keep their one-log-per-day behaviour
 * intact, while new clients can safely create two daily sessions.
 */
export async function findWorkoutLog(
  ctx: Ctx,
  userId: string,
  date: string,
  sessionId: string,
  hasExplicitSessionId: boolean,
): Promise<Doc<"workoutLogs"> | null | undefined> {
  if (hasExplicitSessionId) {
    return await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_and_date_and_sessionId", (q) =>
        q.eq("userId", userId).eq("date", date).eq("sessionId", sessionId),
      )
      .unique();
  }
  return (
    await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .take(2)
  ).find((log) => log.sessionId === undefined || log.sessionId === sessionId);
}

/**
 * The single write path into `workoutLogs`.
 *
 * Both manual completion and Apple Health promotion go through here so slot
 * semantics live in exactly one place.
 */
export async function upsertWorkoutLog(
  ctx: MutationCtx,
  userId: string,
  args: WorkoutLogWrite & { hasExplicitSessionId?: boolean },
) {
  const existing = await findWorkoutLog(
    ctx,
    userId,
    args.date,
    args.sessionId,
    args.hasExplicitSessionId ?? true,
  );
  const now = Date.now();
  const completedAt = clampCompletedAt(args.date, args.completedAt, now);

  if (existing) {
    await ctx.db.patch(existing._id, {
      sessionId: args.sessionId,
      ...(args.slot === undefined ? {} : { slot: args.slot }),
      exercises: args.exercises,
      durationSeconds: args.durationSeconds,
      // Editing a saved workout must not restamp when it happened. Only an
      // explicit `completedAt` moves it.
      ...(args.completedAt === undefined ? {} : { completedAt }),
    });
    return existing._id;
  }

  return await ctx.db.insert("workoutLogs", {
    userId,
    date: args.date,
    sessionId: args.sessionId,
    ...(args.slot === undefined ? {} : { slot: args.slot }),
    exercises: args.exercises,
    durationSeconds: args.durationSeconds,
    completedAt,
  });
}

/**
 * The first unoccupied slot on a date, or null when both are taken.
 *
 * `logs.workouts.getLog` reads `.take(2)` per date, so a slot is mandatory:
 * a slot-less log written alongside two others can be silently invisible.
 */
export async function findFreeWorkoutSlot(
  ctx: Ctx,
  userId: string,
  date: string,
  ignoreSessionId?: string,
): Promise<1 | 2 | null> {
  const logs = await ctx.db
    .query("workoutLogs")
    .withIndex("by_userId_date", (q) => q.eq("userId", userId).eq("date", date))
    .take(2);
  const occupied = new Set(
    logs
      .filter((log) => log.sessionId !== ignoreSessionId)
      .map((log, index) => log.slot ?? ((index + 1) as 1 | 2)),
  );
  if (!occupied.has(1)) return 1;
  if (!occupied.has(2)) return 2;
  return null;
}
