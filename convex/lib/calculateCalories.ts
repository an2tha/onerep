// Ported from apps/server/src/lib/calculateCalories.ts

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const GOAL_CALORIE_DELTA: Record<string, number> = {
  lose: -500,
  maintain: 0,
  gain: 500,
};

const OCCUPATION_ACTIVITY_TDEE_DELTA: Record<string, number> = {
  desk: -0.04,
  mixed: 0,
  on_feet: 0.06,
  manual: 0.1,
};

export interface CaloricGoals {
  bmr: number;
  tdee: number;
  targetCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  saturatedFatLimit?: number;
  sodiumLimit?: number;
  calorieStrategy?: string;
  safetyMode?: string;
  trackingMode?: string;
  guidance?: string[];
}

export interface NutritionPersonalizationContext {
  nutritionGoal?: string;
  safetyMode?: string;
  weightTrend?: string;
  occupationActivity?: string;
  dietType?: string;
  allergies?: string[];
  cookingSkill?: string;
  budget?: string;
  mealFrequency?: number;
  trackingMode?: string;
  loggingFeatures?: string[];
  firstNutritionAction?: string;
}

function hasNutritionContext(
  context: NutritionPersonalizationContext | null | undefined,
) {
  return Boolean(
    context &&
    (context.nutritionGoal ||
      context.safetyMode ||
      context.weightTrend ||
      context.occupationActivity ||
      context.dietType ||
      context.trackingMode ||
      context.firstNutritionAction),
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function nutritionGoalFromLegacy(goal: string) {
  if (goal === "lose") return "lose_fat";
  if (goal === "gain") return "gain_muscle";
  return "maintain";
}

function caloriePlanForGoal(
  tdee: number,
  goal: string,
  context: NutritionPersonalizationContext,
  sex: string,
) {
  const safetyMode = context.safetyMode ?? "standard";
  const isProtectedMode =
    safetyMode === "habit" ||
    safetyMode === "clinician" ||
    safetyMode === "recovery";

  if (isProtectedMode) {
    return {
      targetCalories: tdee,
      strategy:
        safetyMode === "recovery"
          ? "Non-numeric recovery mode: use maintenance as a quiet baseline."
          : safetyMode === "clinician"
            ? "Clinician-guided mode: avoid deficit/surplus prescriptions."
            : "Habit mode: avoid weight-loss prescriptions.",
    };
  }

  if (goal === "lose_fat") {
    const trendMultiplier =
      context.weightTrend === "losing"
        ? 0.08
        : context.weightTrend === "gaining"
          ? 0.16
          : 0.12;
    const deficit = clamp(Math.round(tdee * trendMultiplier), 220, 450);
    // Never prescribe below the accepted clinical minimum, whatever the maths
    // says. A 40 kg 18-year-old on "lose fat" lands at 1084 kcal without this.
    const floor = sex === "male" ? 1500 : 1200;
    const targetCalories = Math.max(floor, tdee - deficit);
    return {
      targetCalories,
      strategy:
        targetCalories === floor
          ? `Held at the ${floor} kcal minimum: a deeper cut wouldn't be safe at this size.`
          : `Modest deficit: about ${deficit} kcal below estimated maintenance.`,
    };
  }

  if (goal === "gain_muscle") {
    const surplus = clamp(Math.round(tdee * 0.06), 150, 300);
    return {
      targetCalories: tdee + surplus,
      strategy: `Small surplus: about ${surplus} kcal above estimated maintenance.`,
    };
  }

  if (goal === "performance") {
    const surplus = clamp(Math.round(tdee * 0.04), 100, 250);
    return {
      targetCalories: tdee + surplus,
      strategy: "Performance fueling: slight surplus with higher carbs.",
    };
  }

  return {
    targetCalories: tdee,
    strategy:
      goal === "macros_only"
        ? "Macro-focused mode: calories stay near maintenance."
        : "Maintenance range with diet-quality targets.",
  };
}

function macroTargets(
  targetCalories: number,
  weightKg: number,
  activityLevel: string,
  goal: string,
  context: NutritionPersonalizationContext,
) {
  const safetyMode = context.safetyMode ?? "standard";
  const proteinPerKg =
    safetyMode === "recovery"
      ? 1.2
      : goal === "gain_muscle"
        ? 1.9
        : goal === "lose_fat"
          ? 1.8
          : goal === "performance"
            ? 1.7
            : 1.6;
  const dietProteinMultiplier =
    context.dietType === "vegan" || context.dietType === "vegetarian"
      ? 1.08
      : 1;
  const protein = Math.round(weightKg * proteinPerKg * dietProteinMultiplier);

  const fatMinimum = Math.round(weightKg * 0.6);
  const preferredFatCalories = targetCalories * 0.28;
  const fat = Math.max(fatMinimum, Math.round(preferredFatCalories / 9));

  const remainingCalories = Math.max(0, targetCalories - protein * 4 - fat * 9);
  const activityCarbMultiplier =
    activityLevel === "very_active" || activityLevel === "extra_active"
      ? 1.12
      : goal === "performance"
        ? 1.08
        : 1;
  const carbs = Math.max(
    80,
    Math.round((remainingCalories / 4) * activityCarbMultiplier),
  );

  return { protein, carbs, fat };
}

function buildGuidance(
  context: NutritionPersonalizationContext,
  targetCalories: number,
) {
  const guidance: string[] = [];
  const safetyMode = context.safetyMode ?? "standard";

  if (safetyMode === "recovery") {
    guidance.push("Use non-numeric check-ins and avoid deficit feedback.");
  } else if (safetyMode === "clinician") {
    guidance.push("Keep targets conservative and prompt clinician guidance.");
  } else if (safetyMode === "habit") {
    guidance.push("Focus on meals, protein, vegetables, water, and education.");
  }

  if (context.trackingMode === "photo_portion") {
    guidance.push("Prioritize photo and portion logging over exact grams.");
  } else if (context.trackingMode === "habit") {
    guidance.push("Show habit goals before calorie details.");
  } else if (context.trackingMode === "protein_calories") {
    guidance.push("Emphasize protein and calories; keep carbs/fat secondary.");
  } else if (context.trackingMode === "recovery") {
    guidance.push("Hide streak pressure and aggressive numeric feedback.");
  }

  if (context.budget === "low") {
    guidance.push("Prefer budget staples and repeatable meal templates.");
  }
  if (context.cookingSkill === "beginner") {
    guidance.push("Suggest low-prep meals and saved templates first.");
  }
  if (context.allergies?.length) {
    guidance.push(`Avoid selected allergens: ${context.allergies.join(", ")}.`);
  }
  if (context.firstNutritionAction === "tomorrow_plan") {
    guidance.push("Start by building tomorrow's meal plan.");
  } else if (context.firstNutritionAction === "skip_habit") {
    guidance.push("Start in habit mode instead of food logging.");
  }

  if (guidance.length === 0) {
    guidance.push(
      `Start around ${targetCalories} kcal and calibrate after 7-14 days.`,
    );
  }

  return guidance;
}

export function calculateCalories(
  params: {
    sex: string;
    age: number;
    weightKg: number;
    heightCm: number;
    activityLevel: string;
    goal: string;
  },
  context?: NutritionPersonalizationContext | null,
): CaloricGoals {
  const { sex, age, weightKg, heightCm, activityLevel, goal } = params;

  // Mifflin-St Jeor equation
  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);

  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.55;
  const delta = GOAL_CALORIE_DELTA[goal] ?? 0;

  const tdee = Math.round(bmr * multiplier);
  const targetCalories = Math.round(tdee + delta);

  if (hasNutritionContext(context)) {
    const nutritionGoal =
      context?.nutritionGoal ?? nutritionGoalFromLegacy(params.goal);
    const activityAdjustment =
      OCCUPATION_ACTIVITY_TDEE_DELTA[context?.occupationActivity ?? "mixed"] ??
      0;
    const adjustedTdee = Math.round(tdee * (1 + activityAdjustment));
    const plan = caloriePlanForGoal(
      adjustedTdee,
      nutritionGoal,
      context ?? {},
      sex,
    );
    const macros = macroTargets(
      plan.targetCalories,
      weightKg,
      activityLevel,
      nutritionGoal,
      context ?? {},
    );
    const fiber = Math.round(clamp(plan.targetCalories / 1000, 1.6, 3.8) * 14);
    return {
      bmr: Math.round(bmr),
      tdee: adjustedTdee,
      targetCalories: plan.targetCalories,
      ...macros,
      fiber,
      saturatedFatLimit: Math.round((plan.targetCalories * 0.1) / 9),
      sodiumLimit: 2300,
      calorieStrategy: plan.strategy,
      safetyMode: context?.safetyMode ?? "standard",
      trackingMode: context?.trackingMode,
      guidance: buildGuidance(context ?? {}, plan.targetCalories),
    };
  }

  // Macro split: 30% protein, 40% carbs, 30% fat
  const protein = Math.round((targetCalories * 0.3) / 4);
  const carbs = Math.round((targetCalories * 0.4) / 4);
  const fat = Math.round((targetCalories * 0.3) / 9);

  return { bmr: Math.round(bmr), tdee, targetCalories, protein, carbs, fat };
}
