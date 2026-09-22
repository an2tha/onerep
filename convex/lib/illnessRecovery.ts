import type { QueryCtx } from "../_generated/server";

export async function activeRecovery(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
) {
  return ctx.db
    .query("recoveryEpisodes")
    .withIndex("by_userId_and_active", (q) =>
      q.eq("userId", userId).eq("active", true),
    )
    .unique();
}

export function validRecoveryDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}

/** Dates are deliberately local calendar dates, never elapsed 24-hour periods. */
export function recoveryDates(
  episodes: Array<{ startedOn: string; endedOn?: string }>,
  since: string,
  until: string,
) {
  const dates = new Set<string>();
  for (const episode of episodes) {
    const start = episode.startedOn > since ? episode.startedOn : since;
    const end =
      episode.endedOn && episode.endedOn < until ? episode.endedOn : until;
    for (
      let time = Date.parse(start), count = 0;
      time <= Date.parse(end) && count < 366;
      time += 86400000, count++
    ) {
      dates.add(new Date(time).toISOString().slice(0, 10));
    }
  }
  return [...dates].sort();
}
