import * as z from "zod"
import { ArrowRight } from "@phosphor-icons/react"

const preferencesSchema = z.object({
  energyUnit: z.enum(["kcal", "Cal", "kJ"]).default("kcal"),
  workoutFocus: z.enum(["strength", "cardio", "mobility"]).default("strength"),
  simpleMode: z.boolean().default(false),
  destination: z.enum(["/", "/workouts", "/nutrition", "/coach"]).default("/"),
  weightTrend: z
    .enum(["losing", "stable", "gaining", "unknown"])
    .default("stable"),
  occupationActivity: z
    .enum(["desk", "mixed", "on_feet", "manual"])
    .default("mixed"),
  dietType: z
    .enum([
      "omnivore",
      "vegetarian",
      "vegan",
      "pescatarian",
      "halal",
      "kosher",
      "other",
    ])
    .default("omnivore"),
  allergies: z.array(z.string()).default([]),
  cookingSkill: z
    .enum(["beginner", "intermediate", "advanced"])
    .default("intermediate"),
  budget: z.enum(["low", "moderate", "flexible"]).default("moderate"),
  mealFrequency: z.number().int().min(1).max(8).default(3),
  trackingMode: z
    .enum(["full", "protein_calories", "photo_portion", "habit", "recovery"])
    .default("full"),
  loggingFeatures: z.array(z.string()).default(["barcode", "saved_meals"]),
  firstNutritionAction: z
    .enum([
      "log_first_meal",
      "build_template",
      "tomorrow_plan",
      "import_yesterday",
      "skip_habit",
    ])
    .default("log_first_meal"),
})
export type SetupPreferencesValue = z.infer<typeof preferencesSchema>
export const defaultSetupPreferences = preferencesSchema.parse({})
export function parseSetupPreferences(
  raw: string | null
): SetupPreferencesValue {
  try {
    return preferencesSchema.parse(JSON.parse(raw ?? "{}"))
  } catch {
    return defaultSetupPreferences
  }
}

