import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Check, Minus, Plus } from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  type CalorieGoal,
  type HealthProfileDraft,
  type OnboardingDraft,
  type OnboardingGoal,
  type Sex,
  type WeightUnit,
  isOnboardingGoal,
  mapOnboardingGoalToCalorieGoal,
} from "@/lib/health-goals"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  cn,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeSessionStorageSet,
} from "@/lib/utils"
import {
  hapticHeavy,
  hapticMedium,
  hapticSelection,
  hapticTap,
} from "@/lib/haptics"

const AGE_MIN = 13
const AGE_MAX = 100
const HEIGHT_MIN = 100
const HEIGHT_MAX = 250
const WEIGHT_KG_MIN = 35
const WEIGHT_KG_MAX = 250
const WATER_MIN = 1000
const WATER_MAX = 6000
const POST_SIGNUP_ONBOARDING_KEY = "onerep:post-signup-onboarding"
const THEME_KEY = "theme"
const FIRST_NUTRITION_ACTION_DONE_KEY = "onerep:first-nutrition-action-done"

const activities = [
  ["sedentary", "Sedentary", "Mostly seated, little planned movement."],
  ["lightly_active", "Light", "Walks or light training a few days per week."],
  ["moderately_active", "Moderate", "Training or active work most weeks."],
  ["very_active", "Very active", "Hard training or active work most days."],
  ["extra_active", "Athlete", "Demanding training plus a physical schedule."],
] satisfies [ActivityLevel, string, string][]

type NutritionGoal =
  | "maintain"
  | "lose_fat"
  | "gain_muscle"
  | "performance"
  | "macros_only"
  | "medical"
type SafetyMode = "standard" | "habit" | "clinician" | "recovery"
type WeightTrend = "losing" | "stable" | "gaining" | "unknown"
type OccupationActivity = "desk" | "mixed" | "on_feet" | "manual"
type DietType =
  | "omnivore"
  | "vegetarian"
  | "vegan"
  | "pescatarian"
  | "halal"
  | "kosher"
  | "other"
type CookingSkill = "beginner" | "intermediate" | "advanced"
type Budget = "low" | "moderate" | "flexible"
type TrackingMode =
  "full" | "protein_calories" | "photo_portion" | "habit" | "recovery"
type FirstNutritionAction =
  | "log_first_meal"
  | "build_template"
  | "tomorrow_plan"
  | "import_yesterday"
  | "skip_habit"

type ConsentState = {
  dataUse: boolean
  weightData: boolean
  foodLogging: boolean
  wearableIntegrations: boolean
}

const nutritionGoals = [
  ["maintain", "Maintain weight", "Eat healthier without aggressive targets."],
  ["lose_fat", "Lose fat", "Use a modest, trend-based calorie target."],
  ["gain_muscle", "Gain muscle", "Fuel lifting, recovery, and protein."],
  ["performance", "Fuel workouts", "Support training quality and energy."],
  ["macros_only", "Track macros only", "Keep calories secondary."],
  ["medical", "Medical nutrition goal", "Use clinician-guided setup."],
] satisfies [NutritionGoal, string, string][]

const safetyOptions = [
  ["under_18", "Under 18"],
  ["pregnant_or_breastfeeding", "Pregnant or breastfeeding"],
  ["diabetes", "Diabetes"],
  ["kidney_disease", "Kidney disease"],
  ["eating_disorder_history", "Eating disorder history"],
  ["active_treatment", "Active treatment"],
  ["major_gi_disorder", "Major GI disorder"],
  ["purging_laxatives", "Purging or laxative use"],
  ["fasting_cycles", "Fasting cycles"],
  ["binge_distress", "Binge distress"],
  ["fear_weight_gain", "Fear of weight gain"],
  ["compulsive_tracking", "Compulsive tracking"],
] satisfies [string, string][]

const weightTrends = [
  ["stable", "Stable"],
  ["losing", "Trending down"],
  ["gaining", "Trending up"],
  ["unknown", "Not sure"],
] satisfies [WeightTrend, string][]

const occupationActivities = [
  ["desk", "Mostly seated"],
  ["mixed", "Mixed day"],
  ["on_feet", "On my feet"],
  ["manual", "Physical work"],
] satisfies [OccupationActivity, string][]

const dietTypes = [
  ["omnivore", "Omnivore"],
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
  ["pescatarian", "Pescatarian"],
  ["halal", "Halal"],
  ["kosher", "Kosher"],
  ["other", "Other"],
] satisfies [DietType, string][]

const allergyOptions = [
  ["none", "No major allergies"],
  ["dairy", "Dairy"],
  ["gluten", "Gluten"],
  ["eggs", "Eggs"],
  ["peanuts", "Peanuts"],
  ["tree_nuts", "Tree nuts"],
  ["soy", "Soy"],
  ["fish_shellfish", "Fish/shellfish"],
] satisfies [string, string][]

