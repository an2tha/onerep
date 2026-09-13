/** Product planning heuristics, not a clinical clearance or measured physiology. */
export const PROGRAMME_RULE_VERSION = 1;
export function programmeNeedsCare(
  profile:
    | { age?: number; safetyMode?: string; safetyFlags?: string[] }
    | null
    | undefined,
) {
  return (
    !!profile &&
    ((profile.age ?? 18) < 18 ||
      ["recovery", "clinician", "habit"].includes(profile.safetyMode ?? "") ||
      (profile.safetyFlags ?? []).some(
        (flag) => flag.trim() !== "" && flag !== "none",
      ))
  );
}
export type ProgrammeGoal = "maintain" | "step_down" | "step_up";
export type Programme = {
  goal: ProgrammeGoal;
  startDate: string;
  weeks: number;
  baselineCalories: number;
  changePercent: number;
  protein: number;
  fat: number;
  fastingHours: number;
  eatingStart: string;
  timezone: string;
  endedDate?: string;
};
export const PROGRAMME_NAMES: Record<ProgrammeGoal, string> = {
  maintain: "Steady & strong",
  step_down: "Gradual step down",
  step_up: "Fuel & build",
};
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function programmeDay(programme: Programme, date: string) {
  const day = Math.floor(
    (Date.parse(date) - Date.parse(programme.startDate)) / 86400000,
  );
  const active =
    day >= 0 &&
    day < programme.weeks * 7 &&
    (!programme.endedDate || date < programme.endedDate);
  const week = Math.max(1, Math.min(programme.weeks, Math.floor(day / 7) + 1));
  const phase =
    week === 1
      ? "Settle in"
      : week === programme.weeks
        ? "Stabilise"
        : "Progress";
  const progression = Math.min(
    1,
    Math.max(0, (week - 1) / Math.max(1, programme.weeks - 2)),
  );
  const direction =
    programme.goal === "step_down" ? -1 : programme.goal === "step_up" ? 1 : 0;
  const calories = Math.round(
    programme.baselineCalories *
      (1 + ((direction * programme.changePercent) / 100) * progression),
  );
  return {
    active,
    day,
    week,
    phase,
    progress: Math.max(0, Math.min(1, (day + 1) / (programme.weeks * 7))),
    targets: {
      calories,
      protein: programme.protein,
      fat: programme.fat,
      carbs: Math.max(
        0,
        Math.round((calories - programme.protein * 4 - programme.fat * 9) / 4),
      ),
    },
  };
}
export function localProgrammeTime(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
export function isScheduledFast(programme: Programme, minute: number) {
  if (!programme.fastingHours) return false;
  const [hour, min] = programme.eatingStart.split(":").map(Number);
  return (
    (minute - (hour! * 60 + min!) + 1440) % 1440 >=
    (24 - programme.fastingHours) * 60
  );
}
export type StrainSet = {
  completed?: boolean;
  type?: string;
  reps?: string | number;
  rpe?: string | number;
  weight?: string | number;
};
export type StrainExercise = {
  sets?: StrainSet[];
  cardio?: {
    durationHours?: string | number;
    durationMinutes?: string | number;
    durationSeconds?: string | number;
  };
};
/** Same saturation curve and hard-set load units as sleepStrain.scoreStrain. */
export function plannedWorkoutStrain(data: Record<string, StrainExercise>) {
  let load = 0;
  let count = 0;
  for (const exercise of Object.values(data)) {
    for (const set of exercise.sets ?? []) {
      if (set.type === "warmup") continue;
      const rpe = Number(set.rpe);
      load +=
        (Number.isFinite(rpe) && rpe > 0 ? Math.max(1, Math.min(10, rpe)) : 6) *
        6;
      count++;
    }
    const seconds =
      Number(exercise.cardio?.durationHours || 0) * 3600 +
      Number(exercise.cardio?.durationMinutes || 0) * 60 +
      Number(exercise.cardio?.durationSeconds || 0);
    if (Number.isFinite(seconds) && seconds > 0) {
      load += (seconds / 60) * 4;
      count++;
    }
  }
  return count ? Math.round(100 * (1 - Math.exp(-load / 500))) : null;
}
export function programmeCompatibility(
  programme: Programme,
  date: string,
  minute: number,
  strain: number | null,
  activeFast = false,
) {
  const day = programmeDay(programme, date);
  const deficit = Math.max(
    0,
    1 - day.targets.calories / programme.baselineCalories,
  );
  const fasting = activeFast || isScheduledFast(programme, minute);
  const ceiling = Math.round(75 - deficit * 100 - (fasting ? 15 : 0));
  const status =
    !day.active || strain === null || !Number.isFinite(strain)
      ? "unknown"
      : strain > ceiling
        ? "too_demanding"
        : strain > ceiling - 10
          ? "watch"
          : "compatible";
  return {
    status,
    ceiling,
    strain,
    fasting,
    version: PROGRAMME_RULE_VERSION,
    reason:
      status === "unknown"
        ? "Add a workout to estimate its training strain."
        : `${fasting ? "Your fasting window" : "Your current nutrition phase"}${deficit > 0 ? ` and ${Math.round(deficit * 100)}% calorie step down` : ""} set a planning ceiling of ${ceiling}/100.`,
  };
}
