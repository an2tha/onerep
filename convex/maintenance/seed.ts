import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { HEALTH_DIALS, HEALTH_METRICS } from "../lib/healthMetricCatalog";
import { bindableMetrics, platformMetric } from "../lib/platformHealthMetrics";
import { upsertWorkoutLog } from "../lib/workoutLogs";
import { completedExerciseValidator } from "../lib/workoutValidators";

/**
 * Demo-account seeding, kept out of the normal app surface.
 *
 * `bunx convex run maintenance/seed:verifyEmail '{"email":"..."}'`, then any of
 * the seeders below with the same `{"email":"..."}` — they look the app-facing
 * userId up themselves, and still take `{"userId":"..."}` if you have it.
 * `...:demoRowCounts` says what is already there; the seeders insert rather
 * than upsert, so `...:clearDemoData` first if you are pouring a second time.
 */

export const verifyEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "email", value: args.email }],
        update: { emailVerified: true },
      },
    });
    return { ok: true };
  },
});

export const userIdForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: args.email }],
    });
    if (!user) return null;
    const issuer = process.env.CONVEX_SITE_URL!;
    return { betterAuthUserId: user._id, userId: `${issuer}|${user._id}` };
  },
});

/**
 * Every seeder here needs the app-facing `userId`; nobody running them from a
 * terminal has it memorised. Take either, and look up the ugly one from the
 * email when that is all that was given.
 */
const targetArgs = { userId: v.optional(v.string()), email: v.optional(v.string()) };

async function resolveUserId(
  ctx: Pick<QueryCtx, "runQuery">,
  args: { userId?: string; email?: string },
) {
  if (args.userId) return args.userId;
  if (!args.email) throw new Error("Pass either userId or email.");
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: args.email }],
  });
  if (!user) throw new Error(`No account for ${args.email}.`);
  return `${process.env.CONVEX_SITE_URL!}|${user._id}`;
}

// ── Program: a 12-week upper/lower split, 3-4 sessions a week ──────────────

type SetPlan = { reps: number; weight: number; type?: string };
type ExercisePlan = { id: string; name: string; category: string; sets: SetPlan[] };

const LB_TO_KG = 0.453592;

function round2point5(kg: number) {
  return Math.round(kg / 2.5) * 2.5;
}

/** Deterministic PRNG so re-runs are idempotent and reviewable. */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAIN_LIFTS = {
  squat: { id: "Barbell_Squat", name: "Barbell Squat", start: 60 },
  bench: { id: "Barbell_Bench_Press_-_Medium_Grip", name: "Barbell Bench Press - Medium Grip", start: 42.5 },
  deadlift: { id: "Barbell_Deadlift", name: "Barbell Deadlift", start: 85 },
  ohp: { id: "Standing_Military_Press", name: "Standing Military Press", start: 27.5 },
} as const;

const ACCESSORIES = {
  row: { id: "Bent_Over_Barbell_Row", name: "Bent Over Barbell Row", category: "back" },
  pullup: { id: "Pullups", name: "Pullups", category: "back" },
  lunge: { id: "Barbell_Lunge", name: "Barbell Lunge", category: "legs" },
  curl: { id: "Dumbbell_Bicep_Curl", name: "Dumbbell Bicep Curl", category: "arms" },
  pushdown: { id: "Triceps_Pushdown", name: "Triceps Pushdown", category: "arms" },
  cableRow: { id: "Seated_Cable_Rows", name: "Seated Cable Rows", category: "back" },
  legPress: { id: "Leg_Press", name: "Leg Press", category: "legs" },
  pulldown: { id: "Wide-Grip_Lat_Pulldown", name: "Wide-Grip Lat Pulldown", category: "back" },
  inclinePress: { id: "Incline_Dumbbell_Press", name: "Incline Dumbbell Press", category: "chest" },
  dbShoulder: { id: "Dumbbell_Shoulder_Press", name: "Dumbbell Shoulder Press", category: "shoulders" },
  rdl: { id: "Romanian_Deadlift", name: "Romanian Deadlift", category: "legs" },
  facePull: { id: "Face_Pull", name: "Face Pull", category: "shoulders" },
} as const;

function mainSets(rng: () => number, weight: number, reps: number, count: number): SetPlan[] {
  const sets: SetPlan[] = [{ reps: reps + 3, weight: round2point5(weight * 0.5), type: "warmup" }];
  for (let i = 0; i < count; i++) {
    // Occasional missed rep on the last set — real training isn't a metronome.
    const repLoss = i === count - 1 && rng() < 0.25 ? 1 : 0;
    sets.push({ reps: reps - repLoss, weight, type: "normal" });
  }
  return sets;
}

function accessorySets(rng: () => number, weight: number, reps: number): SetPlan[] {
  return Array.from({ length: 3 }, (_, i) => ({
    reps: reps - (i === 2 && rng() < 0.3 ? 1 : 0),
    weight,
    type: "normal",
  }));
}

function buildExercise(plan: ExercisePlan): {
  id: string;
  name: string;
  category?: string;
  sets: { type: string; reps: number; weight: number; completed: boolean }[];
} {
  return {
    id: plan.id,
    name: plan.name,
    category: plan.category,
    sets: plan.sets.map((s) => ({
      type: s.type ?? "normal",
      reps: s.reps,
      weight: s.weight,
      completed: true,
    })),
  };
}

/** Linear progression with a deload every 4th week — the shape of a program that's actually being run, not a spreadsheet of round numbers. */
function weeklyWeight(start: number, week: number, weeklyIncrementKg: number) {
  const deloadWeeks = Math.floor(week / 4);
  const progressedWeeks = week - deloadWeeks;
  const isDeloadWeek = week > 0 && week % 4 === 3;
  const weight = start + progressedWeeks * weeklyIncrementKg;
  return round2point5(isDeloadWeek ? weight * 0.9 : weight);
}

type DayPlan = { exercises: ExercisePlan[]; durationSeconds: number };

