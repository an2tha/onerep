import type {
  ProgrammePlan,
  ProgrammeSettings,
  ProgrammeTrack,
} from "../../packages/models/src/guided-programme";

function numberIn(
  value: number,
  min: number,
  max: number,
  label: string,
  integer = false,
) {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(`Check ${label}.`);
}
function unique(values: string[], label: string) {
  if (
    values.some((value) => !value.trim() || value.length > 180) ||
    new Set(values).size !== values.length
  )
    throw new Error(`${label} must have unique, nonempty identifiers.`);
}
export function validateProgrammeSettings(
  settings: ProgrammeSettings,
  track: ProgrammeTrack = "nutrition",
) {
  if (
    !settings.goal.trim() ||
    settings.goal.length > 500 ||
    settings.name.length > 120 ||
    settings.limitations.length > 2000
  )
    throw new Error("Keep your programme name, goal, and notes concise.");
  if (![4, 6, 8, 12].includes(settings.weeks))
    throw new Error("Choose 4, 6, 8, or 12 weeks.");
  new Intl.DateTimeFormat("en", { timeZone: settings.timezone }).format();
  numberIn(settings.mealsPerDay, 1, 6, "meals per day", true);
  numberIn(settings.daysPerWeek, 1, 7, "training days", true);
  numberIn(settings.sessionMinutes, 10, 180, "session duration", true);
  numberIn(settings.cookingMinutes, 5, 180, "cooking time", true);
  if (track === "nutrition") {
    numberIn(settings.baselineCalories, 1600, 5000, "baseline calories");
    numberIn(settings.protein, 40, 300, "protein");
    numberIn(settings.fat, 40, 150, "fat");
    numberIn(settings.changePercent, 0, 15, "target progression");
    const calories =
      settings.baselineCalories *
      (1 -
        (settings.nutritionGoal === "step_down"
          ? settings.changePercent / 100
          : 0));
    if (
      calories < 1600 ||
      settings.protein * 4 + settings.fat * 9 > calories - 400
    )
      throw new Error(
        "These targets leave too little energy for the programme.",
      );
  }
  for (const values of [
    settings.allergies,
    settings.dislikes,
    settings.equipment,
    settings.preferredExercises,
  ])
    if (values.length > 30 || values.some((value) => value.length > 150))
      throw new Error("Keep each preference concise.");
}
const allergenAliases: Record<string, string[]> = {
  milk: [
    "milk",
    "cream",
    "butter",
    "cheese",
    "yogurt",
    "yoghurt",
    "whey",
    "casein",
  ],
  dairy: [
    "milk",
    "cream",
    "butter",
    "cheese",
    "yogurt",
    "yoghurt",
    "whey",
    "casein",
  ],
  eggs: ["egg", "eggs", "mayonnaise"],
  egg: ["egg", "eggs", "mayonnaise"],
  peanuts: ["peanut"],
  nuts: [
    "peanut",
    "almond",
    "walnut",
    "cashew",
    "hazelnut",
    "pistachio",
    "pecan",
  ],
  "tree nuts": ["almond", "walnut", "cashew", "hazelnut", "pistachio", "pecan"],
  gluten: [
    "wheat",
    "barley",
    "rye",
    "semolina",
    "couscous",
    "bulgur",
    "seitan",
  ],
  soy: ["soy", "soya", "tofu", "tempeh", "edamame"],
  fish: ["salmon", "tuna", "cod", "haddock", "anchovy", "sardine", "fish"],
  shellfish: [
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "mussel",
    "oyster",
    "scallop",
    "clam",
  ],
  sesame: ["sesame", "tahini"],
};
export function validateProgrammePlan(
  track: ProgrammeTrack,
  plan: ProgrammePlan,
  settings: ProgrammeSettings,
  generated = false,
  ready = false,
) {
  if (plan.summary.length > 3000)
    throw new Error("Keep the programme summary concise.");
  if (
    (track === "nutrition" && plan.training) ||
    (track === "training" && plan.nutrition)
  )
    throw new Error(
      "Keep nutrition and training in their own programme tracks.",
    );
  if (track === "nutrition") {
    if (!plan.nutrition) {
      if (ready || generated)
        throw new Error("Add meals to your nutrition programme.");
      return;
    }
    const { recipes, meals } = plan.nutrition;
    if (
      recipes.length > 60 ||
      meals.length > 42 ||
      (generated && recipes.length !== 12)
    )
      throw new Error(
        "A generated nutrition programme needs 12 recipes and a seven-day meal schedule.",
      );
    if ((ready || generated) && (!recipes.length || !meals.length))
      throw new Error("Add at least one recipe and planned meal.");
    unique(
      recipes.map((recipe) => recipe.id),
      "Recipes",
    );
    unique(
      meals.map((meal) => meal.id),
      "Meals",
    );
    if (
      generated &&
      new Set(recipes.map((recipe) => recipe.name.toLowerCase().trim()))
        .size !== 12
    )
      throw new Error("The programme must include 12 distinct recipes.");
    for (const recipe of recipes) {
      if (
        !recipe.name.trim() ||
        recipe.name.length > 150 ||
        recipe.ingredients.length < 1 ||
        recipe.ingredients.length > 30 ||
        recipe.steps.length < 1 ||
        recipe.steps.length > 24
      )
        throw new Error(
          "Each recipe needs a name, ingredients, and instructions.",
        );
      numberIn(recipe.servings, 1, 20, "recipe servings");
      numberIn(recipe.prepMinutes, 0, 180, "preparation time");
      numberIn(recipe.cookMinutes, 0, 360, "cooking time");
      for (const item of recipe.ingredients) {
        if (!item.name.trim() || item.name.length > 180)
          throw new Error("Check ingredient names.");
        numberIn(item.grams, 0.1, 10000, "ingredient quantity");
        numberIn(item.caloriesPer100, 0, 950, "ingredient calories");
        for (const value of [
          item.proteinPer100,
          item.carbsPer100,
          item.fatPer100,
        ])
          numberIn(value, 0, 100, "ingredient nutrition");
        const name = item.name.toLowerCase();
        if (
          settings.allergies.some((allergy) =>
            (
              allergenAliases[allergy.toLowerCase().trim()] ?? [
                allergy.toLowerCase().trim(),
              ]
            ).some((word) => word && name.includes(word)),
          )
        )
          throw new Error(
            "A recipe includes an ingredient matching a saved allergy. Replace it before continuing.",
          );
      }
      if (recipe.steps.some((step) => step.length > 1500))
        throw new Error("Keep recipe instructions concise.");
    }
    for (const meal of meals) {
      numberIn(meal.day, 0, 6, "meal day", true);
      numberIn(meal.servings, 0.25, 10, "meal portions");
      if (!recipes.some((recipe) => recipe.id === meal.recipeId))
        throw new Error("A planned meal refers to a missing recipe.");
    }
    if (
      generated &&
      Array.from({ length: 7 }, (_, day) => day).some(
        (day) =>
          meals.filter((meal) => meal.day === day).length !==
          settings.mealsPerDay,
      )
    )
      throw new Error(
        "The generated schedule must cover all seven days and your chosen meal frequency.",
      );
  } else {
    if (!plan.training) {
      if (ready || generated)
        throw new Error("Add sessions to your workout programme.");
      return;
    }
    const { mesocycles, sessions } = plan.training;
    if (
      mesocycles.length > 12 ||
      sessions.length > 84 ||
      ((ready || generated) && (!mesocycles.length || !sessions.length))
    )
      throw new Error("Add a training block and its sessions.");
    unique(
      mesocycles.map((block) => block.id),
      "Blocks",
    );
    unique(
      sessions.map((session) => session.id),
      "Sessions",
    );
    for (const block of mesocycles) {
      numberIn(block.startWeek, 1, settings.weeks, "block start", true);
      numberIn(
        block.endWeek,
        block.startWeek,
        settings.weeks,
        "block end",
        true,
      );
      if (
        !block.name.trim() ||
        block.objective.length > 1000 ||
        block.progression.length > 2000
      )
        throw new Error("Check training block details.");
    }
    for (let week = 1; week <= settings.weeks && (ready || generated); week++) {
      const blocks = mesocycles.filter(
        (block) => block.startWeek <= week && block.endWeek >= week,
      );
      if (blocks.length !== 1)
        throw new Error(
          "Training blocks must cover every week without overlap.",
        );
      if (generated) {
        const weekly = sessions.filter(
          (session) => !session.blockId || session.blockId === blocks[0]!.id,
        );
        if (
          weekly.length !== settings.daysPerWeek ||
          new Set(weekly.map((session) => session.dayOfWeek)).size !==
            weekly.length
        )
          throw new Error("Each block must match your weekly training days.");
      }
    }
    for (const session of sessions) {
      numberIn(session.dayOfWeek, 0, 6, "training day", true);
      if (
        session.exercises.length < 1 ||
        session.exercises.length > 16 ||
        !session.name.trim()
      )
        throw new Error("Each session needs a name and exercises.");
      if (
        session.blockId &&
        !mesocycles.some((block) => block.id === session.blockId)
      )
        throw new Error("A session refers to a missing block.");
      unique(
        session.exercises.map((exercise) => exercise.id),
        "Session exercises",
      );
      unique(
        session.exercises.map((exercise) => exercise.exerciseId),
        "Exercise selections",
      );
      for (const exercise of session.exercises) {
        numberIn(exercise.sets, 1, 12, "exercise sets", true);
        numberIn(exercise.restSeconds, 0, 600, "rest time", true);
        if (
          !exercise.reps.trim() ||
          exercise.reps.length > 80 ||
          exercise.notes.length > 1500 ||
          exercise.alternatives.length > 6
        )
          throw new Error("Check exercise prescription and alternatives.");
      }
    }
  }
}