function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="setup-field">
      <legend>{label}</legend>
      <div className="setup-choices">
        {options.map(([id, title]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {title}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
export function SetupPreferences({
  section,
  value,
  onChange,
  theme,
  setTheme,
  weightUnit,
  setWeightUnit,
  waterGoalMl,
  setWaterGoalMl,
  onContinue,
}: {
  section: string
  value: SetupPreferencesValue
  onChange: (value: SetupPreferencesValue) => void
  theme: "light" | "dark" | "system"
  setTheme: (value: "light" | "dark" | "system") => void
  weightUnit: "kg" | "lbs"
  setWeightUnit: (value: "kg" | "lbs") => void
  waterGoalMl: number
  setWaterGoalMl: (value: number) => void
  onContinue: () => void
}) {
  function update<K extends keyof SetupPreferencesValue>(
    key: K,
    next: SetupPreferencesValue[K]
  ) {
    onChange({ ...value, [key]: next })
  }
  return (
    <div className="setup-preferences">
      {section === "preferences" && (
        <>
          <fieldset className="setup-field">
            <legend>Appearance</legend>
            <div className="setup-theme-options">
              {(["light", "dark", "system"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={theme === option}
                  onClick={() => setTheme(option)}
                >
                  <span className="setup-theme-preview" data-theme={option}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>
                    {option === "system"
                      ? "Match device"
                      : option === "light"
                        ? "Light"
                        : "Dark"}
                  </strong>
                </button>
              ))}
            </div>
          </fieldset>
          <Choices
            label="Weight units"
            value={weightUnit}
            options={[
              ["kg", "Kilograms"],
              ["lbs", "Pounds"],
            ]}
            onChange={setWeightUnit}
          />
          <Choices
            label="Energy units"
            value={value.energyUnit}
            options={[
              ["kcal", "kcal"],
              ["Cal", "Calories"],
              ["kJ", "Kilojoules"],
            ]}
            onChange={(next) => update("energyUnit", next)}
          />
          <Choices
            label="Training focus"
            value={value.workoutFocus}
            options={[
              ["strength", "Strength"],
              ["cardio", "Cardio"],
              ["mobility", "Mobility"],
            ]}
            onChange={(next) => update("workoutFocus", next)}
          />
          <label className="setup-toggle">
            <span>
              <strong>Simplified dashboard</strong>
              <small>Keep the daily overview focused on the essentials.</small>
            </span>
            <input
              type="checkbox"
              checked={value.simpleMode}
              onChange={(event) => update("simpleMode", event.target.checked)}
            />
          </label>
          <Choices
            label="Open after setup"
            value={value.destination}
            options={[
              ["/", "Today"],
              ["/workouts", "Workouts"],
              ["/nutrition", "Nutrition"],
              ["/coach", "Coach"],
            ]}
            onChange={(next) => update("destination", next)}
          />
        </>
      )}
      {section === "nutrition" && (
        <>
          <Choices
            label="Tracking style"
            value={value.trackingMode}
            options={[
              ["full", "Full macros"],
              ["protein_calories", "Protein & calories"],
              ["photo_portion", "Photos & portions"],
              ["habit", "Habits"],
              ["recovery", "Recovery focused"],
            ]}
            onChange={(next) => update("trackingMode", next)}
          />
          <Choices
            label="Dietary preference"
            value={value.dietType}
            options={[
              ["omnivore", "No preference"],
              ["vegetarian", "Vegetarian"],
              ["vegan", "Vegan"],
              ["pescatarian", "Pescatarian"],
              ["halal", "Halal"],
              ["kosher", "Kosher"],
              ["other", "Other"],
            ]}
            onChange={(next) => update("dietType", next)}
          />
          <fieldset className="setup-field">
            <legend>Allergies and intolerances</legend>
            <div className="setup-choices">
              {[
                "milk",
                "eggs",
                "peanuts",
                "tree nuts",
                "soy",
                "wheat",
                "fish",
                "shellfish",
                "sesame",
              ].map((allergy) => (
                <button
                  key={allergy}
                  type="button"
                  aria-pressed={value.allergies.includes(allergy)}
                  onClick={() =>
                    update(
                      "allergies",
                      value.allergies.includes(allergy)
                        ? value.allergies.filter((item) => item !== allergy)
                        : [...value.allergies, allergy]
                    )
                  }
                >
                  {allergy}
                </button>
              ))}
            </div>
            <p>Optional. Check food labels when choosing what to eat.</p>
          </fieldset>
          <fieldset className="setup-field">
            <legend>Preferred logging tools</legend>
            <div className="setup-choices">
              {[
                ["barcode", "Barcode scanning"],
                ["saved_meals", "Saved meals"],
                ["photo", "Food photos"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={value.loggingFeatures.includes(id!)}
                  onClick={() =>
                    update(
                      "loggingFeatures",
                      value.loggingFeatures.includes(id!)
                        ? value.loggingFeatures.filter((item) => item !== id)
                        : [...value.loggingFeatures, id!]
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <Choices
            label="First nutrition step"
            value={value.firstNutritionAction}
            options={[
              ["log_first_meal", "Log a meal"],
              ["build_template", "Create a meal template"],
              ["tomorrow_plan", "Plan tomorrow"],
              ["skip_habit", "Start with a habit"],
            ]}
            onChange={(next) => update("firstNutritionAction", next)}
          />
        </>
      )}
      {section === "lifestyle" && (
        <>
          <Choices
            label="Activity at work"
            value={value.occupationActivity}
            options={[
              ["desk", "Mostly seated"],
              ["mixed", "A mix"],
              ["on_feet", "On my feet"],
              ["manual", "Physical work"],
            ]}
            onChange={(next) => update("occupationActivity", next)}
          />
          <Choices
            label="Recent weight trend"
            value={value.weightTrend}
            options={[
              ["losing", "Losing"],
              ["stable", "Stable"],
              ["gaining", "Gaining"],
              ["unknown", "Unsure"],
            ]}
            onChange={(next) => update("weightTrend", next)}
          />
          <Choices
            label="Cooking experience"
            value={value.cookingSkill}
            options={[
              ["beginner", "Simple meals"],
              ["intermediate", "Comfortable cooking"],
              ["advanced", "Adventurous cook"],
            ]}
            onChange={(next) => update("cookingSkill", next)}
          />
          <Choices
            label="Food budget"
            value={value.budget}
            options={[
              ["low", "Budget conscious"],
              ["moderate", "Moderate"],
              ["flexible", "Flexible"],
            ]}
            onChange={(next) => update("budget", next)}
          />
          <label className="setup-field">
            Meals per day
            <select
              value={value.mealFrequency}
              onChange={(event) =>
                update("mealFrequency", Number(event.target.value))
              }
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                <option key={count} value={count}>
                  {count} meals
                </option>
              ))}
            </select>
          </label>
          <label className="setup-field">
            Daily water goal
            <select
              value={waterGoalMl}
              onChange={(event) => setWaterGoalMl(Number(event.target.value))}
            >
              {Array.from(
                new Set([1500, 2000, 2500, 3000, 3500, 4000, waterGoalMl])
              )
                .sort((a, b) => a - b)
                .map((amount) => (
                  <option key={amount} value={amount}>
                    {amount.toLocaleString()} ml
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      <button
        type="button"
        className="onboarding-primary-button"
        onClick={onContinue}
      >
        Continue <ArrowRight size={18} />
      </button>
    </div>
  )
}
