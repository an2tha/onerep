import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Barbell,
  Check,
  GenderFemale,
  GenderMale,
  Heart,
  Lightning,
  Minus,
  PersonSimpleRun,
  Plus,
  Scales,
  ShieldCheck,
  Trophy,
  TrendDown,
  type Icon,
} from "@phosphor-icons/react"
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
import { cn, safeLocalStorageRemove } from "@/lib/utils"
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
const POST_SIGNUP_ONBOARDING_KEY = "onerep:post-signup-onboarding"

const activities = [
  ["sedentary", "Sedentary", "Mostly seated", PersonSimpleRun],
  ["lightly_active", "Light", "A few active days", PersonSimpleRun],
  ["moderately_active", "Moderate", "Active most weeks", PersonSimpleRun],
  ["very_active", "Very active", "Training most days", PersonSimpleRun],
  ["extra_active", "Athlete", "High training load", PersonSimpleRun],
] satisfies [ActivityLevel, string, string, Icon][]

type NutritionGoal =
  | "maintain"
  | "lose_fat"
  | "gain_muscle"
  | "performance"
  | "macros_only"
  | "medical"
type SafetyMode = "standard" | "habit" | "clinician" | "recovery"
type ExperienceLevel = "beginner" | "intermediate" | "advanced"
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
  ["lose_fat", "Lose fat", "Steady, sustainable deficit", TrendDown],
  ["gain_muscle", "Build muscle", "More fuel and protein", Barbell],
  ["maintain", "Stay healthy", "Maintain and build consistency", Heart],
] satisfies [NutritionGoal, string, string, Icon][]

const experienceLevels = [
  ["beginner", "New to this", "Keep setup simple", Heart],
  ["intermediate", "Some experience", "I know the basics", Lightning],
  ["advanced", "Very experienced", "Give me full control", Trophy],
] satisfies [ExperienceLevel, string, string, Icon][]

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

const firstNutritionActions = [
  ["log_first_meal", "Log first meal"],
  ["build_template", "Build a meal template"],
  ["tomorrow_plan", "Plan tomorrow"],
  ["import_yesterday", "Import yesterday"],
  ["skip_habit", "Start habit mode"],
] satisfies [FirstNutritionAction, string][]

const steps = [
  {
    id: "goal",
    label: "Goal",
    title: "What's your goal?",
    accent: "goal",
    body: "Pick the closest match.",
    image: "/onboarding/sprinting.svg",
  },
  {
    id: "experience",
    label: "Experience",
    title: "Your experience",
    accent: "experience",
    body: "We'll match the level of guidance.",
    image: "/onboarding/unboxing.svg",
  },
  {
    id: "profile",
    label: "Body",
    title: "Choose a profile",
    accent: "profile",
    body: "Used only for estimates.",
    image: "/onboarding/reading.svg",
  },
  {
    id: "age",
    label: "Age",
    title: "Your age",
    accent: "age",
    body: "Helps estimate your baseline.",
    image: "/onboarding/sit-reading.svg",
  },
  {
    id: "safety",
    label: "Safety",
    title: "Anything we should know?",
    accent: "know",
    body: "Select any that apply.",
    image: "/onboarding/sleek.svg",
  },
  {
    id: "height",
    label: "Height",
    title: "Your height",
    accent: "height",
    body: "Used for calorie estimates.",
    image: "/onboarding/rolling.svg",
  },
  {
    id: "weight",
    label: "Weight",
    title: "Your weight",
    accent: "weight",
    body: "Your current best estimate.",
    image: "/onboarding/petting.svg",
  },
  {
    id: "activity",
    label: "Activity",
    title: "Your activity",
    accent: "activity",
    body: "Choose a typical week.",
    image: "/onboarding/running.svg",
  },
  {
    id: "review",
    label: "Review",
    title: "You're ready",
    accent: "ready",
    body: "Adjust anything later in Settings.",
    image: "/onboarding/ballet.svg",
  },
] as const

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function kgToLbs(kg: number) {
  return Math.round(kg * 2.20462)
}

function lbsToKg(lbs: number) {
  return Math.round((lbs / 2.20462) * 10) / 10
}

function selectedActivityLabel(activity: ActivityLevel) {
  return activities.find(([id]) => id === activity)?.[1] ?? "Moderate"
}