function buildDayPlan(
  rng: () => number,
  week: number,
  dayType: "lowerA" | "upperA" | "lowerB" | "upperB",
): DayPlan {
  const squat = weeklyWeight(MAIN_LIFTS.squat.start, week, 1.25);
  const bench = weeklyWeight(MAIN_LIFTS.bench.start, week, 0.625);
  const deadlift = weeklyWeight(MAIN_LIFTS.deadlift.start, week, 1.875);
  const ohp = weeklyWeight(MAIN_LIFTS.ohp.start, week, 0.5);

  if (dayType === "lowerA") {
    return {
      exercises: [
        { ...MAIN_LIFTS.squat, category: "legs", sets: mainSets(rng, squat, 5, 4) },
        { ...ACCESSORIES.rdl, sets: accessorySets(rng, round2point5(deadlift * 0.55), 8) },
        { ...ACCESSORIES.legPress, sets: accessorySets(rng, round2point5(squat * 2.2), 10) },
        { ...ACCESSORIES.facePull, sets: accessorySets(rng, 20, 15) },
      ],
      durationSeconds: 3300 + Math.floor(rng() * 900),
    };
  }
  if (dayType === "upperA") {
    return {
      exercises: [
        { ...MAIN_LIFTS.bench, category: "chest", sets: mainSets(rng, bench, 5, 4) },
        { ...ACCESSORIES.row, sets: accessorySets(rng, round2point5(bench * 0.9), 8) },
        { ...ACCESSORIES.pulldown, sets: accessorySets(rng, round2point5(bench * 1.1), 10) },
        { ...ACCESSORIES.curl, sets: accessorySets(rng, 12, 12) },
      ],
      durationSeconds: 3000 + Math.floor(rng() * 900),
    };
  }
  if (dayType === "lowerB") {
    return {
      exercises: [
        { ...MAIN_LIFTS.deadlift, category: "legs", sets: mainSets(rng, deadlift, 5, 3) },
        { ...ACCESSORIES.lunge, sets: accessorySets(rng, round2point5(squat * 0.35), 10) },
        { ...ACCESSORIES.pullup, sets: accessorySets(rng, 0, 8) },
        { ...ACCESSORIES.facePull, sets: accessorySets(rng, 20, 15) },
      ],
      durationSeconds: 3300 + Math.floor(rng() * 900),
    };
  }
  return {
    exercises: [
      { ...MAIN_LIFTS.ohp, category: "shoulders", sets: mainSets(rng, ohp, 5, 4) },
      { ...ACCESSORIES.inclinePress, sets: accessorySets(rng, round2point5(ohp * 1.4), 10) },
      { ...ACCESSORIES.cableRow, sets: accessorySets(rng, round2point5(ohp * 2.4), 10) },
      { ...ACCESSORIES.pushdown, sets: accessorySets(rng, 15, 12) },
    ],
    durationSeconds: 2700 + Math.floor(rng() * 900),
  };
}

// ── Food ─────────────────────────────────────────────────────────────────

