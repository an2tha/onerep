import type { GoalFocus } from "./goalNutrition";

/** v1 is a transparent planning heuristic, not a validated readiness or growth test. */
export const ASSESSMENT_VERSION = 1;
export const MUSCLE_GROUPS = [
  "chest",
  "lats",
  "upper back",
  "lower back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "abdominals",
  "adductors",
  "abductors",
];
const ALIASES: Record<string, string> = {
  quads: "quadriceps",
  abs: "abdominals",
  core: "abdominals",
  abdominals: "abdominals",
  deltoids: "shoulders",
  "front deltoids": "shoulders",
  "rear deltoids": "shoulders",
  "side deltoids": "shoulders",
  "front delts": "shoulders",
  "rear delts": "shoulders",
  traps: "upper back",
  trapezius: "upper back",
  rhomboids: "upper back",
  "middle back": "upper back",
  back: "upper back",
  "erector spinae": "lower back",
  pectorals: "chest",
  "latissimus dorsi": "lats",
  hip_adductors: "adductors",
  hip_abductors: "abductors",
};
export function assessmentMuscle(value: string) {
  const key = value.trim().toLowerCase();
  return ALIASES[key] ?? key;
}
export function assessmentDate(date: string, shift: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + shift * 86400000)
    .toISOString()
    .slice(0, 10);
}
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}
const round = (n: number, places = 1) =>
  Math.round(n * 10 ** places) / 10 ** places;