const cookingSkills = [
  ["beginner", "Keep it simple"],
  ["intermediate", "I can cook"],
  ["advanced", "I like recipes"],
] satisfies [CookingSkill, string][]

const budgets = [
  ["low", "Budget"],
  ["moderate", "Moderate"],
  ["flexible", "Flexible"],
] satisfies [Budget, string][]

const trackingModes = [
  ["full", "Calories + macros"],
  ["protein_calories", "Protein + calories"],
  ["photo_portion", "Photo / portion logging"],
  ["habit", "Habit tracking"],
  ["recovery", "Non-numeric recovery"],
] satisfies [TrackingMode, string][]

const loggingFeatureOptions = [
  ["barcode", "Barcode scanner"],
  ["saved_meals", "Saved meals"],
  ["restaurant_search", "Restaurant search"],
  ["meal_reminders", "Meal reminders"],
  ["wearable_energy", "Wearable energy"],
] satisfies [string, string][]

const firstNutritionActions = [
  ["log_first_meal", "Log first meal"],
  ["build_template", "Build a meal template"],
  ["tomorrow_plan", "Plan tomorrow"],
  ["import_yesterday", "Import yesterday"],
  ["skip_habit", "Start habit mode"],
] satisfies [FirstNutritionAction, string][]

const steps = [
  {
    label: "Setup",
    title: "Set up nutrition",
    accent: "nutrition",
    body: "Two minutes, optional, and editable anytime.",
    image: "/onboarding/unboxing.svg",
  },
  {
    label: "Consent",
    title: "Choose what OneRep can use",
    accent: "use",
    body: "Your answers personalize calories, macros, and logging.",
    image: "/onboarding/plant.svg",
  },
  {
    label: "Goal",
    title: "What is your nutrition goal?",
    accent: "goal",
    body: "This sets the safest starting point for feedback.",
    image: "/onboarding/sprinting.svg",
  },
  {
    label: "Body",
    title: "Which profile should we use?",
    accent: "profile",
    body: "This is only used for calorie math. You can change it later.",
    image: "/onboarding/reading.svg",
  },
  {
    label: "Age",
    title: "How old are you?",
    accent: "old",
    body: "Age helps estimate your baseline energy needs.",
    image: "/onboarding/sit-reading.svg",
  },
  {
    label: "Safety",
    title: "Any safety context?",
    accent: "safety",
    body: "These answers keep targets conservative when needed.",
    image: "/onboarding/sleek.svg",
  },
  {
    label: "Height",
    title: "How tall are you?",
    accent: "tall",
    body: "Height is part of the starting calorie calculation.",
    image: "/onboarding/rolling.svg",
  },
  {
    label: "Weight",
    title: "What's your current weight?",
    accent: "weight",
    body: "Use today's best estimate. This is just your starting point.",
    image: "/onboarding/petting.svg",
  },
  {
    label: "Trend",
    title: "What is your weight doing?",
    accent: "doing",
    body: "Trends matter more than one weigh-in.",
    image: "/onboarding/dancing.svg",
  },
  {
    label: "Activity",
    title: "Choose a normal week",
    accent: "normal",
    body: "Pick the option that matches most weeks, not your perfect week.",
    image: "/onboarding/running.svg",
  },
  {
    label: "Workday",
    title: "How active is your day?",
    accent: "active",
    body: "This covers movement outside workouts.",
    image: "/onboarding/strolling.svg",
  },
  {
    label: "Diet",
    title: "What diet fits you?",
    accent: "diet",
    body: "OneRep will avoid suggestions that do not fit your food rules.",
    image: "/onboarding/coffee.svg",
  },
  {
    label: "Constraints",
    title: "Any allergies or intolerances?",
    accent: "allergies",
    body: "Pick the important ones. You can add details later.",
    image: "/onboarding/selfie.svg",
  },
  {
    label: "Meals",
    title: "How should meals feel?",
    accent: "meals",
    body: "Cooking, budget, and meal frequency shape practical plans.",
    image: "/onboarding/swinging.svg",
  },
  {
    label: "Units",
    title: "Which units feel natural?",
    accent: "units",
    body: "OneRep will use this in logging and settings.",
    image: "/onboarding/meditating.svg",
  },
  {
    label: "Water",
    title: "Set a water target",
    accent: "water",
    body: "Choose a simple daily target to start with.",
    image: "/onboarding/float.svg",
  },
  {
    label: "Tracking",
    title: "Choose a tracking style",
    accent: "tracking",
    body: "Use numbers, photos, habits, or recovery mode.",
    image: "/onboarding/ice-cream.svg",
  },
  {
    label: "Logging",
    title: "What should be ready?",
    accent: "ready",
    body: "OneRep can prioritize the tools you actually want.",
    image: "/onboarding/groovy.svg",
  },
  {
    label: "First action",
    title: "Start with one action",
    accent: "action",
    body: "Choose what happens after onboarding.",
    image: "/onboarding/groovy-sitting.svg",
  },
  {
    label: "Theme",
    title: "Choose your app theme",
    accent: "theme",
    body: "Onboarding stays light. This applies once setup is done.",
    image: "/onboarding/loving.svg",
  },
  {
    label: "Review",
    title: "Your first targets",
    accent: "targets",
    body: "Use these as a starting point. You can tune everything later.",
    image: "/onboarding/ballet.svg",
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function kgToLbs(kg: number) {
  return Math.round(kg * 2.20462)
}

function lbsToKg(lbs: number) {
  return Math.round((lbs / 2.20462) * 10) / 10
}

function formatLiters(ml: number) {
  return `${(ml / 1000).toFixed(1)} L`
}

function selectedActivityLabel(activity: ActivityLevel) {
  return activities.find(([id]) => id === activity)?.[1] ?? "Moderate"
}

function selectedLabel<T extends string>(
  options: readonly (readonly [T, string, ...string[]])[],
  value: T
) {
  return options.find(([id]) => id === value)?.[1] ?? value
}

function healthGoalToOnboardingGoal(goal: CalorieGoal): OnboardingGoal {
  if (goal === "lose") return "lose"
  if (goal === "gain") return "build"
  return "health"
}

function nutritionGoalToOnboardingGoal(goal: NutritionGoal): OnboardingGoal {
  if (goal === "lose_fat") return "lose"
  if (goal === "gain_muscle") return "build"
  if (goal === "performance") return "performance"
  return "health"
}

function isActivityLevel(value: unknown): value is ActivityLevel {
  return ACTIVITY_LEVELS.includes(value as ActivityLevel)
}

function isNutritionGoal(value: unknown): value is NutritionGoal {
  return nutritionGoals.some(([id]) => id === value)
}

function isWeightTrend(value: unknown): value is WeightTrend {
  return weightTrends.some(([id]) => id === value)
}

function isOccupationActivity(value: unknown): value is OccupationActivity {
  return occupationActivities.some(([id]) => id === value)
}

function isDietType(value: unknown): value is DietType {
  return dietTypes.some(([id]) => id === value)
}

function isCookingSkill(value: unknown): value is CookingSkill {
  return cookingSkills.some(([id]) => id === value)
}

function isBudget(value: unknown): value is Budget {
  return budgets.some(([id]) => id === value)
}

function isTrackingMode(value: unknown): value is TrackingMode {
  return trackingModes.some(([id]) => id === value)
}

function isFirstNutritionAction(value: unknown): value is FirstNutritionAction {
  return firstNutritionActions.some(([id]) => id === value)
}

function deriveSafetyMode(
  age: number,
  nutritionGoal: NutritionGoal,
  flags: string[]
): SafetyMode {
  if (
    flags.some((flag) =>
      [
        "purging_laxatives",
        "fasting_cycles",
        "binge_distress",
        "fear_weight_gain",
        "compulsive_tracking",
        "eating_disorder_history",
      ].includes(flag)
    )
  ) {
    return "recovery"
  }
  if (age < 18 || flags.includes("under_18")) return "habit"
  if (
    nutritionGoal === "medical" ||
    flags.some((flag) =>
      [
        "pregnant_or_breastfeeding",
        "diabetes",
        "kidney_disease",
        "active_treatment",
        "major_gi_disorder",
      ].includes(flag)
    )
  ) {
    return "clinician"
  }
  return "standard"
}

function safetyModeLabel(mode: SafetyMode) {
  if (mode === "habit") return "Habit + education mode"
  if (mode === "clinician") return "Clinician-guided mode"
  if (mode === "recovery") return "Non-numeric recovery mode"
  return "Standard targets"
}

function firstNutritionActionPath(action: FirstNutritionAction) {
  if (action === "build_template") return "/foods/recipe/new"
  if (action === "tomorrow_plan") return "/nutrition?plan=tomorrow"
  if (action === "import_yesterday") return "/foods?history=1"
  if (action === "skip_habit") return "/nutrition?mode=habit"
  return "/foods/search"
}

function OnboardingIllustration({ step }: { step: number }) {
  return (
    <div className="mx-auto flex h-[235px] w-full items-end justify-center pt-4 short-phone:h-[178px]">
      <img
        src={steps[step].image}
        alt=""
        className="h-full max-h-[225px] w-full max-w-[18.5rem] object-contain short-phone:max-h-[170px]"
      />
    </div>
  )
}

function StepTitle({ title, accent }: { title: string; accent: string }) {
  const parts = title.split(accent)
  if (parts.length === 1) return <>{title}</>
  return (
    <>
      {parts[0]}
      <span className="text-[#171a18]">{accent}</span>
      {parts.slice(1).join(accent)}
    </>
  )
}

function NumberQuestion({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  function update(next: number) {
    hapticSelection()
    onChange(clamp(next, min, max))
  }

  return (
    <div className="py-2">
      <p className="text-center text-[11px] font-black tracking-[0.16em] text-[#6f6d68] uppercase">
        {label}
      </p>
      <p className="mt-4 text-center text-[4.35rem] leading-none font-black tracking-tight text-[#171a18] tabular-nums">
        {display}
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => update(value - step)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] bg-[#e8e7e3] text-[#171a18] transition-opacity active:opacity-70 disabled:opacity-35"
        >
          <Minus size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => update(value + step)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] bg-[#e8e7e3] text-[#171a18] transition-opacity active:opacity-70 disabled:opacity-35"
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-6 h-10 w-full accent-[#171a18]"
        aria-label={label}
      />
    </div>
  )
}

function PillToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2">
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              hapticSelection()
              onChange(option.value)
            }}
            className={cn(
              "min-h-12 rounded-[6px] px-4 text-[14px] font-black transition-colors",
              selected
                ? "bg-[#171a18] text-[#f8faf7]"
                : "bg-[#e8e7e3] text-[#171a18] active:bg-[#deddd8]"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function OptionList<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly (readonly [T, string, ...string[]])[]
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2">
      {options.map(([id, label, body]) => {
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              hapticSelection()
              onChange(id)
            }}
            aria-pressed={selected}
            className={cn(
              "min-h-12 rounded-[6px] px-4 py-3 text-left transition-colors",
              selected
                ? "bg-[#171a18] text-[#f8faf7]"
                : "bg-[#e8e7e3] text-[#171a18] active:bg-[#deddd8]"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-black">{label}</span>
              {selected && <Check size={16} weight="bold" />}
            </div>
            {body && (
              <p
                className={cn(
                  "mt-1 text-[12px] leading-4",
                  selected ? "text-[#f8faf7]/70" : "text-[#6f6d68]"
                )}
              >
                {body}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

function MultiSelectList({
  values,
  options,
  onChange,
}: {
  values: string[]
  options: readonly (readonly [string, string])[]
  onChange: (values: string[]) => void
}) {
  function toggle(id: string) {
    hapticSelection()
    if (id === "none") {
      onChange(values.includes("none") ? [] : ["none"])
      return
    }
    const withoutNone = values.filter((item) => item !== "none")
    onChange(
      withoutNone.includes(id)
        ? withoutNone.filter((item) => item !== id)
        : [...withoutNone, id]
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([id, label]) => {
        const selected = values.includes(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            aria-pressed={selected}
            className={cn(
              "min-h-11 rounded-[6px] px-3 text-left text-[12.5px] font-black transition-colors",
              selected
                ? "bg-[#171a18] text-[#f8faf7]"
                : "bg-[#e8e7e3] text-[#171a18] active:bg-[#deddd8]"
            )}
          >
            <span className="flex items-center justify-between gap-2">
              {label}
              {selected && <Check size={14} weight="bold" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function OnboardingMobile() {
  const navigate = useSmoothNavigate()
  const saveOnboarding = useMutation(api.users.onboarding.save)
  const saveHealthProfile = useMutation(api.logs.calories.setProfile)
  const saveWeightUnit = useMutation(api.users.users.setWeightUnit)
  const saveWaterGoal = useMutation(api.users.users.setWaterGoal)
  const onboardingProfile = useQuery(api.users.onboarding.get, {})
  const healthProfile = useQuery(api.logs.calories.getProfile, {})
  const preferences = useQuery(api.users.users.getPreferences, {})

  const [initialized, setInitialized] = useState(false)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<OnboardingDraft>({
    age: 25,
    heightCm: 170,
    goal: null,
  })
  const [profile, setProfile] = useState<HealthProfileDraft>({
    sex: null,
    age: 25,
    weightKg: 75,
    heightCm: 170,
    activityLevel: "moderately_active",
    goal: "maintain",
  })
  const [consent, setConsent] = useState<ConsentState>({
    dataUse: false,
    weightData: true,
    foodLogging: true,
    wearableIntegrations: false,
  })
  const [nutritionGoal, setNutritionGoal] = useState<NutritionGoal>("maintain")
  const [safetyFlags, setSafetyFlags] = useState<string[]>(["none"])
  const [weightTrend, setWeightTrend] = useState<WeightTrend>("stable")
  const [occupationActivity, setOccupationActivity] =
    useState<OccupationActivity>("mixed")
  const [dietType, setDietType] = useState<DietType>("omnivore")
  const [allergies, setAllergies] = useState<string[]>(["none"])
  const [cookingSkill, setCookingSkill] = useState<CookingSkill>("intermediate")
  const [budget, setBudget] = useState<Budget>("moderate")
  const [mealFrequency, setMealFrequency] = useState(3)
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("full")
  const [loggingFeatures, setLoggingFeatures] = useState<string[]>([
    "barcode",
    "saved_meals",
  ])
  const [firstNutritionAction, setFirstNutritionAction] =
    useState<FirstNutritionAction>("log_first_meal")
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg")
  const [waterGoalMl, setWaterGoalMl] = useState(2500)
  const [themePreference, setThemePreference] = useState<"light" | "dark">(
    "light"
  )
  const [transitionDirection, setTransitionDirection] = useState<
    "forward" | "back"
  >("forward")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savingRef = useRef(false)

  const calorieGoal = draft.goal
    ? mapOnboardingGoalToCalorieGoal(draft.goal)
    : profile.goal

  const preview = useQuery(
    api.logs.calories.calculate,
    profile.sex
      ? {
          sex: profile.sex,
          age: profile.age,
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          activityLevel: profile.activityLevel,
          goal: calorieGoal,
        }
      : "skip"
  )

  useEffect(() => {
    if (initialized) return
    if (
      onboardingProfile === undefined ||
      healthProfile === undefined ||
      preferences === undefined
    ) {
      return
    }

    const nextGoal = isOnboardingGoal(onboardingProfile?.goal)
      ? onboardingProfile.goal
      : healthProfile?.goal
        ? healthGoalToOnboardingGoal(healthProfile.goal as CalorieGoal)
        : null
    const nextAge = clamp(
      healthProfile?.age ?? onboardingProfile?.age ?? 25,
      AGE_MIN,
      AGE_MAX
    )
    const nextHeight = clamp(
      healthProfile?.heightCm ?? onboardingProfile?.heightCm ?? 170,
      HEIGHT_MIN,
      HEIGHT_MAX
    )
    const nextWeight = clamp(
      healthProfile?.weightKg ?? 75,
      WEIGHT_KG_MIN,
      WEIGHT_KG_MAX
    )
    const nextActivity = isActivityLevel(healthProfile?.activityLevel)
      ? healthProfile.activityLevel
      : "moderately_active"
    const nextUnit =
      preferences?.weightUnit === "lbs" || preferences?.weightUnit === "kg"
        ? preferences.weightUnit
        : "kg"
    const nextNutritionGoal = isNutritionGoal(onboardingProfile?.nutritionGoal)
      ? onboardingProfile.nutritionGoal
      : nextGoal
        ? nextGoal === "lose"
          ? "lose_fat"
          : nextGoal === "build"
            ? "gain_muscle"
            : nextGoal === "performance"
              ? "performance"
              : "maintain"
        : "maintain"
    const nextSafetyFlags =
      Array.isArray(onboardingProfile?.safetyFlags) &&
      onboardingProfile.safetyFlags.length > 0
        ? onboardingProfile.safetyFlags
        : ["none"]

    setDraft({ age: nextAge, heightCm: nextHeight, goal: nextGoal })
    setProfile({
      sex:
        healthProfile?.sex === "male" || healthProfile?.sex === "female"
          ? healthProfile.sex
          : null,
      age: nextAge,
      weightKg: nextWeight,
      heightCm: nextHeight,
      activityLevel: nextActivity,
      goal: nextGoal ? mapOnboardingGoalToCalorieGoal(nextGoal) : "maintain",
    })
    setConsent(
      onboardingProfile?.consent ?? {
        dataUse: false,
        weightData: true,
        foodLogging: true,
        wearableIntegrations: false,
      }
    )
    setNutritionGoal(nextNutritionGoal)
    setSafetyFlags(nextSafetyFlags)
    setWeightTrend(
      isWeightTrend(onboardingProfile?.weightTrend)
        ? onboardingProfile.weightTrend
        : "stable"
    )
    setOccupationActivity(
      isOccupationActivity(onboardingProfile?.occupationActivity)
        ? onboardingProfile.occupationActivity
        : "mixed"
    )
    setDietType(
      isDietType(onboardingProfile?.dietType)
        ? onboardingProfile.dietType
        : "omnivore"
    )
    setAllergies(
      Array.isArray(onboardingProfile?.allergies) &&
        onboardingProfile.allergies.length > 0
        ? onboardingProfile.allergies
        : ["none"]
    )
    setCookingSkill(
      isCookingSkill(onboardingProfile?.cookingSkill)
        ? onboardingProfile.cookingSkill
        : "intermediate"
    )
    setBudget(
      isBudget(onboardingProfile?.budget)
        ? onboardingProfile.budget
        : "moderate"
    )
    setMealFrequency(
      typeof onboardingProfile?.mealFrequency === "number"
        ? clamp(onboardingProfile.mealFrequency, 2, 6)
        : 3
    )
    setTrackingMode(
      isTrackingMode(onboardingProfile?.trackingMode)
        ? onboardingProfile.trackingMode
        : "full"
    )
    setLoggingFeatures(
      Array.isArray(onboardingProfile?.loggingFeatures) &&
        onboardingProfile.loggingFeatures.length > 0
        ? onboardingProfile.loggingFeatures
        : ["barcode", "saved_meals"]
    )
    setFirstNutritionAction(
      isFirstNutritionAction(onboardingProfile?.firstNutritionAction)
        ? onboardingProfile.firstNutritionAction
        : "log_first_meal"
    )
    setWeightUnit(nextUnit)
    setWaterGoalMl(preferences?.waterGoalMl ?? 2500)
    setInitialized(true)
  }, [healthProfile, initialized, onboardingProfile, preferences])

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      age: profile.age,
      heightCm: profile.heightCm,
    }))
  }, [profile.age, profile.heightCm])

  useEffect(() => {
    setProfile((current) => ({ ...current, goal: calorieGoal }))
  }, [calorieGoal])

  const stepReady = useMemo(() => {
    if (step === 1) return consent.dataUse && consent.foodLogging
    if (step === 2) return draft.goal !== null
    if (step === 3) return profile.sex !== null
    if (step === steps.length - 1)
      return draft.goal !== null && profile.sex !== null
    return true
  }, [consent.dataUse, consent.foodLogging, draft.goal, profile.sex, step])

  async function goNext() {
    setError(null)
    hapticMedium()
    if (!stepReady) {
      hapticHeavy()
      setError(
        step === 1
          ? "Allow nutrition data and food logging to personalize setup."
          : step === 3
            ? "Choose sex so OneRep can calculate your first targets."
            : "Complete this step before continuing."
      )
      return
    }
    if (step < steps.length - 1) {
      setTransitionDirection("forward")
      setStep((current) => Math.min(current + 1, steps.length - 1))
      return
    }
    if (!draft.goal || !profile.sex || savingRef.current || saving) return

    hapticHeavy()
    savingRef.current = true
    setSaving(true)
    try {
      await Promise.all([
        saveOnboarding({
          age: profile.age,
          heightCm: profile.heightCm,
          goal: draft.goal,
          nutritionGoal,
          consent,
          safetyFlags: safetyFlags.filter((flag) => flag !== "none"),
          safetyMode: deriveSafetyMode(profile.age, nutritionGoal, safetyFlags),
          weightTrend,
          occupationActivity,
          dietType,
          allergies: allergies.filter((allergy) => allergy !== "none"),
          cookingSkill,
          budget,
          mealFrequency,
          trackingMode,
          loggingFeatures,
          firstNutritionAction,
        }),
        saveHealthProfile({
          sex: profile.sex,
          age: profile.age,
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          activityLevel: profile.activityLevel,
          goal: mapOnboardingGoalToCalorieGoal(draft.goal),
        }),
        saveWeightUnit({ unit: weightUnit }),
        saveWaterGoal({ goalMl: waterGoalMl }),
      ])
      safeLocalStorageRemove(POST_SIGNUP_ONBOARDING_KEY)
      safeLocalStorageSet(THEME_KEY, themePreference)
      safeSessionStorageSet(FIRST_NUTRITION_ACTION_DONE_KEY, "true")
      document.documentElement.classList.toggle(
        "dark",
        themePreference === "dark"
      )
      navigate(firstNutritionActionPath(firstNutritionAction), {
        replace: true,
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save onboarding. Try again."
      )
      savingRef.current = false
      setSaving(false)
    }
  }

  function goBack() {
    hapticTap()
    setError(null)
    setTransitionDirection("back")
    setStep((current) => Math.max(current - 1, 0))
  }

  const meta = steps[step]
  const weightValue =
    weightUnit === "kg"
      ? Math.round(profile.weightKg)
      : kgToLbs(profile.weightKg)
  const weightMin = weightUnit === "kg" ? WEIGHT_KG_MIN : kgToLbs(WEIGHT_KG_MIN)
  const weightMax = weightUnit === "kg" ? WEIGHT_KG_MAX : kgToLbs(WEIGHT_KG_MAX)
  const safetyMode = deriveSafetyMode(profile.age, nutritionGoal, safetyFlags)

  return (
    <main className="auth-light-only min-h-svh overflow-hidden bg-[#f4f3ef] text-[#171a18]">
      <section className="mx-auto flex min-h-svh w-full max-w-md flex-col px-7 pt-[calc(var(--app-safe-top)+10px)] pb-[calc(var(--app-safe-bottom)+14px)]">
        <header className="shrink-0">
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || saving}
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-[6px] text-[#171a18] transition-opacity active:opacity-75 disabled:opacity-20"
            >
              <ArrowLeft size={18} weight="bold" />
            </button>
            <div className="flex items-center justify-center gap-2">
              <img
                src="/app-icon.svg"
                alt=""
                className="h-5 w-5 rounded-full"
              />
              <span className="text-[12px] font-black text-[#171a18]">
                OneRep
              </span>
            </div>
            <span aria-hidden="true" />
          </div>
        </header>

        <div
          key={step}
          className={cn(
            "flex flex-1 flex-col justify-center py-4",
            transitionDirection === "back"
              ? "[animation:onboarding-step-back_260ms_var(--motion-ease-emphasized)_both]"
              : "[animation:onboarding-step-forward_260ms_var(--motion-ease-emphasized)_both]"
          )}
        >
          <OnboardingIllustration step={step} />

          <div className="mt-6 mb-5 text-center">
            <h1 className="text-[1.95rem] leading-[1.08] font-black tracking-tight text-[#171a18]">
              <StepTitle title={meta.title} accent={meta.accent} />
            </h1>
            <p className="mx-auto mt-3 max-w-[19rem] text-[13px] leading-5 text-[#6f6d68]">
              {meta.body}
            </p>
          </div>

          {step === 0 && (
            <div className="rounded-[6px] bg-[#e8e7e3] p-4 text-center">
              <p className="text-[14px] leading-6 font-bold text-[#171a18]">
                OneRep will estimate safe starting targets, then adjust them
                after 7-14 days using food logs, weight trends, workouts,
                hunger, energy, and adherence.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-2">
              {(
                [
                  ["dataUse", "Nutrition personalization"],
                  ["weightData", "Weight trend data"],
                  ["foodLogging", "Food logging"],
                  ["wearableIntegrations", "Wearable integrations"],
                ] as const
              ).map(([id, label]) => {
                const selected = consent[id]
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setConsent((current) => ({
                        ...current,
                        [id]: !current[id],
                      }))
                    }}
                    aria-pressed={selected}
                    className={cn(
                      "min-h-12 rounded-[6px] px-4 text-left text-[14px] font-black transition-colors",
                      selected
                        ? "bg-[#171a18] text-[#f8faf7]"
                        : "bg-[#e8e7e3] text-[#171a18] active:bg-[#deddd8]"
                    )}
                  >
                    <span className="flex items-center justify-between gap-3">
                      {label}
                      {selected && <Check size={16} weight="bold" />}
                    </span>
                  </button>
                )
              })}
              <p className="px-1 text-center text-[12px] leading-5 text-[#6f6d68]">
                Nutrition personalization and food logging are required for this
                setup. Wearables are optional.
              </p>
            </div>
          )}

          {step === 2 && (
            <OptionList
              value={nutritionGoal}
              options={nutritionGoals}
              onChange={(goal) => {
                setNutritionGoal(goal)
                setDraft((current) => ({
                  ...current,
                  goal: nutritionGoalToOnboardingGoal(goal),
                }))
              }}
            />
          )}

          {step === 3 && (
            <PillToggle
              value={profile.sex ?? "female"}
              options={[
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
              ]}
              onChange={(sex: Sex) =>
                setProfile((current) => ({ ...current, sex }))
              }
            />
          )}

          {step === 4 && (
            <NumberQuestion
              label="Age"
              value={profile.age}
              display={String(profile.age)}
              min={AGE_MIN}
              max={AGE_MAX}
              onChange={(age) => setProfile((current) => ({ ...current, age }))}
            />
          )}

          {step === 5 && (
            <div className="space-y-3">
              <MultiSelectList
                values={safetyFlags}
                options={[["none", "None"], ...safetyOptions]}
                onChange={setSafetyFlags}
              />
              <div className="rounded-[6px] bg-[#e8e7e3] p-3 text-center">
                <p className="text-[11px] font-black tracking-[0.14em] text-[#6f6d68] uppercase">
                  Setup mode
                </p>
                <p className="mt-1 text-[14px] font-black text-[#171a18]">
                  {safetyModeLabel(safetyMode)}
                </p>
              </div>
            </div>
          )}

          {step === 6 && (
            <NumberQuestion
              label="Height"
              value={profile.heightCm}
              display={`${profile.heightCm} cm`}
              min={HEIGHT_MIN}
              max={HEIGHT_MAX}
              onChange={(heightCm) =>
                setProfile((current) => ({ ...current, heightCm }))
              }
            />
          )}

          {step === 7 && (
            <NumberQuestion
              label="Weight"
              value={weightValue}
              display={`${weightValue} ${weightUnit}`}
              min={weightMin}
              max={weightMax}
              onChange={(value) =>
                setProfile((current) => ({
                  ...current,
                  weightKg: weightUnit === "kg" ? value : lbsToKg(value),
                }))
              }
            />
          )}

          {step === 8 && (
            <OptionList
              value={weightTrend}
              options={weightTrends}
              onChange={(value) => setWeightTrend(value as WeightTrend)}
            />
          )}

          {step === 9 && (
            <OptionList
              value={profile.activityLevel}
              options={activities}
              onChange={(activityLevel) =>
                setProfile((current) => ({ ...current, activityLevel }))
              }
            />
          )}

          {step === 10 && (
            <OptionList
              value={occupationActivity}
              options={occupationActivities}
              onChange={(value) =>
                setOccupationActivity(value as OccupationActivity)
              }
            />
          )}

          {step === 11 && (
            <OptionList
              value={dietType}
              options={dietTypes}
              onChange={(value) => setDietType(value as DietType)}
            />
          )}

          {step === 12 && (
            <MultiSelectList
              values={allergies}
              options={allergyOptions}
              onChange={setAllergies}
            />
          )}

          {step === 13 && (
            <div className="space-y-3">
              <PillToggle
                value={cookingSkill}
                options={cookingSkills.map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) => setCookingSkill(value as CookingSkill)}
              />
              <PillToggle
                value={budget}
                options={budgets.map(([value, label]) => ({ value, label }))}
                onChange={(value) => setBudget(value as Budget)}
              />
              <NumberQuestion
                label="Meals per day"
                value={mealFrequency}
                display={String(mealFrequency)}
                min={2}
                max={6}
                onChange={setMealFrequency}
              />
            </div>
          )}

          {step === 14 && (
            <PillToggle
              value={weightUnit}
              options={[
                { value: "kg" as const, label: "Kilograms" },
                { value: "lbs" as const, label: "Pounds" },
              ]}
              onChange={(unit) => setWeightUnit(unit)}
            />
          )}

          {step === 15 && (
            <NumberQuestion
              label="Water"
              value={waterGoalMl}
              display={formatLiters(waterGoalMl)}
              min={WATER_MIN}
              max={WATER_MAX}
              step={250}
              onChange={setWaterGoalMl}
            />
          )}

          {step === 16 && (
            <OptionList
              value={trackingMode}
              options={trackingModes}
              onChange={(value) => setTrackingMode(value as TrackingMode)}
            />
          )}

          {step === 17 && (
            <MultiSelectList
              values={loggingFeatures}
              options={loggingFeatureOptions}
              onChange={setLoggingFeatures}
            />
          )}

          {step === 18 && (
            <OptionList
              value={firstNutritionAction}
              options={firstNutritionActions}
              onChange={(value) =>
                setFirstNutritionAction(value as FirstNutritionAction)
              }
            />
          )}

          {step === 19 && (
            <PillToggle
              value={themePreference}
              options={[
                { value: "light" as const, label: "Light" },
                { value: "dark" as const, label: "Dark" },
              ]}
              onChange={(theme) => setThemePreference(theme)}
            />
          )}

          {step === 20 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Calories", preview?.targetCalories ?? "..."],
                  ["Protein", preview ? `${preview.protein}g` : "..."],
                  ["Carbs", preview ? `${preview.carbs}g` : "..."],
                  ["Fat", preview ? `${preview.fat}g` : "..."],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[6px] bg-[#e8e7e3] p-4">
                    <p className="text-[11px] font-black tracking-[0.12em] text-[#6f6d68] uppercase">
                      {label}
                    </p>
                    <p className="mt-2 text-[1.8rem] leading-none font-black tracking-tight text-[#171a18] tabular-nums">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-[6px] bg-[#e8e7e3] p-4">
                {[
                  ["Goal", selectedLabel(nutritionGoals, nutritionGoal)],
                  ["Mode", safetyModeLabel(safetyMode)],
                  ["Activity", selectedActivityLabel(profile.activityLevel)],
                  ["Diet", selectedLabel(dietTypes, dietType)],
                  ["Tracking", selectedLabel(trackingModes, trackingMode)],
                  ["Water", formatLiters(waterGoalMl)],
                  ["Theme", themePreference === "dark" ? "Dark" : "Light"],
                  [
                    "Body",
                    `${profile.age} yrs, ${Math.round(profile.weightKg)} kg`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 border-b border-[#f4f3ef] py-2.5 last:border-0"
                  >
                    <span className="text-[12px] font-semibold text-[#6f6d68]">
                      {label}
                    </span>
                    <span className="min-w-0 truncate text-right text-[13px] font-black text-[#171a18]">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-[6px] border border-[#7b6464]/25 bg-[#7b6464]/10 px-4 py-3 text-[12.5px] font-bold text-[#7b6464]"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="grid shrink-0 gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 || saving}
            className="order-2 min-h-11 rounded-[6px] bg-[#e8e7e3] px-4 text-[13px] font-black text-[#171a18] transition-opacity active:opacity-75 disabled:opacity-35"
          >
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={saving || !stepReady}
            aria-busy={saving}
            className="order-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#171a18] px-5 text-[13px] font-black text-[#f8faf7] transition-transform active:scale-[0.985] disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : step === steps.length - 1
                ? "Finish"
                : "Continue"}
          </button>
        </footer>
      </section>
    </main>
  )
}
