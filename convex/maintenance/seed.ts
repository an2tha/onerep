import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { upsertWorkoutLog } from "../lib/workoutLogs";
import { completedExerciseValidator } from "../lib/workoutValidators";

/**
 * Demo-account seeding, kept out of the normal app surface.
 *
 * `bunx convex run maintenance/seed:verifyEmail '{"email":"..."}'` then
 * `...:userIdForEmail` to get the app-facing userId, then
 * `...:seedDemoHistory '{"userId":"..."}'` to write the history.
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
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("onboardingProfiles", {
      userId: args.userId,
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
      userId: args.userId,
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
  args: { userId: v.string(), seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
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
        await upsertWorkoutLog(ctx, args.userId, {
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
          userId: args.userId,
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
 */
export const seedBodyCheckins = internalMutation({
  args: { userId: v.string(), seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rng = mulberry32(args.seed ?? 77_012);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const totalDays = WEEKS * 7;
    const startMs = today.getTime() - totalDays * 86_400_000;

    let written = 0;
    // Every third or fourth morning, not religiously.
    for (let dayIndex = 0; dayIndex <= totalDays; dayIndex += 3 + Math.floor(rng() * 2)) {
      const dateMs = startMs + dayIndex * 86_400_000;
      const dateStr = new Date(dateMs).toISOString().slice(0, 10);
      const progress = dayIndex / totalDays;
      const weightKg = 84.6 - 3.1 * progress + (rng() - 0.5) * 0.7;
      const bodyFatPct = 18.4 - 2.6 * progress + (rng() - 0.5) * 0.4;
      const waistCm = 84.5 - 3.4 * progress + (rng() - 0.5) * 0.6;

      await ctx.db.insert("bodyMeasurements", {
        userId: args.userId,
        clientId: `seed-checkin-${dateStr}`,
        loggedAt: dateStr,
        weightKg: Math.round(weightKg * 10) / 10,
        bodyFatPct: Math.round(bodyFatPct * 10) / 10,
        waistCm: Math.round(waistCm * 10) / 10,
        createdAt: dateMs + 7 * 3_600_000,
        updatedAt: dateMs + 7 * 3_600_000,
      });
      written += 1;
    }

    return { written };
  },
});

// ── The rest of the screens ──────────────────────────────────────────────
//
// The history above fills the charts. What it does not fill is everything a
// camera actually lingers on: the water row reading zero, the routine grid
// with seven empty days, a Progress health tab with nothing in it. These
// write the unglamorous rows that keep a demo from filming as an empty state.

/** Water goal and units, so the dashboard has a target to draw against. */
export const seedDemoPreferences = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const patch = {
      waterGoalMl: 2500,
      weightUnit: "kg",
      lastActiveTimezone: "Europe/Berlin",
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { updated: true };
    }
    await ctx.db.insert("userPreferences", {
      userId: args.userId,
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
  args: { userId: v.string() },
  handler: async (ctx, args) => {
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
        userId: args.userId,
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
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { routine, presetOrder: ids, updatedAt: now });
    } else {
      await ctx.db.insert("schedules", {
        userId: args.userId,
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
  args: { userId: v.string(), seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
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
        userId: args.userId,
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
  args: { userId: v.string(), seed: v.optional(v.number()) },
  handler: async (ctx, args) => {
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
        userId: args.userId,
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

/**
 * What is already there. Every seeder here inserts rather than upserts, so
 * running one twice quietly doubles the history — check before you pour.
 */
export const demoRowCounts = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const count = async (
      table: "workoutLogs" | "foodLogs" | "waterLogs" | "healthMetrics" | "bodyMeasurements" | "presets",
      index: string,
    ) =>
      (
        await ctx.db
          .query(table)
          .withIndex(index as never, (q: never) => (q as { eq: (f: string, v: string) => unknown }).eq("userId", args.userId) as never)
          .collect()
      ).length;

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
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .collect()
      ).length,
      onboarding: (
        await ctx.db
          .query("onboardingProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .collect()
      ).length,
    };
  },
});

/**
 * Wipes every table these seeders write, for one user id only. Meant for the
 * demo account when a seed run needs doing again — the inserts above are not
 * idempotent, and a demo with two of every workout is worse than no demo.
 */
export const clearDemoData = internalMutation({
  args: { userId: v.string(), confirm: v.literal("yes-wipe-this-user") },
  handler: async (ctx, args) => {
    const deleted: Record<string, number> = {};
    const wipe = async (table: string, index: string) => {
      const rows = await ctx.db
        .query(table as never)
        .withIndex(index as never, (q: never) =>
          (q as { eq: (f: string, v: string) => unknown }).eq("userId", args.userId) as never,
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
    return deleted;
  },
});
