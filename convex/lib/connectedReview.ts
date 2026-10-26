import { shiftDate } from "./healthSeries";
import type { LoadSession, scoreSleep } from "./sleepStrain";

type Night = NonNullable<ReturnType<typeof scoreSleep>>;
export function buildConnectedReview(input: {
  date: string;
  nights: Night[];
  sessions: LoadSession[];
  checkIns: Array<{
    date: string;
    energy: number;
    soreness: number;
    sleepQuality: number;
    kind?: string;
  }>;
  foodDays: Array<{ date: string; entries: unknown[] }>;
  trainingIncomplete?: boolean;
}) {
  const since = shiftDate(input.date, -6);
  const nights = input.nights.filter(
    (n) => n.date >= since && n.date <= input.date,
  );
  const sessions = input.sessions.filter(
    (s) => s.date >= since && s.date <= input.date,
  );
  const latest = nights.at(-1) ?? null;
  const checkIn =
    input.checkIns
      .filter((c) => c.date === input.date && (!c.kind || c.kind === "daily"))
      .at(-1) ?? null;
  const lastTwo = nights.filter((n) => n.date >= shiftDate(input.date, -1));
  const shortNights =
    lastTwo.length === 2 && lastTwo.every((n) => n.minutes < n.target - 30);
  const latestDate = sessions.map((session) => session.date).sort().at(-1);
  const latestSessions = sessions.filter((session) => session.date === latestDate);
  const lastSession = latestSessions.length === 1 ? latestSessions[0]!
    : latestSessions.length > 1 && latestSessions.every((session) => Number.isFinite(session.startedAt))
      ? [...latestSessions].sort((a, b) => b.startedAt! - a.startedAt!)[0]!
      : null;
  const foodDays = input.foodDays.filter(
    (d) => d.date >= since && d.date <= input.date && d.entries.length > 0,
  ).length;
  const trainingDays = new Set(sessions.map((s) => s.date)).size;
  const signals = [
    nights.length > 0,
    sessions.length > 0,
    foodDays > 0,
    checkIn !== null,
  ].filter(Boolean).length;
  // Co-occurrence supports a review, never a causal claim or an automatic plan edit.
  const focus =
    checkIn && (checkIn.energy <= 2 || checkIn.soreness >= 4)
      ? "checkIn"
      : shortNights
        ? "sleep"
        : signals >= 2
          ? "review"
          : "coverage";
  return {
    date: input.date,
    since,
    focus,
    latestSleepDate: latest?.date ?? null,
    sleepNights: nights.length,
    belowGoalNights: nights.filter((n) => n.minutes < n.target).length,
    shortNights,
    sessions: sessions.length,
    trainingDays,
    trainingMinutes: Math.round(
      sessions.reduce((sum, s) => sum + s.minutes, 0),
    ),
    lastSession: lastSession
      ? {
          date: lastSession.date,
          name: lastSession.name,
          minutes: Math.round(lastSession.minutes),
          workingSets: lastSession.hardSets ?? null,
        }
      : null,
    trainingIncomplete: input.trainingIncomplete ?? false,
    foodDays,
    checkIn: checkIn
      ? {
          energy: checkIn.energy,
          soreness: checkIn.soreness,
          sleepQuality: checkIn.sleepQuality,
        }
      : null,
    signals,
  };
}