const bounded = (n: number) => Math.max(0, Math.min(100, n));
function number(value: unknown): number | null {
  if (value === "" || value == null || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
export type AssessmentHealth = {
  date: string;
  provider: string;
  sleepMinutes?: number;
  sleepDeepMinutes?: number;
  sleepRemMinutes?: number;
  sleepStartMinutes?: number;
  steps?: number;
  restingHeartRateBpm?: number;
  hrvMs?: number;
  activeEnergyKcal?: number;
  manualFields?: string[];
};
export type AssessmentInput = {
  today: string;
  plan: {
    focus: GoalFocus;
    muscle: string;
    minimumSets: number;
    maximumSets: number;
  };
  workouts: {
    date: string;
    sessionId?: string;
    exercises: unknown[];
    durationSeconds: number;
  }[];
  catalog: Record<
    string,
    { primaryMuscles: string[]; secondaryMuscles: string[] }
  >;
  health: AssessmentHealth[];
  food: { date: string; entries: unknown[] }[];
  body: { loggedAt: string; weightKg?: number; waistCm?: number }[];
  activities: {
    date: string;
    provider: string;
    externalId: string;
    durationSeconds: number;
    linkedSessionId?: string;
    linkedDate?: string;
    dismissedAt?: number;
  }[];
  journal: {
    date: string;
    mood?: number;
    alcohol?: number;
    caffeine?: number;
  }[];
  proteinTarget: number | null;
  paused: boolean;
  truncated: boolean;
};
export type AssessmentSignal = {
  recent: number | null;
  baseline: number | null;
  changePercent: number | null;
  recentReadings: number;
  baselineReadings: number;
  latestDate: string | null;
  source: string | null;
};
export type AssessmentFactor = {
  id: string;
  score: number | null;
  weight: number;
  reason: string;
  values: Record<string, number | string>;
};
export type AssessmentSuggestion = {
  id: string;
  priority: number;
  title: string;
  detail: string;
  values: Record<string, number | string>;
  destination: string;
};
export type AssessedMuscle = {
  muscle: string;
  direct: number;
  indirect: number;
  weighted: number;
  previous: number;
  lastDate: string | null;
  daysSince: number | null;
  sessions: number;
  min: number | null;
  max: number | null;
  basis: "chosen" | "history" | "none";
  score: number | null;
  closeSpacing: boolean;
  effortReadings: number;
  hardSets: number;
};

export function buildGoalAssessment(input: AssessmentInput) {
  const { today, plan } = input;
  const recentStart = assessmentDate(today, -6);
  const oldest = assessmentDate(today, -27);
  const sensorStart = assessmentDate(today, -2);
  const health = [
    ...new Map(
      input.health
        .filter((r) => r.date >= oldest && r.date <= today)
        .map((r) => [r.date, r]),
    ).values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
  function signal(
    key: "sleepMinutes" | "restingHeartRateBpm" | "hrvMs" | "steps",
    completeDays = false,
  ): AssessmentSignal {
    const cutoff = completeDays ? assessmentDate(today, -1) : today;
    const from = completeDays ? assessmentDate(today, -7) : sensorStart;
    const bounds =
      key === "steps"
        ? [0, 100000]
        : key === "sleepMinutes"
          ? [1, 1440]
          : key === "hrvMs"
            ? [1, 500]
            : [20, 220];
    const candidates = health.filter(
      (r) =>
        r.date <= cutoff &&
        typeof r[key] === "number" &&
        Number.isFinite(r[key]) &&
        r[key]! >= bounds[0] &&
        r[key]! <= bounds[1] &&
        !(
          key === "hrvMs" &&
          (r.provider === "manual" || r.manualFields?.includes(key))
        ),
    );
    const latest = candidates.at(-1);
    const compatible = candidates.filter(
      (r) => r.provider === latest?.provider,
    );
    const current = compatible.filter((r) => r.date >= from);
    const prior = compatible.filter((r) => r.date < from);
    const recent =
      current.length >= (completeDays ? 4 : 2)
        ? mean(current.map((r) => r[key]!))
        : null;
    const baseline =
      prior.length >= 7 ? median(prior.map((r) => r[key]!)) : null;
    return {
      recent: recent === null ? null : round(recent),
      baseline: baseline === null ? null : round(baseline),
      changePercent:
        recent !== null && baseline !== null && baseline > 0
          ? round((recent / baseline - 1) * 100)
          : null,
      recentReadings: current.length,
      baselineReadings: prior.length,
      latestDate: latest?.date ?? null,
      source: latest?.provider ?? null,
    };
  }
  const sleep = signal("sleepMinutes");
  const rhr = signal("restingHeartRateBpm");
  const hrv = signal("hrvMs");
  const steps = signal("steps", true);
  const shortSleep = sleep.recent !== null && sleep.recent < 360;
  const sleepDrop =
    sleep.recent !== null &&
    sleep.baseline !== null &&
    sleep.baseline - sleep.recent >= 45;
  const cardiacFlags =
    Number((rhr.changePercent ?? 0) >= 5) +
    Number((hrv.changePercent ?? 0) <= -10);
  const caution = shortSleep || Number(sleepDrop) + cardiacFlags >= 2;
  const severe = sleep.recent !== null && sleep.recent < 300;
  const muscles = new Map<
    string,
    {
      days: Map<
        string,
        { direct: number; indirect: number; effort: number; hard: number }
      >;
    }
  >();
  for (const muscle of [...MUSCLE_GROUPS, assessmentMuscle(plan.muscle)])
    muscles.set(muscle, { days: new Map() });
  let workingSets = 0,
    mappedSets = 0;
  const workoutDays = new Set<string>();
  const performances = new Map<
    string,
    { date: string; e1rm: number; rir: number; reps: number }[]
  >();
  const logs = input.workouts.filter(
    (r) => r.date >= oldest && r.date <= today,
  );
  for (const log of logs)
    for (const raw of log.exercises) {
      const ex = record(raw);
      const id =
        typeof ex.id === "string"
          ? ex.id
          : typeof ex.exerciseId === "string"
            ? ex.exerciseId
            : "";
      const sets = (Array.isArray(ex.sets) ? ex.sets : [])
        .map(record)
        .filter(
          (s) =>
            s.completed === true &&
            !["warmup", "warm-up", "warm_up"].includes(
              String(s.type ?? "").toLowerCase(),
            ),
        );
      if (!sets.length) continue;
      if (log.date >= recentStart) {
        workingSets += sets.length;
        workoutDays.add(log.date);
      }
      const meta = input.catalog[id];
      if (
        meta &&
        (meta.primaryMuscles.length || meta.secondaryMuscles.length)
      ) {
        if (log.date >= recentStart) mappedSets += sets.length;
        const primary = new Set(
          meta.primaryMuscles.map(assessmentMuscle).filter(Boolean),
        );
        const secondary = new Set(
          meta.secondaryMuscles
            .map(assessmentMuscle)
            .filter((m) => m && !primary.has(m)),
        );
        const efforts = sets
          .map((s) => {
            const rir = number(s.rir);
            const rpe = number(s.rpe);
            return rir !== null && rir >= 0 && rir <= 10
              ? rir
              : rpe !== null && rpe >= 1 && rpe <= 10
                ? 10 - rpe
                : null;
          })
          .filter((n): n is number => n !== null);
        for (const muscle of [...primary, ...secondary]) {
          if (!muscles.has(muscle)) muscles.set(muscle, { days: new Map() });
          const days = muscles.get(muscle)!.days;
          const day = days.get(log.date) ?? {
            direct: 0,
            indirect: 0,
            effort: 0,
            hard: 0,
          };
          day[primary.has(muscle) ? "direct" : "indirect"] += sets.length;
          day.effort += efforts.length;
          day.hard += efforts.filter((r) => r <= 1).length;
          days.set(log.date, day);
        }
      }
      const comparable = sets
        .flatMap((s) => {
          const weight = number(s.weight),
            reps = number(s.reps),
            rir = number(s.rir),
            rpe = number(s.rpe);
          const effort =
            rir ?? (rpe !== null && rpe >= 1 && rpe <= 10 ? 10 - rpe : null);
          if (
            weight === null ||
            weight <= 0 ||
            reps === null ||
            reps < 1 ||
            reps > 15 ||
            effort === null ||
            effort < 0 ||
            effort > 5 ||
            !id
          )
            return [];
          return [
            {
              date: log.date,
              e1rm: weight * (1 + reps / 30),
              rir: effort,
              reps,
            },
          ];
        })
        .sort((a, b) => b.e1rm - a.e1rm);
      if (comparable[0])
        performances.set(id, [...(performances.get(id) ?? []), comparable[0]]);
    }
  const muscleRows: AssessedMuscle[] = [...muscles].map(
    ([muscle, { days }]) => {
      const entries = [...days].sort((a, b) => a[0].localeCompare(b[0]));
      const recent = entries.filter(([d]) => d >= recentStart);
      const direct = recent.reduce((s, [, v]) => s + v.direct, 0),
        indirect = recent.reduce((s, [, v]) => s + v.indirect, 0);
      const weekly = [1, 2, 3].map((w) =>
        entries
          .filter(
            ([d]) =>
              d >= assessmentDate(today, -6 - w * 7) &&
              d <= assessmentDate(today, -w * 7),
          )
          .reduce((s, [, v]) => s + v.direct + v.indirect * 0.5, 0),
      );
      const baseline =
        weekly.filter((n) => n > 0).length >= 2 ? median(weekly) : null;
      const chosen =
        muscle === assessmentMuscle(plan.muscle) && plan.focus !== "endurance";
      const min = chosen
        ? plan.minimumSets
        : baseline !== null
          ? Math.max(1, round(baseline * 0.8))
          : null;
      const max = chosen
        ? plan.maximumSets
        : baseline !== null
          ? Math.max(2, round(baseline * 1.2))
          : null;
      const measured = chosen ? direct : direct + indirect * 0.5;
      const score =
        workingSets > 0 && min !== null && max !== null
          ? round(
              bounded(
                measured < min
                  ? (measured / min) * 100
                  : measured > max
                    ? 100 - ((measured - max) / max) * 100
                    : 100,
              ),
              0,
            )
          : null;
      const lastDate = entries.at(-1)?.[0] ?? null;
      const closeSpacing = recent.some(
        ([d, v], i) =>
          i > 0 &&
          Date.parse(d) - Date.parse(recent[i - 1][0]) <= 86400000 &&
          v.direct + v.indirect * 0.5 >= 5 &&
          recent[i - 1][1].direct + recent[i - 1][1].indirect * 0.5 >= 5,
      );
      return {
        muscle,
        direct,
        indirect,
        weighted: direct + indirect * 0.5,
        previous: weekly[0],
        lastDate,
        daysSince:
          lastDate === null
            ? null
            : Math.round((Date.parse(today) - Date.parse(lastDate)) / 86400000),
        sessions: recent.length,
        min,
        max,
        basis: chosen
          ? ("chosen" as const)
          : baseline !== null
            ? ("history" as const)
            : ("none" as const),
        score,
        closeSpacing,
        effortReadings: recent.reduce((s, [, v]) => s + v.effort, 0),
        hardSets: recent.reduce((s, [, v]) => s + v.hard, 0),
      };
    },
  );
  const liftChanges = [...performances].flatMap(([id, sessions]) => {
    const unique = [
      ...new Map(
        sessions.sort((a, b) => a.e1rm - b.e1rm).map((s) => [s.date, s]),
      ).values(),
    ].sort((a, b) => a.date.localeCompare(b.date));
    if (unique.length < 4 || unique.at(-1)!.date < recentStart) return [];
    const latest = unique.at(-1)!;
    const similar = unique.filter(
      (s) =>
        Math.abs(s.rir - latest.rir) <= 1 &&
        Math.abs(s.reps - latest.reps) <= 3,
    );
    if (similar.length < 4) return [];
    const previous = mean(similar.slice(0, -2).map((s) => s.e1rm))!;
    const recent = mean(similar.slice(-2).map((s) => s.e1rm))!;
    return [
      {
        id,
        change: round((recent / previous - 1) * 100),
        sessions: similar.length,
      },
    ];
  });
  // Imported sessions linked to OneRep's training log are excluded to prevent double counting.
  const imported = [
    ...new Map(
      input.activities
        .filter(
          (a) =>
            a.date >= oldest &&
            a.date <= today &&
            a.dismissedAt === undefined &&
            !a.linkedSessionId &&
            !a.linkedDate,
        )
        .map((a) => [`${a.provider}:${a.externalId}`, a]),
    ).values(),
  ];
  const exerciseMinutes = (from: string, to: string) =>
    round(
      [...logs, ...imported]
        .filter((r) => r.date >= from && r.date <= to)
        .reduce(
          (s, r) =>
            s +
            (Number.isFinite(r.durationSeconds) && r.durationSeconds > 0
              ? r.durationSeconds / 60
              : 0),
          0,
        ),
      0,
    );
  const minutes = exerciseMinutes(recentStart, today),
    previousMinutes = exerciseMinutes(
      assessmentDate(today, -13),
      assessmentDate(today, -7),
    );
  const loadChange =
    previousMinutes > 0 ? round((minutes / previousMinutes - 1) * 100) : null;
  const trainingScores = muscleRows
    .filter((m) => m.score !== null)
    .map((m) => m.score!);
  const mappingCoverage = workingSets ? mappedSets / workingSets : 0;
  const spacingAvailable = muscleRows.some((m) => m.sessions >= 2);
  const compressed = muscleRows.filter((m) => m.closeSpacing);
  const latestPerformance = median(liftChanges.map((l) => l.change));
  const factors: AssessmentFactor[] = [
    {
      id: "training",
      score:
        plan.focus === "endurance"
          ? loadChange === null
            ? null
            : loadChange > 30
              ? 60
              : minutes > 0
                ? 90
                : 40
          : mappingCoverage >= 0.8 && trainingScores.length >= 2
            ? round(mean(trainingScores)!, 0)
            : null,
      weight: 35,
      reason:
        plan.focus === "endurance"
          ? "Recorded exercise minutes compared with the previous seven days. Intensity and terrain may differ."
          : "Set ranges for muscles with a chosen target or at least two prior weeks of training. Unmapped sets reduce coverage.",
      values: {
        mapped: round(mappingCoverage * 100, 0),
        groups: trainingScores.length,
        minutes,
        previousMinutes,
      },
    },
    {
      id: "spacing",
      score: spacingAvailable
        ? compressed.length && caution
          ? 45
          : compressed.length
            ? 80
            : 100
        : null,
      weight: 10,
      reason:
        "Repeated sessions of at least five weighted sets on consecutive dates are reviewed alongside recovery signals. Days off do not prove a muscle has recovered.",
      values: { groups: compressed.length },
    },
    {
      id: "sleep",
      score:
        sleep.recent === null
          ? null
          : Math.round(
              bounded(
                (sleep.recent >= 420 ? 100 : (sleep.recent / 420) * 100) -
                  (sleepDrop ? 15 : 0),
              ),
            ),
      weight: 20,
      reason:
        "Average of at least two readings in the last three days. Seven hours is a general reference, not an individual sleep prescription.",
      values: { minutes: sleep.recent ?? 0, readings: sleep.recentReadings },
    },
    {
      id: "recovery",
      score:
        hrv.changePercent === null && rhr.changePercent === null
          ? null
          : cardiacFlags === 2
            ? 40
            : cardiacFlags === 1
              ? 70
              : 100,
      weight: 20,
      reason:
        "Recent resting heart rate and HRV against an earlier personal baseline from the same provider. At least seven baseline and two recent readings are required. These signals cannot diagnose muscle recovery.",
      values: {
        signals:
          Number(hrv.changePercent !== null) +
          Number(rhr.changePercent !== null),
      },
    },
    {
      id: "activity",
      score:
        steps.changePercent === null
          ? null
          : steps.changePercent < -50
            ? 65
            : steps.changePercent > 100
              ? 75
              : 100,
      weight: 5,
      reason:
        "Steps on completed days compared with your earlier baseline. More steps do not earn a higher score. Planned rest can explain a decrease.",
      values: { steps: steps.recent ?? 0, readings: steps.recentReadings },
    },
    {
      id: "performance",
      score:
        latestPerformance === null
          ? null
          : latestPerformance < -3
            ? 45
            : latestPerformance > 3
              ? 100
              : plan.focus === "deficit"
                ? 100
                : 90,
      weight: 10,
      reason:
        "Estimated strength changes from at least four sessions with comparable reps and logged effort. Bodyweight-only exercises and sets without effort data are not graded.",
      values: { lifts: liftChanges.length, change: latestPerformance ?? 0 },
    },
  ];
  if (input.truncated) {
    for (const f of factors.filter((f) =>
      ["training", "spacing", "performance"].includes(f.id),
    ))
      f.score = null;
  }
  // Training coverage reflects all tracked groups, including ungraded groups.
  const muscleCoverage = trainingScores.length / muscleRows.length;
  const availableWeight = (f: AssessmentFactor) =>
    f.score === null
      ? 0
      : f.weight *
        (f.id === "training" && plan.focus !== "endurance"
          ? muscleCoverage
          : 1);
  const available = factors.reduce((s, f) => s + availableWeight(f), 0);
  const coverage = Math.round(available);
  const enough =
    coverage >= 70 &&
    factors[0].score !== null &&
    (factors[2].score !== null || factors[3].score !== null);
  const raw = coverage
    ? factors.reduce((s, f) => s + (f.score ?? 0) * availableWeight(f), 0) /
      available
    : null;
  const score =
    input.paused || !enough || raw === null
      ? null
      : Math.round(Math.min(raw, severe ? 40 : caution ? 60 : 100) / 5) * 5;
  const foodDays = input.food.filter(
    (r) =>
      r.date >= assessmentDate(today, -7) && r.date < today && r.entries.length,
  );
  const protein = mean(
    foodDays.map((r) =>
      r.entries.reduce<number>(
        (s, entry) => s + Math.max(0, number(record(entry).protein) ?? 0),
        0,
      ),
    ),
  );
  const calories = mean(
    foodDays.map((r) =>
      r.entries.reduce<number>(
        (s, entry) => s + Math.max(0, number(record(entry).calories) ?? 0),
        0,
      ),
    ),
  );
  const weights = [
    ...new Map(
      input.body
        .filter(
          (r) =>
            r.loggedAt.slice(0, 10) <= today &&
            r.weightKg !== undefined &&
            Number.isFinite(r.weightKg) &&
            r.weightKg! > 0,
        )
        .map((r) => [r.loggedAt.slice(0, 10), r.weightKg!]),
    ).entries(),
  ];
  const newWeights = weights.filter(([d]) => d >= recentStart);
  const oldWeights = weights.filter(
    ([d]) => d >= assessmentDate(today, -13) && d < recentStart,
  );
  const weightChange =
    newWeights.length >= 3 && oldWeights.length >= 3
      ? round(
          mean(newWeights.map(([, w]) => w))! -
            mean(oldWeights.map(([, w]) => w))!,
          2,
        )
      : null;
  const journal = input.journal.filter(
    (r) => r.date >= recentStart && r.date <= today,
  );
  const suggestions: AssessmentSuggestion[] = [];
  const add = (
    id: string,
    priority: number,
    title: string,
    detail: string,
    values: Record<string, string | number>,
    destination: string,
  ) => suggestions.push({ id, priority, title, detail, values, destination });
  if (input.paused)
    add(
      "recovery-plan",
      100,
      "Follow your recovery plan",
      "Goal scoring is paused while your profile or active recovery plan calls for individual guidance. Review that plan before increasing training.",
      {},
      "/health",
    );
  else {
    if (caution)
      add(
        "ease-load",
        95,
        "Make the next session easier",
        "Recent sleep or recovery readings need attention. Keep effort lower, avoid adding sets, and reassess after a few nights. If you feel unwell or symptoms persist, seek qualified advice.",
        {},
        "/workouts",
      );
    if (shortSleep || sleepDrop)
      add(
        "sleep",
        90,
        "Allow more time for sleep",
        "Recent sleep averages {{minutes}} minutes across {{readings}} readings. Bring bedtime forward by 30 minutes where practical and review the next few nights.",
        { minutes: sleep.recent!, readings: sleep.recentReadings },
        "/health",
      );
    if (!input.truncated && compressed.length && caution)
      add(
        "spacing",
        88,
        "Give recently trained muscles a break",
        "{{muscles}} had substantial work on consecutive dates. Choose different muscles or an easier session while recovery readings remain below usual.",
        {
          muscles: compressed
            .map((m) => m.muscle)
            .slice(0, 4)
            .join(", "),
        },
        "/workouts",
      );
    if (
      !input.truncated &&
      latestPerformance !== null &&
      latestPerformance < -3
    )
      add(
        "performance",
        85,
        "Review the lifts that are declining",
        "Comparable logged lifts are down about {{change}}%. Check technique, food intake and recovery before adding load or volume.",
        { change: Math.abs(latestPerformance) },
        "/progress?tab=training",
      );
    const above = muscleRows.filter(
      (m) =>
        m.max !== null &&
        (m.basis === "chosen" ? m.direct : m.weighted) > m.max * 1.2,
    );
    if (!input.truncated && above.length)
      add(
        "volume-high",
        80,
        "Check the increase in training volume",
        "{{muscles}} are above their chosen or usual range. If this increase was not planned, bring the next week closer to your previous workload.",
        {
          muscles: above
            .map((m) => m.muscle)
            .slice(0, 4)
            .join(", "),
        },
        "/workouts",
      );
    if (
      !caution &&
      !input.truncated &&
      coverage >= 70 &&
      latestPerformance !== null &&
      latestPerformance >= -3 &&
      plan.focus !== "endurance"
    ) {
      const below = muscleRows
        .filter(
          (m) =>
            m.min !== null &&
            m.lastDate !== null &&
            (m.basis === "chosen" ? m.direct : m.weighted) < m.min,
        )
        .sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
      if (below[0])
        add(
          "volume-low",
          55,
          "Review {{muscle}} training",
          "{{muscle}} has {{sets}} logged sets against a lower reference of {{minimum}}. Check that all workouts are logged. If recovery feels good and the gap was unplanned, consider one additional set next week, then reassess.",
          {
            muscle: below[0].muscle,
            sets:
              below[0].basis === "chosen" ? below[0].direct : below[0].weighted,
            minimum: below[0].min!,
          },
          "/workouts",
        );
    }
    if (
      foodDays.length &&
      protein !== null &&
      input.proteinTarget !== null &&
      protein < input.proteinTarget * 0.85
    )
      add(
        "protein",
        65,
        "Check protein in your food log",
        "Logged protein averages {{protein}} g on {{days}} days, against your current {{target}} g target. Finish logging those days first. If the shortfall is real, add a protein-containing food to a regular meal.",
        {
          protein: round(protein, 0),
          days: foodDays.length,
          target: input.proteinTarget,
        },
        "/nutrition",
      );
    if (!input.truncated && loadChange !== null && loadChange > 30)
      add(
        "activity-load",
        70,
        "Review the extra activity",
        "Recorded exercise time increased {{change}}% from the previous seven days. Check that food intake and easier sessions account for the extra work.",
        { change: loadChange },
        "/endurance",
      );
    if (steps.changePercent !== null && steps.changePercent < -50 && !caution)
      add(
        "steps",
        30,
        "Check the change in daily activity",
        "Steps are lower than your usual level. If this is not a planned rest period and you feel well, try a short easy walk. There is no step target for muscle growth.",
        {},
        "/health",
      );
    if (
      sleep.recent !== null &&
      sleep.recent < 420 &&
      journal.some((r) => (r.caffeine ?? 0) > 0)
    )
      add(
        "caffeine",
        35,
        "Review caffeine timing",
        "Your journal includes caffeine and recent sleep is short. Check whether moving caffeine earlier helps; the app cannot infer when you consumed it.",
        {},
        "/journal",
      );
  }
  if (coverage < 70 || mappingCoverage < 0.8)
    add(
      "coverage",
      40,
      "Fill the gaps before changing the plan",
      "Log completed working sets and effort, and sync recent health readings. Missing data is not scored as a failure. Unmapped exercises cannot contribute to muscle totals.",
      {},
      "/health",
    );
  if (!suggestions.length)
    add(
      "hold",
      10,
      "Keep the plan and review next week",
      "The available signals do not suggest a specific change. Keep logging comparable sessions and note how you feel; this does not guarantee complete recovery.",
      {},
      "/workouts",
    );
  return {
    version: ASSESSMENT_VERSION,
    score,
    coverage,
    paused: input.paused,
    caution,
    severe,
    from: recentStart,
    to: today,
    factors,
    muscles: muscleRows,
    signals: { sleep, rhr, hrv, steps },
    suggestions: suggestions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6),
    context: {
      assessedMuscles: trainingScores.length,
      workingSets,
      mappedSets,
      workoutDays: workoutDays.size,
      minutes,
      previousMinutes,
      loadChange,
      foodDays: foodDays.length,
      protein: protein === null ? null : round(protein, 0),
      calories: calories === null ? null : round(calories, 0),
      proteinTarget: input.proteinTarget,
      weightChange,
      mood: mean(
        journal.flatMap((r) => (r.mood === undefined ? [] : [r.mood])),
      ),
      journalDays: journal.length,
      alcoholDays: journal.filter((r) => (r.alcohol ?? 0) > 0).length,
      deepSleep: mean(
        health
          .filter((r) => r.date >= sensorStart)
          .flatMap((r) =>
            r.sleepDeepMinutes === undefined ? [] : [r.sleepDeepMinutes],
          ),
      ),
      remSleep: mean(
        health
          .filter((r) => r.date >= sensorStart)
          .flatMap((r) =>
            r.sleepRemMinutes === undefined ? [] : [r.sleepRemMinutes],
          ),
      ),
      truncated: input.truncated,
    },
    liftChanges,
  };
}
export type GoalAssessment = ReturnType<typeof buildGoalAssessment>;
