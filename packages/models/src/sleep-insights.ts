/** Portable contracts for sleep and daily-review presentation. */
export type SleepNight = {
  date: string; score: number; minutes: number; target: number;
  baseline: number | null; usualRange: { low: number; high: number } | null;
  baselineNights: number; efficiency: number | null; awake: number | null;
  timingShift: number | null; coverageKeys: string[]; provider: string;
  providerChanged: boolean; coverageChanged: boolean; updatedAt: number | null;
  stages: Array<{ key: string; label: string; minutes: number }>;
  unclassifiedMinutes: number; napMinutes: number | null; totalMinutes: number;
  startMinutes: number | null; endMinutes: number | null;
  shortfall: number; shortfallNights: number; shortfallStart: string;
  focus: string;
};
export type SleepHistory = Array<{ date: string; target: number; sleep: SleepNight | null }>;
export type ConnectedReviewData = {
  date: string; since: string; focus: string; latestSleepDate: string | null;
  sleepNights: number; belowGoalNights: number; shortNights: boolean;
  sessions: number; trainingDays: number; trainingMinutes: number;
  lastSession: { date: string; name: string; minutes: number; workingSets: number | null } | null;
  trainingIncomplete: boolean; foodDays: number;
  checkIn: { energy: number; soreness: number; sleepQuality: number } | null;
  signals: number;
};
export type InsightKey = "sleep" | "training" | "nutrition" | "checkIn";
export type TodayInsightSettings = { order: InsightKey[]; hidden: InsightKey[] };