type FoodTemplateEntry = {
  name: string;
  meal: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const BREAKFASTS: FoodTemplateEntry[] = [
  { name: "Greek yogurt with granola and berries", meal: "breakfast", calories: 420, protein: 28, carbs: 52, fat: 11 },
  { name: "Three-egg omelette with spinach and toast", meal: "breakfast", calories: 470, protein: 30, carbs: 34, fat: 22 },
  { name: "Oatmeal with peanut butter and banana", meal: "breakfast", calories: 510, protein: 18, carbs: 68, fat: 18 },
];
const LUNCHES: FoodTemplateEntry[] = [
  { name: "Chicken burrito bowl", meal: "lunch", calories: 680, protein: 45, carbs: 72, fat: 20 },
  { name: "Turkey sandwich with side salad", meal: "lunch", calories: 590, protein: 38, carbs: 55, fat: 22 },
  { name: "Salmon poke bowl", meal: "lunch", calories: 640, protein: 40, carbs: 65, fat: 22 },
];
const DINNERS: FoodTemplateEntry[] = [
  { name: "Steak with roasted potatoes and broccoli", meal: "dinner", calories: 720, protein: 48, carbs: 55, fat: 30 },
  { name: "Stir-fried beef and rice", meal: "dinner", calories: 690, protein: 42, carbs: 70, fat: 22 },
  { name: "Grilled chicken thighs with quinoa and greens", meal: "dinner", calories: 610, protein: 44, carbs: 50, fat: 22 },
];
const SNACKS: FoodTemplateEntry[] = [
  { name: "Protein shake", meal: "snack", calories: 220, protein: 30, carbs: 12, fat: 4 },
  { name: "Cottage cheese with pineapple", meal: "snack", calories: 200, protein: 22, carbs: 20, fat: 3 },
  { name: "Handful of almonds", meal: "snack", calories: 170, protein: 6, carbs: 6, fat: 15 },
];

function pick<T>(rng: () => number, options: T[]): T {
  return options[Math.floor(rng() * options.length)]!;
}

function jitter(rng: () => number, value: number, pct: number) {
  return Math.round(value * (1 + (rng() - 0.5) * 2 * pct));
}

// ── Entry point ──────────────────────────────────────────────────────────

const WEEKS = 13;

/**
 * Skips the chat-wizard onboarding for a demo account by writing the profile
 * rows it would have produced, so `api.users.onboarding.get` returns non-null
 * and the app routes straight past `/onboarding`.
 */
export const seedOnboardingProfile = internalMutation({
  args: { ...targetArgs },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const now = Date.now();
    await ctx.db.insert("onboardingProfiles", {
      userId,
      age: 29,
      heightCm: 178,
      goal: "performance",
      experienceLevel: "intermediate",
      nutritionGoal: "performance",
      consent: {
        dataUse: true,
        weightData: true,
        foodLogging: true,
        wearableIntegrations: false,
      },
      safetyMode: "standard",
      weightTrend: "stable",
      occupationActivity: "mixed",
      trackingMode: "full",
      mealFrequency: 4,
      updatedAt: now,
      shownTooltips: [],
    });
    await ctx.db.insert("healthProfiles", {
      userId,
      sex: "male",
      age: 29,
      weightKg: 82,
      heightCm: 178,
      activityLevel: "moderately_active",
      goal: "maintain",
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const seedDemoHistory = internalMutation({
  args: { ...targetArgs, seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const rng = mulberry32(args.seed ?? 20260810);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Start the program 13 weeks back, end yesterday — today stays open for
    // whoever is driving the demo to log something live.
    const totalDays = WEEKS * 7;
    const startMs = today.getTime() - totalDays * 86_400_000;

    // A couple of real gaps in the food log: a rough week and a short trip.
    const foodGapStartDays = [totalDays - 61, totalDays - 24];
    const foodGapLengths = [3, 2];

    let workoutsWritten = 0;
    let foodDaysWritten = 0;

    for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
      const dateMs = startMs + dayIndex * 86_400_000;
      const date = new Date(dateMs);
      const dateStr = date.toISOString().slice(0, 10);
      const weekday = date.getUTCDay(); // 0 = Sunday
      const week = Math.floor(dayIndex / 7);

      // Training days: Mon/Tue/Thu/Fri, with an occasional skipped session
      // (life happens) so the week lands at 3-4 rather than a robotic 4.
      const trainingSlots: Record<number, "lowerA" | "upperA" | "lowerB" | "upperB"> = {
        1: "lowerA",
        2: "upperA",
        4: "lowerB",
        5: "upperB",
      };
      const dayType = trainingSlots[weekday];
      if (dayType && rng() > 0.12) {
        const plan = buildDayPlan(rng, week, dayType);
        const exercises = plan.exercises.map(buildExercise);
        const hour = 6 + Math.floor(rng() * 13);
        const completedAt = dateMs + hour * 3_600_000 + Math.floor(rng() * 3_600_000);
        await upsertWorkoutLog(ctx, userId, {
          date: dateStr,
          sessionId: `seed-${dateStr}`,
          slot: 1,
          exercises,
          durationSeconds: plan.durationSeconds,
          completedAt,
        });
        workoutsWritten += 1;
      }

      const inGap = foodGapStartDays.some(
        (gapStart, i) => dayIndex >= gapStart && dayIndex < gapStart + foodGapLengths[i]!,
      );
      if (!inGap && rng() > 0.06) {
        const entries = [
          pick(rng, BREAKFASTS),
          pick(rng, LUNCHES),
          pick(rng, DINNERS),
          ...(rng() > 0.4 ? [pick(rng, SNACKS)] : []),
        ].map((template, i) => ({
          id: `seed-${dateStr}-${i}`,
          name: template.name,
          meal: template.meal,
          calories: jitter(rng, template.calories, 0.08),
          protein: jitter(rng, template.protein, 0.08),
          carbs: jitter(rng, template.carbs, 0.08),
          fat: jitter(rng, template.fat, 0.08),
          loggedAt: new Date(
            dateMs + (7 + i * 4) * 3_600_000 + Math.floor(rng() * 1_800_000),
          ).toISOString(),
        }));

        await ctx.db.insert("foodLogs", {
          userId,
          date: dateStr,
          entries,
          updatedAt: dateMs + 20 * 3_600_000,
        });
        foodDaysWritten += 1;
      }
    }

    return { workoutsWritten, foodDaysWritten, totalDays };
  },
});

/**
 * Weigh-ins across the same 13 weeks. A slow cut with the usual water-weight
 * noise, because a perfectly straight line is the one thing nobody's chart
 * has ever looked like.
 *
 * Two writers, as in real life: a smart scale that files a full body
 * composition most mornings (`source: "health"`), and the occasional evening
 * where someone gets the tape measure out and types it in (`source: "manual"`).
 * `loggedAt` is a day key and nothing else — an ISO timestamp here silently
 * files the check-in under the wrong day.
 */
export const seedBodyCheckins = internalMutation({
  args: { ...targetArgs, seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const rng = mulberry32(args.seed ?? 77_012);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const totalDays = WEEKS * 7;
    const startMs = today.getTime() - totalDays * 86_400_000;

    let written = 0;
    let manualWritten = 0;
    let tapeTurn = 0;
    // Every third or fourth morning, not religiously.
    for (let dayIndex = 0; dayIndex <= totalDays; dayIndex += 3 + Math.floor(rng() * 2)) {
      const dateMs = startMs + dayIndex * 86_400_000;
      const dateStr = new Date(dateMs).toISOString().slice(0, 10);
      const progress = dayIndex / totalDays;
      const weightKg = 84.6 - 5.2 * progress + (rng() - 0.5) * 0.7;
      const bodyFatPct = 18.4 - 3.8 * progress + (rng() - 0.5) * 0.4;
      const leanBodyMassKg = weightKg * (1 - bodyFatPct / 100);
      // Katch-McArdle, which is what a scale of this sort reports.
      const basalMetabolicRateKcal = 370 + 21.6 * leanBodyMassKg;

      // Every fourth check-in is the one that got typed in with a tape measure.
      const manual = tapeTurn++ % 4 === 3;
      const round1 = (n: number) => Math.round(n * 10) / 10;

      await ctx.db.insert("bodyMeasurements", {
        userId,
        clientId: `seed-checkin-${dateStr}`,
        loggedAt: dateStr,
        source: manual ? "manual" : "health",
        weightKg: round1(weightKg),
        bodyFatPct: round1(bodyFatPct),
        ...(manual
          ? {
              waistCm: round1(85.8 - 5.1 * progress + (rng() - 0.5) * 0.6),
              hipsCm: round1(99.2 - 2.8 * progress + (rng() - 0.5) * 0.6),
              chestCm: round1(103.4 + 1.1 * progress + (rng() - 0.5) * 0.7),
            }
          : {
              leanBodyMassKg: round1(leanBodyMassKg),
              boneMassKg: round1(3.4 + (rng() - 0.5) * 0.12),
              basalMetabolicRateKcal: Math.round(basalMetabolicRateKcal),
            }),
        createdAt: dateMs + (manual ? 20 : 7) * 3_600_000,
        updatedAt: dateMs + (manual ? 20 : 7) * 3_600_000,
      });
      written += 1;
      if (manual) manualWritten += 1;
    }

    return { written, manualWritten, healthWritten: written - manualWritten };
  },
});

// ── The rest of the screens ──────────────────────────────────────────────
//
// The history above fills the charts. What it does not fill is everything a
// camera actually lingers on: the water row reading zero, the routine grid
// with seven empty days, a Progress health tab with nothing in it. These
// write the unglamorous rows that keep a demo from filming as an empty state.

/**
 * Water goal, units, and the health-sync switches. The per-metric record is
 * spelled out rather than left to the catalogue defaults, because a demo of the
 * Health page wants the intimate ones on too — nobody is filming a screen of
 * "not tracked".
 */
export const seedDemoPreferences = internalMutation({
  args: { ...targetArgs },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const patch = {
      waterGoalMl: 2500,
      weightUnit: "kg",
      lastActiveTimezone: "Europe/Berlin",
      healthSync: {
        appleHealthEnabled: true,
        healthSyncEnabled: true,
        autoSyncOnForeground: true,
        writeEnabled: true,
        lastSyncedAt: Date.now() - 42 * 60_000,
        // Not a wall of `true`: the two a demo account has no business
        // pretending a scale reported are off, which is also the only way to
        // see that the switches do anything.
        metrics: Object.fromEntries(
          HEALTH_METRICS.map((metric) => [
            metric.key,
            metric.key !== "boneMassKg" && metric.key !== "basalMetabolicRateKcal",
          ]),
        ),
        // Body has no ring to draw — it shows a bare latest reading — so the
        // hero is tidier without it, and the off state gets an airing.
        dials: Object.fromEntries(
          HEALTH_DIALS.map((dial) => [dial.key, dial.key !== "body"]),
        ),
      },
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { updated: true };
    }
    await ctx.db.insert("userPreferences", {
      userId,
      ...patch,
      updatedAt: Date.now(),
    });
    return { created: true };
  },
});

type PresetSeed = {
  name: string;
  focus: string;
  duration: string;
  exercises: { id: string; label: string; sets: number; reps: number; weight: number }[];
};

const DEMO_PRESETS: PresetSeed[] = [
  {
    name: "Lower A",
    focus: "strength",
    duration: "55 min",
    exercises: [
      { id: "Barbell_Squat", label: "Squat", sets: 4, reps: 5, weight: 100 },
      { id: "Romanian_Deadlift", label: "Romanian deadlift", sets: 3, reps: 8, weight: 75 },
      { id: "Leg_Press", label: "Leg press", sets: 3, reps: 10, weight: 220 },
      { id: "Face_Pull", label: "Face pull", sets: 3, reps: 15, weight: 20 },
    ],
  },
  {
    name: "Upper A",
    focus: "strength",
    duration: "50 min",
    exercises: [
      { id: "Barbell_Bench_Press_-_Medium_Grip", label: "Bench press", sets: 4, reps: 5, weight: 65 },
      { id: "Bent_Over_Barbell_Row", label: "Barbell row", sets: 3, reps: 8, weight: 60 },
      { id: "Wide-Grip_Lat_Pulldown", label: "Lat pulldown", sets: 3, reps: 10, weight: 70 },
      { id: "Dumbbell_Bicep_Curl", label: "Curl", sets: 3, reps: 12, weight: 12 },
    ],
  },
  {
    name: "Lower B",
    focus: "strength",
    duration: "55 min",
    exercises: [
      { id: "Barbell_Deadlift", label: "Deadlift", sets: 3, reps: 5, weight: 140 },
      { id: "Barbell_Lunge", label: "Lunge", sets: 3, reps: 10, weight: 35 },
      { id: "Pullups", label: "Pull-up", sets: 3, reps: 8, weight: 0 },
      { id: "Face_Pull", label: "Face pull", sets: 3, reps: 15, weight: 20 },
    ],
  },
  {
    name: "Upper B",
    focus: "strength",
    duration: "45 min",
    exercises: [
      { id: "Standing_Military_Press", label: "Overhead press", sets: 4, reps: 5, weight: 42.5 },
      { id: "Incline_Dumbbell_Press", label: "Incline press", sets: 3, reps: 10, weight: 60 },
      { id: "Seated_Cable_Rows", label: "Cable row", sets: 3, reps: 10, weight: 100 },
      { id: "Triceps_Pushdown", label: "Pushdown", sets: 3, reps: 12, weight: 15 },
    ],
  },
];

/**
 * The four presets and the Mon/Tue/Thu/Fri routine that the seeded history was
 * already following. Written in the shape the preset editor writes, so the
 * cards open and start without complaint.
 */
export const seedDemoRoutine = internalMutation({
  args: { ...targetArgs },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const now = Date.now();
    const ids: string[] = [];

    for (const preset of DEMO_PRESETS) {
      const items = preset.exercises.map((exercise) => ({
        kind: "solo" as const,
        exerciseId: exercise.id,
      }));
      const exerciseData: Record<string, unknown> = {};
      for (const exercise of preset.exercises) {
        exerciseData[exercise.id] = {
          sets: Array.from({ length: exercise.sets }, (_, i) => ({
            id: `seed-${exercise.id}-${i}`,
            type: "normal",
            weight: String(exercise.weight),
            reps: String(exercise.reps),
            restSeconds: 120,
            completed: false,
          })),
          trackRpe: false,
          trackUnilateral: false,
          barWeight: "20",
          barType: "barbell",
        };
      }
      const id = await ctx.db.insert("presets", {
        userId,
        name: preset.name,
        items,
        exerciseData,
        focus: preset.focus,
        duration: preset.duration,
        steps: preset.exercises.map(
          (exercise) => `${exercise.label} ${exercise.sets}×${exercise.reps}`,
        ),
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }

    const routine = {
      Mon: ids[0]!,
      Tue: ids[1]!,
      Wed: null,
      Thu: ids[2]!,
      Fri: ids[3]!,
      Sat: null,
      Sun: null,
    };

    const existing = await ctx.db
      .query("schedules")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { routine, presetOrder: ids, updatedAt: now });
    } else {
      await ctx.db.insert("schedules", {
        userId,
        routine,
        presetOrder: ids,
        updatedAt: now,
      });
    }

    return { presets: ids.length };
  },
});

/**
 * Water across the same 13 weeks, logged in glasses the way a person does:
 * a few in the morning, more after training, and the odd day that quietly
 * never got past lunch. Today lands deliberately short of the goal — the
 * demo needs something left to tap on camera.
 */
export const seedDemoWater = internalMutation({
  args: { ...targetArgs, seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const rng = mulberry32(args.seed ?? 5_512_004);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const totalDays = WEEKS * 7;
    const startMs = today.getTime() - totalDays * 86_400_000;

    let written = 0;
    for (let dayIndex = 0; dayIndex <= totalDays; dayIndex++) {
      const dateMs = startMs + dayIndex * 86_400_000;
      const dateStr = new Date(dateMs).toISOString().slice(0, 10);
      const isToday = dayIndex === totalDays;

      // A short day every so often, so the trend has somewhere to recover from.
      if (!isToday && rng() < 0.09) continue;

      const glasses = isToday ? 3 : rng() < 0.25 ? 5 + Math.floor(rng() * 2) : 8 + Math.floor(rng() * 2);
      const entries = Array.from({ length: glasses }, (_, i) => ({
        id: `seed-water-${dateStr}-${i}`,
        amountMl: 250 + (rng() < 0.3 ? 100 : 0),
        loggedAt: new Date(
          dateMs + (7 + i * 1.6) * 3_600_000 + Math.floor(rng() * 1_200_000),
        ).toISOString(),
      }));

      await ctx.db.insert("waterLogs", {
        userId,
        date: dateStr,
        entries,
        updatedAt: dateMs + 20 * 3_600_000,
      });
      written += 1;
    }

    return { written };
  },
});

/**
 * Steps, sleep, resting heart rate and HRV — the Progress health tab is a wall
 * of empty charts without them. Training days walk further and sleep worse,
 * because that is what training days do.
 */
export const seedDemoHealthMetrics = internalMutation({
  args: { ...targetArgs, seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const rng = mulberry32(args.seed ?? 91_337);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const totalDays = WEEKS * 7;
    const startMs = today.getTime() - totalDays * 86_400_000;

    let written = 0;
    for (let dayIndex = 0; dayIndex <= totalDays; dayIndex++) {
      const dateMs = startMs + dayIndex * 86_400_000;
      const date = new Date(dateMs);
      const dateStr = date.toISOString().slice(0, 10);
      const weekday = date.getUTCDay();
      const trained = weekday === 1 || weekday === 2 || weekday === 4 || weekday === 5;
      const progress = dayIndex / totalDays;

      await ctx.db.insert("healthMetrics", {
        userId,
        date: dateStr,
        provider: "apple_health" as const,
        steps: Math.round((trained ? 11_200 : 7_400) + (rng() - 0.5) * 3_000),
        sleepMinutes: Math.round((trained ? 412 : 441) + (rng() - 0.5) * 55),
        // Conditioning improves a little across the block; the daily noise
        // still swamps it, which is the honest picture.
        restingHeartRateBpm: Math.round(58 - 3 * progress + (rng() - 0.5) * 4),
        hrvMs: Math.round(52 + 9 * progress + (rng() - 0.5) * 12),
        activeEnergyKcal: Math.round((trained ? 720 : 430) + (rng() - 0.5) * 180),
        syncedAt: dateMs + 22 * 3_600_000,
        updatedAt: dateMs + 22 * 3_600_000,
      });
      written += 1;
    }

    return { written };
  },
});

// ── Custom metrics ───────────────────────────────────────────────────────
//
// Everything the platform catalogue knows about that the app does not score
// itself lands here, because "available as a custom metric" is a claim a demo
// has to be able to show rather than assert. Each one gets a series with a
// reason behind it — a glucose curve that answers to breakfast, a VO2 max that
// creeps up over a training block — since a chart of noise reads as broken
// long before anyone reads the axis label.

type MetricShape = {
  /** Overrides the catalogue label when the picker's wording is too clinical. */
  title?: string;
  description: string;
  tab: "body" | "nutrition" | "training";
  kind: "counter" | "number" | "toggle";
  accent: "food" | "water" | "workout" | "progress";
  step: number;
  target?: number;
  /** Days between readings. 1 is daily; 7 is the once-a-week sort. */
  cadence: number;
  /** Every Nth entry is typed rather than synced. Omitted means all synced. */
  manualEvery?: number;
  decimals: number;
  /**
   * `day` counts back-to-front across the block, `progress` runs 0→1 over it,
   * `trained` is the Mon/Tue/Thu/Fri pattern the rest of the seed follows.
   */
  at: (ctx: { day: number; progress: number; trained: boolean; weekday: number; rng: () => number }) => number;
};

/** Keyed by `platformHealthMetrics` key; every non-built-in metric appears. */
const BOUND_METRIC_SHAPES: Record<string, MetricShape> = {
  // Activity
  totalEnergyKcal: {
    description: "Active and resting energy together, straight off the watch",
    tab: "training", kind: "number", accent: "workout", step: 10, cadence: 1, decimals: 0,
    at: ({ trained, rng }) => (trained ? 3080 : 2610) + (rng() - 0.5) * 220,
  },
  distanceWalkingRunningM: {
    description: "Ground covered on foot",
    tab: "training", kind: "number", accent: "workout", step: 100, cadence: 1, decimals: 0,
    at: ({ trained, rng }) => (trained ? 8600 : 5400) + (rng() - 0.5) * 2400,
  },
  distanceCyclingM: {
    description: "Commute plus the odd weekend loop",
    tab: "training", kind: "number", accent: "workout", step: 500, cadence: 3, decimals: 0,
    at: ({ weekday, rng }) => (weekday === 0 || weekday === 6 ? 34000 : 11000) + (rng() - 0.5) * 6000,
  },
  distanceSwimmingM: {
    description: "Lengths, on the days the pool is not full of children",
    tab: "training", kind: "number", accent: "water", step: 50, cadence: 7, decimals: 0,
    at: ({ rng }) => 1400 + Math.round((rng() - 0.5) * 400),
  },
  floorsClimbed: {
    description: "Flights of stairs, which the fourth-floor flat sees to",
    tab: "training", kind: "counter", accent: "workout", step: 1, target: 12, cadence: 1, decimals: 0,
    manualEvery: 11,
    at: ({ trained, rng }) => (trained ? 16 : 10) + (rng() - 0.5) * 7,
  },
  elevationGainedM: {
    description: "Height climbed over the day",
    tab: "training", kind: "number", accent: "workout", step: 5, cadence: 1, decimals: 0,
    at: ({ trained, rng }) => (trained ? 58 : 34) + (rng() - 0.5) * 26,
  },
  wheelchairPushes: {
    description: "Pushes, for anyone whose step count is the wrong question",
    tab: "training", kind: "counter", accent: "workout", step: 10, cadence: 7, decimals: 0,
    at: ({ rng }) => 1900 + Math.round((rng() - 0.5) * 600),
  },
  vo2Max: {
    description: "Estimated aerobic capacity",
    tab: "training", kind: "number", accent: "progress", step: 0.1, cadence: 7, decimals: 1,
    at: ({ progress, rng }) => 44.2 + 3.6 * progress + (rng() - 0.5) * 0.5,
  },
  cyclingCadenceRpm: {
    description: "Pedal revolutions per minute, averaged over the ride",
    tab: "training", kind: "number", accent: "workout", step: 1, cadence: 3, decimals: 0,
    at: ({ rng }) => 84 + (rng() - 0.5) * 9,
  },
  powerWatts: {
    description: "Average output on the bike",
    tab: "training", kind: "number", accent: "workout", step: 5, cadence: 3, decimals: 0,
    at: ({ progress, rng }) => 196 + 18 * progress + (rng() - 0.5) * 22,
  },
  speedMps: {
    description: "Running pace, in metres per second",
    tab: "training", kind: "number", accent: "workout", step: 0.1, cadence: 2, decimals: 2,
    at: ({ progress, rng }) => 2.94 + 0.22 * progress + (rng() - 0.5) * 0.18,
  },

  // Vitals
  heartRateBpm: {
    description: "Every reading the watch took, averaged over the day",
    tab: "body", kind: "number", accent: "progress", step: 1, cadence: 1, decimals: 0,
    at: ({ trained, progress, rng }) => (trained ? 82 : 74) - 3 * progress + (rng() - 0.5) * 6,
  },
  bloodGlucoseMmolL: {
    title: "Blood glucose",
    description: "Finger-prick readings, mostly fasting and two hours after dinner",
    tab: "body", kind: "number", accent: "progress", step: 0.1, target: 5.4, cadence: 1, decimals: 1,
    manualEvery: 4,
    // Weekends run higher: later meals, more of them, and a bottle of red.
    at: ({ weekday, progress, rng }) =>
      5.3 + (weekday === 0 || weekday === 6 ? 0.45 : 0) - 0.25 * progress + (rng() - 0.5) * 0.55,
  },
  bloodPressureSystolic: {
    description: "The upper number, cuff on the left arm before breakfast",
    tab: "body", kind: "number", accent: "progress", step: 1, target: 120, cadence: 2, decimals: 0,
    manualEvery: 3,
    at: ({ progress, rng }) => 126 - 5 * progress + (rng() - 0.5) * 7,
  },
  bloodPressureDiastolic: {
    description: "The lower number, from the same cuff and the same minute",
    tab: "body", kind: "number", accent: "progress", step: 1, target: 78, cadence: 2, decimals: 0,
    manualEvery: 3,
    at: ({ progress, rng }) => 81 - 3.5 * progress + (rng() - 0.5) * 5,
  },
  oxygenSaturationPct: {
    description: "SpO2 overnight, as a percentage",
    tab: "body", kind: "number", accent: "progress", step: 1, cadence: 1, decimals: 0,
    at: ({ rng }) => 97 + (rng() - 0.5) * 2.4,
  },
  respiratoryRateBpm: {
    description: "Breaths per minute while asleep",
    tab: "body", kind: "number", accent: "progress", step: 0.1, cadence: 1, decimals: 1,
    at: ({ trained, rng }) => (trained ? 15.1 : 14.3) + (rng() - 0.5) * 1.4,
  },
  bodyTemperatureC: {
    description: "Measured temperature",
    tab: "body", kind: "number", accent: "progress", step: 0.1, cadence: 2, decimals: 1,
    manualEvery: 5,
    // One three-day fever in week six, because a flat line here is a demo of
    // a thermometer nobody has ever needed.
    at: ({ day, rng }) => (day >= 41 && day <= 43 ? 38.4 : 36.7) + (rng() - 0.5) * 0.3,
  },
  basalBodyTemperatureC: {
    description: "Waking temperature, taken before getting up",
    tab: "body", kind: "number", accent: "progress", step: 0.1, cadence: 1, decimals: 2,
    at: ({ rng }) => 36.5 + (rng() - 0.5) * 0.24,
  },

  // Body
  heightCm: {
    description: "Standing height, which has the decency not to move",
    tab: "body", kind: "number", accent: "progress", step: 0.5, cadence: 30, decimals: 0,
    manualEvery: 2,
    at: () => 178,
  },
  waistCircumferenceCm: {
    description: "Waist circumference, tape at the navel",
    tab: "body", kind: "number", accent: "progress", step: 0.1, cadence: 7, decimals: 1,
    manualEvery: 2,
    at: ({ progress, rng }) => 85.8 - 5.1 * progress + (rng() - 0.5) * 0.5,
  },

  // Nutrition
  dietaryEnergyKcal: {
    description: "Calories another app recorded, kept for the cross-check",
    tab: "nutrition", kind: "number", accent: "food", step: 10, target: 2600, cadence: 1, decimals: 0,
    at: ({ trained, rng }) => (trained ? 2680 : 2380) + (rng() - 0.5) * 320,
  },
  dietaryProteinG: {
    description: "Protein consumed",
    tab: "nutrition", kind: "number", accent: "food", step: 1, target: 165, cadence: 1, decimals: 0,
    at: ({ trained, rng }) => (trained ? 168 : 152) + (rng() - 0.5) * 24,
  },
  dietaryCarbsG: {
    description: "Carbohydrate consumed",
    tab: "nutrition", kind: "number", accent: "food", step: 1, cadence: 1, decimals: 0,
    at: ({ trained, rng }) => (trained ? 296 : 244) + (rng() - 0.5) * 46,
  },
  dietaryFatG: {
    description: "Total fat consumed",
    tab: "nutrition", kind: "number", accent: "food", step: 1, cadence: 1, decimals: 0,
    at: ({ rng }) => 84 + (rng() - 0.5) * 20,
  },
  hydrationMl: {
    description: "Fluid intake as the health store sees it, bottle included",
    tab: "nutrition", kind: "counter", accent: "water", step: 250, target: 2500, cadence: 1, decimals: 0,
    at: ({ trained, rng }) => (trained ? 2900 : 2350) + Math.round((rng() - 0.5) * 500),
  },
  caffeineMg: {
    description: "Caffeine, which is two coffees and a pre-workout on a good day",
    tab: "nutrition", kind: "counter", accent: "food", step: 40, target: 300, cadence: 1, decimals: 0,
    manualEvery: 6,
    at: ({ trained, weekday, rng }) =>
      (weekday === 0 ? 95 : trained ? 285 : 190) + Math.round((rng() - 0.5) * 70),
  },

  // Reproductive health — seeded so the screens have something in them; a
  // demo that ships four permanently empty charts is a demo of nothing.
  menstruationFlow: {
    description: "Flow level, none through heavy",
    tab: "body", kind: "number", accent: "progress", step: 1, cadence: 1, decimals: 0,
    at: ({ day }) => {
      const cycleDay = day % 28;
      return cycleDay === 0 ? 3 : cycleDay === 1 ? 2 : cycleDay < 5 ? 1 : 0;
    },
  },
  cervicalMucus: {
    description: "Recorded quality, as a level",
    tab: "body", kind: "number", accent: "progress", step: 1, cadence: 2, decimals: 0,
    manualEvery: 4,
    at: ({ day }) => {
      const cycleDay = day % 28;
      return cycleDay >= 12 && cycleDay <= 16 ? 4 : cycleDay < 6 ? 0 : 2;
    },
  },
  ovulationTest: {
    description: "Test result, as a level",
    tab: "body", kind: "number", accent: "progress", step: 1, cadence: 1, decimals: 0,
    manualEvery: 3,
    at: ({ day }) => {
      const cycleDay = day % 28;
      return cycleDay === 14 ? 3 : cycleDay >= 11 && cycleDay <= 16 ? 2 : 1;
    },
  },
  intermenstrualBleeding: {
    description: "Spotting between periods",
    tab: "body", kind: "toggle", accent: "progress", step: 1, cadence: 7, decimals: 0,
    manualEvery: 2,
    at: ({ day }) => (day % 28 === 20 ? 1 : 0),
  },

  // Mindfulness
  mindfulMinutes: {
    description: "Time in recorded sessions, most of it spent not meditating",
    tab: "body", kind: "counter", accent: "progress", step: 5, target: 15, cadence: 2, decimals: 0,
    at: ({ rng }) => (rng() < 0.25 ? 5 : 12) + Math.round(rng() * 8),
  },
};

/**
 * Metrics with no platform record behind them — the ones a person invents
 * because nothing in Health Connect measures whether their knee hurts.
 */
const FREE_METRIC_SHAPES: (MetricShape & { title: string; unit: string })[] = [
  {
    title: "Morning mood",
    unit: "1-5",
    description: "How the day looks from the edge of the bed",
    tab: "body", kind: "number", accent: "progress", step: 1, cadence: 1, decimals: 0,
    manualEvery: 1,
    at: ({ trained, progress, rng }) => 3.2 + (trained ? -0.2 : 0.2) + 0.5 * progress + (rng() - 0.5) * 1.2,
  },
  {
    title: "Knee soreness",
    unit: "0-10",
    description: "Left knee, the morning after squats",
    tab: "training", kind: "number", accent: "workout", step: 1, cadence: 1, decimals: 0,
    manualEvery: 1,
    at: ({ weekday, progress, rng }) => (weekday === 2 ? 4.4 : 2.1) - 1.1 * progress + (rng() - 0.5) * 1.6,
  },
  {
    title: "Creatine",
    unit: "taken",
    description: "Five grams, or the guilt of having forgotten",
    tab: "nutrition", kind: "toggle", accent: "food", step: 1, cadence: 1, decimals: 0,
    manualEvery: 1,
    at: ({ rng }) => (rng() < 0.86 ? 1 : 0),
  },
  {
    title: "Fibre",
    unit: "g",
    description: "What the food log never quite adds up on its own",
    tab: "nutrition", kind: "number", accent: "food", step: 1, target: 35, cadence: 1, decimals: 0,
    manualEvery: 5,
    at: ({ progress, rng }) => 27 + 6 * progress + (rng() - 0.5) * 9,
  },
];

/**
 * The custom-metric half of the demo: a definition per shape above, and a
 * ~13-week series under each. Values are clamped to the catalogue's plausible
 * range for bound metrics, so a seeded reading can never be one the sync would
 * itself have thrown away.
 */
export const seedDemoCustomMetrics = internalMutation({
  args: { ...targetArgs, seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const rng = mulberry32(args.seed ?? 4_480_231);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const totalDays = WEEKS * 7;
    const startMs = today.getTime() - totalDays * 86_400_000;
    const now = Date.now();

    const shapes: (MetricShape & { title: string; unit: string; healthMetricKey?: string })[] = [
      ...bindableMetrics().flatMap((metric) => {
        const shape = BOUND_METRIC_SHAPES[metric.key];
        if (!shape) return [];
        return [{
          ...shape,
          title: shape.title ?? metric.label,
          unit: metric.unit,
          healthMetricKey: metric.key,
        }];
      }),
      ...FREE_METRIC_SHAPES,
    ];

    let metricsWritten = 0;
    let entriesWritten = 0;
    let manualWritten = 0;

    for (const shape of shapes) {
      const metricId = await ctx.db.insert("customProgressMetrics", {
        userId,
        title: shape.title,
        description: shape.description,
        tab: shape.tab,
        kind: shape.kind,
        unit: shape.unit,
        step: shape.step,
        ...(shape.target === undefined ? {} : { target: shape.target }),
        accent: shape.accent,
        ...(shape.healthMetricKey ? { healthMetricKey: shape.healthMetricKey } : {}),
        createdAt: now,
        updatedAt: now,
      });
      metricsWritten += 1;

      const bounds = shape.healthMetricKey ? platformMetric(shape.healthMetricKey) : undefined;
      let tick = 0;
      for (let day = 0; day <= totalDays; day += shape.cadence) {
        // A missed reading here and there, on everything but the toggles —
        // nobody's monitor has ever run 91 days without a flat battery.
        if (shape.kind !== "toggle" && rng() < 0.05) {
          tick += 1;
          continue;
        }
        const dateMs = startMs + day * 86_400_000;
        const date = new Date(dateMs);
        const weekday = date.getUTCDay();
        const raw = shape.at({
          day,
          progress: day / totalDays,
          trained: weekday === 1 || weekday === 2 || weekday === 4 || weekday === 5,
          weekday,
          rng,
        });
        const factor = 10 ** shape.decimals;
        let value = Math.round(raw * factor) / factor;
        if (bounds) value = Math.min(bounds.max, Math.max(bounds.min, value));

        const manual = shape.manualEvery !== undefined && tick % shape.manualEvery === 0;
        await ctx.db.insert("customProgressMetricEntries", {
          userId,
          metricId,
          date: date.toISOString().slice(0, 10),
          value,
          ...(manual ? { manual: true } : {}),
          updatedAt: dateMs + 21 * 3_600_000,
        });
        entriesWritten += 1;
        if (manual) manualWritten += 1;
        tick += 1;
      }
    }

    return { metricsWritten, entriesWritten, manualWritten };
  },
});

/**
 * Marks a scattering of already-seeded health days as hand-corrected, so the
 * per-field override state has somewhere to show itself. Patches rather than
 * inserts, which makes it the one seeder here safe to run twice.
 */
export const seedManualFieldOverrides = internalMutation({
  args: { ...targetArgs },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const rows = await ctx.db
      .query("healthMetrics")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // The realistic reasons a field gets overridden: a strap that reported
    // nonsense overnight, a phone left on the desk all afternoon, a watch that
    // logged the sofa as sleep.
    const overrides: string[][] = [
      ["restingHeartRateBpm"],
      ["steps"],
      ["sleepMinutes", "hrvMs"],
      ["activeEnergyKcal"],
      ["steps", "activeEnergyKcal"],
      ["sleepMinutes"],
    ];

    let patched = 0;
    for (const [i, fields] of overrides.entries()) {
      // Spread across the block rather than clustered, so any window of the
      // chart has one in it.
      const row = rows[Math.floor(((i + 1) * rows.length) / (overrides.length + 1))];
      if (!row) continue;
      await ctx.db.patch(row._id, { manualFields: fields, provider: "manual" as const });
      patched += 1;
    }
    return { patched, days: rows.length };
  },
});

/**
 * What is already there. Every seeder here inserts rather than upserts, so
 * running one twice quietly doubles the history — check before you pour.
 */
export const demoRowCounts = internalQuery({
  args: { ...targetArgs },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const count = async (
      table: "workoutLogs" | "foodLogs" | "waterLogs" | "healthMetrics" | "bodyMeasurements" | "presets",
      index: string,
    ) =>
      (
        await ctx.db
          .query(table)
          .withIndex(index as never, (q: never) => (q as { eq: (f: string, v: string) => unknown }).eq("userId", userId) as never)
          .collect()
      ).length;

    const customMetrics = await ctx.db
      .query("customProgressMetrics")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const customEntries = await ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_metricId", (q) => q.eq("userId", userId))
      .collect();

    return {
      workoutLogs: await count("workoutLogs", "by_userId_date"),
      foodLogs: await count("foodLogs", "by_userId_date"),
      waterLogs: await count("waterLogs", "by_userId_date"),
      healthMetrics: await count("healthMetrics", "by_userId"),
      bodyMeasurements: await count("bodyMeasurements", "by_userId"),
      presets: await count("presets", "by_userId"),
      healthProfiles: (
        await ctx.db
          .query("healthProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect()
      ).length,
      schedules: (
        await ctx.db
          .query("schedules")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect()
      ).length,
      userPreferences: (
        await ctx.db
          .query("userPreferences")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect()
      ).length,
      onboarding: (
        await ctx.db
          .query("onboardingProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect()
      ).length,
      customProgressMetrics: customMetrics.length,
      customProgressMetricEntries: customEntries.length,
      customProgressMetricsBound: customMetrics.filter((m) => m.healthMetricKey).length,
      customProgressMetricEntriesManual: customEntries.filter((e) => e.manual).length,
      healthMetricsWithManualFields: (
        await ctx.db
          .query("healthMetrics")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect()
      ).filter((row) => (row.manualFields?.length ?? 0) > 0).length,
    };
  },
});

/**
 * Wipes every table these seeders write, for one user id only. Meant for the
 * demo account when a seed run needs doing again — the inserts above are not
 * idempotent, and a demo with two of every workout is worse than no demo.
 */
export const clearDemoData = internalMutation({
  args: { ...targetArgs, confirm: v.literal("yes-wipe-this-user") },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx, args);
    const deleted: Record<string, number> = {};
    const wipe = async (table: string, index: string) => {
      const rows = await ctx.db
        .query(table as never)
        .withIndex(index as never, (q: never) =>
          (q as { eq: (f: string, v: string) => unknown }).eq("userId", userId) as never,
        )
        .collect();
      for (const row of rows) await ctx.db.delete((row as { _id: never })._id);
      deleted[table] = rows.length;
    };

    await wipe("workoutLogs", "by_userId_date");
    await wipe("foodLogs", "by_userId_date");
    await wipe("waterLogs", "by_userId_date");
    await wipe("healthMetrics", "by_userId");
    await wipe("bodyMeasurements", "by_userId");
    await wipe("presets", "by_userId");
    await wipe("schedules", "by_userId");
    await wipe("customProgressMetricEntries", "by_userId_and_metricId");
    await wipe("customProgressMetrics", "by_userId");
    return deleted;
  },
});