function selectedLabel<T extends string>(
  options: readonly (readonly [T, string, ...unknown[]])[],
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

function isExperienceLevel(value: unknown): value is ExperienceLevel {
  return experienceLevels.some(([id]) => id === value)
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

function OnboardingIllustration({ step }: { step: number }) {
  return (
    <div className="mx-auto flex h-[165px] w-full items-end justify-center pt-2 short-phone:h-[115px]">
      <img
        src={steps[step].image}
        alt=""
        className="h-full max-h-[160px] w-full max-w-[15rem] object-contain short-phone:max-h-[110px]"
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
  value: T | null
  options: { value: T; label: string; icon?: Icon }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2">
      {options.map((option) => {
        const selected = value === option.value
        const OptionIcon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              hapticSelection()
              onChange(option.value)
            }}
            className={cn(
              "flex min-h-12 items-center justify-center gap-2 rounded-[6px] px-4 text-[14px] font-black transition-colors",
              selected
                ? "bg-[#171a18] text-[#f8faf7]"
                : "bg-[#e8e7e3] text-[#171a18] active:bg-[#deddd8]"
            )}
          >
            {OptionIcon && <OptionIcon size={17} weight="bold" />}
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
  value: T | null
  options: readonly (readonly [T, string, string?, Icon?])[]
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2">
      {options.map(([id, label, body, icon]) => {
        const selected = value === id
        const OptionIcon = icon
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
              <span className="flex items-center gap-3 text-[14px] font-black">
                {OptionIcon && <OptionIcon size={18} weight="bold" />}
                {label}
              </span>
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
  icon: SharedIcon,
}: {
  values: string[]
  options: readonly (readonly [string, string])[]
  onChange: (values: string[]) => void
  icon?: Icon
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
              <span className="flex items-center gap-2">
                {SharedIcon && <SharedIcon size={15} weight="bold" />}
                {label}
              </span>
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
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel | null>(null)
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
          nutritionGoal,
          safetyMode: deriveSafetyMode(profile.age, nutritionGoal, safetyFlags),
          weightTrend,
          occupationActivity,
          trackingMode,
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
    setExperienceLevel(
      isExperienceLevel(onboardingProfile?.experienceLevel)
        ? onboardingProfile.experienceLevel
        : null
    )
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
    const stepId = steps[step].id
    if (stepId === "goal") return draft.goal !== null
    if (stepId === "experience") return experienceLevel !== null
    if (stepId === "profile") return profile.sex !== null
    if (stepId === "review")
      return (
        draft.goal !== null && experienceLevel !== null && profile.sex !== null
      )
    return true
  }, [draft.goal, experienceLevel, profile.sex, step])

  async function goNext() {
    setError(null)
    hapticMedium()
    if (!stepReady) {
      hapticHeavy()
      setError(
        steps[step].id === "profile"
          ? "Choose a profile for the estimate."
          : "Choose an option to continue."
      )
      return
    }
    if (step < steps.length - 1) {
      setTransitionDirection("forward")
      setStep((current) => Math.min(current + 1, steps.length - 1))
      return
    }
    if (
      !draft.goal ||
      !experienceLevel ||
      !profile.sex ||
      savingRef.current ||
      saving
    )
      return

    hapticHeavy()
    savingRef.current = true
    setSaving(true)
    try {
      await Promise.all([
        saveOnboarding({
          age: profile.age,
          heightCm: profile.heightCm,
          goal: draft.goal,
          experienceLevel,
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
      navigate(experienceLevel === "beginner" ? "/coach?setup=beginner" : "/", {
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
          <div
            className="mt-3 flex items-center gap-3"
            aria-label={`Step ${step + 1} of ${steps.length}`}
          >
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#deddd8]">
              <div
                className="h-full rounded-full bg-[#58cc02] transition-[width] duration-300"
                style={{ width: `${((step + 1) / steps.length) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-black text-[#6f6d68] tabular-nums">
              {step + 1}/{steps.length}
            </span>
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

          <div className="mt-4 mb-4 text-center">
            <h1 className="text-[1.95rem] leading-[1.08] font-black tracking-tight text-[#171a18]">
              <StepTitle title={meta.title} accent={meta.accent} />
            </h1>
            <p className="mx-auto mt-2 max-w-[19rem] text-[12.5px] leading-5 text-[#6f6d68]">
              {meta.body}
            </p>
          </div>

          {meta.id === "goal" && (
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

          {meta.id === "experience" && (
            <OptionList<ExperienceLevel>
              value={experienceLevel}
              options={experienceLevels}
              onChange={setExperienceLevel}
            />
          )}

          {meta.id === "profile" && (
            <PillToggle
              value={profile.sex ?? "female"}
              options={[
                { value: "female", label: "Female", icon: GenderFemale },
                { value: "male", label: "Male", icon: GenderMale },
              ]}
              onChange={(sex: Sex) =>
                setProfile((current) => ({ ...current, sex }))
              }
            />
          )}

          {meta.id === "age" && (
            <NumberQuestion
              label="Age"
              value={profile.age}
              display={String(profile.age)}
              min={AGE_MIN}
              max={AGE_MAX}
              onChange={(age) => setProfile((current) => ({ ...current, age }))}
            />
          )}

          {meta.id === "safety" && (
            <MultiSelectList
              values={safetyFlags}
              options={[["none", "None"], ...safetyOptions]}
              onChange={setSafetyFlags}
              icon={ShieldCheck}
            />
          )}

          {meta.id === "height" && (
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

          {meta.id === "weight" && (
            <div className="space-y-2">
              <PillToggle
                value={weightUnit}
                options={[
                  { value: "kg" as const, label: "Kilograms", icon: Scales },
                  { value: "lbs" as const, label: "Pounds", icon: Scales },
                ]}
                onChange={(unit) => setWeightUnit(unit)}
              />
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
            </div>
          )}

          {meta.id === "activity" && (
            <OptionList
              value={profile.activityLevel}
              options={activities}
              onChange={(activityLevel) =>
                setProfile((current) => ({ ...current, activityLevel }))
              }
            />
          )}

          {meta.id === "review" && (
            <div className="space-y-3">
              <div className="rounded-[6px] bg-[#171a18] p-4 text-[#f8faf7]">
                <p className="text-[10px] font-black tracking-[0.14em] text-[#f8faf7]/55 uppercase">
                  Daily calorie budget
                </p>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                  <div>
                    <p className="text-[10px] font-bold text-[#f8faf7]/55">
                      Maintain
                    </p>
                    <p className="mt-1 text-[16px] font-black tabular-nums">
                      {preview?.tdee ?? "..."}
                    </p>
                  </div>
                  <span className="text-[#f8faf7]/35">−</span>
                  <div>
                    <p className="text-[10px] font-bold text-[#f8faf7]/55">
                      Deficit
                    </p>
                    <p className="mt-1 text-[16px] font-black tabular-nums">
                      {preview
                        ? Math.max(0, preview.tdee - preview.targetCalories)
                        : "..."}
                    </p>
                  </div>
                  <span className="text-[#f8faf7]/35">=</span>
                  <div>
                    <p className="text-[10px] font-bold text-[#f8faf7]/55">
                      Budget
                    </p>
                    <p className="mt-1 text-[16px] font-black tabular-nums">
                      {preview?.targetCalories ?? "..."}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-center text-[10px] font-bold text-[#f8faf7]/55">
                  {preview?.calorieStrategy ??
                    "Calculating your starting budget..."}
                </p>
              </div>
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
                  [
                    "Experience",
                    experienceLevel
                      ? selectedLabel(experienceLevels, experienceLevel)
                      : "Not selected",
                  ],
                  ["Activity", selectedActivityLabel(profile.activityLevel)],
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
            className="order-2 flex min-h-11 items-center justify-center gap-2 rounded-[6px] bg-[#e8e7e3] px-4 text-[13px] font-black text-[#171a18] transition-opacity active:opacity-75 disabled:opacity-35"
          >
            <ArrowLeft size={15} weight="bold" />
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={saving || !stepReady}
            aria-busy={saving}
            className="order-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#171a18] px-5 text-[13px] font-black text-[#f8faf7] transition-transform active:scale-[0.985] disabled:opacity-50"
          >
            {saving ? (
              "Saving..."
            ) : step === steps.length - 1 ? (
              <>
                Finish
                <Check size={16} weight="bold" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={16} weight="bold" />
              </>
            )}
          </button>
        </footer>
      </section>
    </main>
  )
}
