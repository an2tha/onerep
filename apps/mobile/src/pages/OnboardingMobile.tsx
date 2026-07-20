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
  PersonSimpleRun,
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
import { safeLocalStorageRemove } from "@/lib/utils"
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
    id: "goals",
    label: "Goals",
    title: "What are you working toward?",
    body: "Choose a goal and the amount of guidance you want.",
  },
  {
    id: "baseline",
    label: "Baseline",
    title: "Add your baseline",
    body: "These measurements are used to estimate your starting energy needs.",
  },
  {
    id: "activity",
    label: "Activity",
    title: "Describe a typical week",
    body: "Choose the option that best reflects your usual activity, not your best week.",
  },
  {
    id: "safety",
    label: "Health",
    title: "Health considerations",
    body: "Optional. This helps OneRep avoid unsuitable calorie recommendations.",
  },
  {
    id: "review",
    label: "Review",
    title: "Review your starting targets",
    body: "These are estimates, not medical advice. You can change them in Settings.",
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

import {
  MultiSelectList,
  NumberQuestion,
  OptionList,
  PillToggle,
} from "@repo/ui"

export function OnboardingMobile() {
  const navigate = useSmoothNavigate()
  const saveOnboarding = useMutation(api.users.onboarding.save)
  const saveHealthProfile = useMutation(api.logs.calories.setProfile)
  const saveWeightUnit = useMutation(api.users.users.setWeightUnit)
  const saveWaterGoal = useMutation(api.users.users.setWaterGoal)
  const saveDashboardSettings = useMutation(
    api.users.users.setDashboardSettings
  )
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
  const [complete, setComplete] = useState(false)
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
    if (stepId === "goals")
      return draft.goal !== null && experienceLevel !== null
    if (stepId === "baseline") return profile.sex !== null
    if (stepId === "review")
      return (
        draft.goal !== null && experienceLevel !== null && profile.sex !== null
      )
    return true
  }, [draft.goal, experienceLevel, profile.sex, step])

  function transitionToStep(nextStep: number, direction: "forward" | "back") {
    setTransitionDirection(direction)
    setStep(nextStep)
  }

  async function goNext() {
    setError(null)
    hapticMedium()
    if (!stepReady) {
      hapticHeavy()
      setError(
        steps[step].id === "baseline"
          ? "Choose the body profile used for your estimate."
          : "Complete the required choices to continue."
      )
      return
    }
    if (step < steps.length - 1) {
      transitionToStep(Math.min(step + 1, steps.length - 1), "forward")
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
        saveDashboardSettings({
          workoutFocus: "strength",
          simpleMode: experienceLevel === "beginner",
        }),
      ])
      safeLocalStorageRemove(POST_SIGNUP_ONBOARDING_KEY)
      setComplete(true)
      hapticMedium()
      await new Promise((resolve) => window.setTimeout(resolve, 720))
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
    transitionToStep(Math.max(step - 1, 0), "back")
  }

  const meta = steps[step]
  const weightValue =
    weightUnit === "kg"
      ? Math.round(profile.weightKg)
      : kgToLbs(profile.weightKg)
  const weightMin = weightUnit === "kg" ? WEIGHT_KG_MIN : kgToLbs(WEIGHT_KG_MIN)
  const weightMax = weightUnit === "kg" ? WEIGHT_KG_MAX : kgToLbs(WEIGHT_KG_MAX)
  return (
    <main
      className="onboarding-shell min-h-svh bg-background text-foreground"
      data-onboarding-step={step}
    >
      {complete && (
        <div
          className="onboarding-complete"
          role="status"
          aria-live="assertive"
        >
          <span className="onboarding-complete-mark" aria-hidden="true">
            <Check size={30} weight="bold" />
          </span>
          <p>Your plan is ready</p>
        </div>
      )}
      <div className="onboarding-atmosphere" aria-hidden="true" />
      <section className="onboarding-frame">
        <header className="onboarding-header">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img src="/app-icon.svg" alt="" className="size-7" />
              <span className="onboarding-brand-name">OneRep</span>
            </div>
            <span className="onboarding-step-count tabular-nums">
              {step + 1} / {steps.length} · {meta.label}
            </span>
          </div>
          <div
            className="onboarding-progress"
            role="progressbar"
            aria-label="Profile setup progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={step + 1}
          >
            {steps.map((item, index) => (
              <span
                key={item.id}
                className="onboarding-progress-segment"
                data-complete={index <= step}
              />
            ))}
          </div>
        </header>

        <div className="onboarding-stage">
          <div
            key={step}
            className="onboarding-step"
            data-transition-direction={transitionDirection}
          >
            <div className="onboarding-step-intro">
              <h1 className="onboarding-step-title">{meta.title}</h1>
              <p className="onboarding-step-copy">{meta.body}</p>
            </div>

            <div className="onboarding-step-form">
              {meta.id === "goals" && (
                <div className="onboarding-form-stack">
                  <section
                    className="onboarding-question"
                    aria-labelledby="goal-heading"
                  >
                    <h2 id="goal-heading" className="onboarding-question-title">
                      Primary goal
                    </h2>
                    <OptionList
                      onInteract={hapticSelection}
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
                  </section>
                  <section
                    className="onboarding-question"
                    aria-labelledby="experience-heading"
                  >
                    <h2
                      id="experience-heading"
                      className="onboarding-question-title"
                    >
                      Training experience
                    </h2>
                    <OptionList<ExperienceLevel>
                      onInteract={hapticSelection}
                      value={experienceLevel}
                      options={experienceLevels}
                      onChange={setExperienceLevel}
                    />
                  </section>
                </div>
              )}

              {meta.id === "baseline" && (
                <div className="onboarding-form-stack">
                  <section
                    className="onboarding-question"
                    aria-labelledby="body-profile-heading"
                  >
                    <h2
                      id="body-profile-heading"
                      className="onboarding-question-title"
                    >
                      Body profile used for the estimate
                    </h2>
                    <PillToggle
                      onInteract={hapticSelection}
                      value={profile.sex}
                      options={[
                        {
                          value: "female",
                          label: "Female",
                          icon: GenderFemale,
                        },
                        { value: "male", label: "Male", icon: GenderMale },
                      ]}
                      onChange={(sex: Sex) =>
                        setProfile((current) => ({ ...current, sex }))
                      }
                    />
                  </section>
                  <section
                    className="onboarding-question"
                    aria-labelledby="measurements-heading"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h2
                        id="measurements-heading"
                        className="onboarding-question-title mb-0"
                      >
                        Measurements
                      </h2>
                      <button
                        type="button"
                        onClick={() =>
                          setWeightUnit((current) =>
                            current === "kg" ? "lbs" : "kg"
                          )
                        }
                        className="onboarding-unit-button"
                        aria-label={`Use ${weightUnit === "kg" ? "pounds" : "kilograms"}`}
                      >
                        {weightUnit === "kg" ? "kg" : "lb"}
                      </button>
                    </div>
                    <div className="onboarding-number-list">
                      <NumberQuestion
                        onInteract={hapticSelection}
                        label="Age"
                        value={profile.age}
                        display={`${profile.age} years`}
                        min={AGE_MIN}
                        max={AGE_MAX}
                        onChange={(age) =>
                          setProfile((current) => ({ ...current, age }))
                        }
                      />
                      <NumberQuestion
                        onInteract={hapticSelection}
                        label="Height (cm)"
                        value={profile.heightCm}
                        display={`${profile.heightCm} cm`}
                        min={HEIGHT_MIN}
                        max={HEIGHT_MAX}
                        onChange={(heightCm) =>
                          setProfile((current) => ({ ...current, heightCm }))
                        }
                      />
                      <NumberQuestion
                        onInteract={hapticSelection}
                        label={`Weight (${weightUnit})`}
                        value={weightValue}
                        display={`${weightValue} ${weightUnit}`}
                        min={weightMin}
                        max={weightMax}
                        onChange={(value) =>
                          setProfile((current) => ({
                            ...current,
                            weightKg:
                              weightUnit === "kg" ? value : lbsToKg(value),
                          }))
                        }
                      />
                    </div>
                  </section>
                </div>
              )}

              {meta.id === "safety" && (
                <MultiSelectList
                  onInteract={hapticSelection}
                  values={safetyFlags}
                  options={[["none", "None"], ...safetyOptions]}
                  onChange={setSafetyFlags}
                  icon={ShieldCheck}
                />
              )}

              {meta.id === "activity" && (
                <OptionList
                  onInteract={hapticSelection}
                  value={profile.activityLevel}
                  options={activities}
                  onChange={(activityLevel) =>
                    setProfile((current) => ({ ...current, activityLevel }))
                  }
                />
              )}

              {meta.id === "review" && (
                <div className="onboarding-form-stack">
                  <section
                    className="onboarding-question"
                    aria-labelledby="starting-targets-heading"
                  >
                    <h2
                      id="starting-targets-heading"
                      className="onboarding-question-title"
                    >
                      Starting daily targets
                    </h2>
                    <div className="onboarding-review-card">
                      <div className="onboarding-review-hero">
                        <p className="native-supporting">Calories</p>
                        <p className="native-summary-value mt-1 tabular-nums">
                          {preview?.targetCalories?.toLocaleString() ??
                            "Calculating…"}
                          {preview ? " kcal" : ""}
                        </p>
                        <p className="native-row-detail mt-2">
                          {preview?.calorieStrategy ??
                            "Calculating your starting budget from the information above."}
                        </p>
                      </div>
                      {[
                        [
                          "Maintenance estimate",
                          preview
                            ? `${preview.tdee.toLocaleString()} kcal`
                            : "—",
                        ],
                        ["Protein", preview ? `${preview.protein} g` : "—"],
                        ["Carbohydrates", preview ? `${preview.carbs} g` : "—"],
                        ["Fat", preview ? `${preview.fat} g` : "—"],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="flex min-h-12 items-center justify-between gap-4 border-t border-border py-2"
                        >
                          <span className="native-row-title">{label}</span>
                          <span className="native-row-value text-right">
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section
                    className="onboarding-question"
                    aria-labelledby="estimate-inputs-heading"
                  >
                    <h2
                      id="estimate-inputs-heading"
                      className="onboarding-question-title"
                    >
                      Estimate inputs
                    </h2>
                    <dl className="onboarding-review-card divide-y divide-border">
                      {[
                        ["Goal", selectedLabel(nutritionGoals, nutritionGoal)],
                        [
                          "Experience",
                          experienceLevel
                            ? selectedLabel(experienceLevels, experienceLevel)
                            : "Not selected",
                        ],
                        [
                          "Activity",
                          selectedActivityLabel(profile.activityLevel),
                        ],
                        [
                          "Body",
                          `${profile.age} years, ${Math.round(profile.weightKg)} kg`,
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="flex min-h-12 items-center justify-between gap-4 py-2"
                        >
                          <dt className="native-row-title">{label}</dt>
                          <dd className="native-row-value text-right">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="mt-5 border-l-2 border-destructive py-2 pl-3 text-[14px] font-medium text-destructive"
                >
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="onboarding-footer">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 || saving}
            className="onboarding-back-button"
          >
            <ArrowLeft size={15} weight="bold" />
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={saving}
            aria-busy={saving}
            className="onboarding-primary-button"
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
