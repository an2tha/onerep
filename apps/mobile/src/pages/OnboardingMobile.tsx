import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router"
import {
  ArrowRight,
  Barbell,
  Check,
  GenderFemale,
  GenderMale,
  Heart,
  Lightning,
  PaperPlaneTilt,
  PencilSimple,
  PersonSimpleRun,
  ShieldCheck,
  Trophy,
  TrendDown,
  type Icon,
} from "@phosphor-icons/react"
import { useAction, useMutation, useQuery } from "convex/react"
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
import { useCoachContext } from "@/lib/coach-context"
import {
  CoachArtifacts,
  CoachAttachButton,
  CoachAttachmentInput,
  CoachAttachmentPreview,
  CoachOperationResults,
  CoachProposal,
  CoachUiBlocks,
  ThinkingIndicator,
  useCoachAttachment,
  normalizeCoachArtifacts,
  normalizeCoachOperations,
  normalizeCoachUiBlocks,
  recipeTotals,
  validateCoachOperations,
  type CoachMessage,
  type CoachOperation,
  type CoachOperationResult,
  type CoachUiAction,
} from "@/lib/coach-chat"
import { currentDateKey, detectTimeZone } from "@/lib/food-log"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  createClientId,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/lib/utils"
import { toast } from "@repo/ui"
import type { Id } from "../../../../convex/_generated/dataModel"
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
const COACH_ONBOARDING_SEEN_KEY = "onerep:coach-onboarding-seen"
const WALKTHROUGH_WELCOME_PENDING_KEY = "onerep:walkthrough-welcome-pending"

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function kgToLbs(kg: number) {
  return Math.round(kg * 2.20462)
}

function lbsToKg(lbs: number) {
  return Math.round((lbs / 2.20462) * 10) / 10
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

import { MultiSelectList, NumberQuestion } from "@repo/ui"

function CoachFeatureMockups() {
  return (
    <div className="onboarding-coach-showcase" aria-label="Coach capabilities">
      <article className="onboarding-coach-glass" data-mockup="card">
        <div className="onboarding-coach-copy">
          <p className="onboarding-coach-kicker">Interactive cards</p>
          <h2>Adjust before you log</h2>
          <p>
            Coach can generate controls, quantities, choices, and safe actions.
          </p>
        </div>
        <svg
          viewBox="0 0 320 150"
          className="onboarding-coach-svg"
          role="img"
          aria-label="Animated meal logging card with quantity controls"
        >
          <g className="onboarding-svg-card">
            <rect
              x="18"
              y="16"
              width="284"
              height="118"
              rx="18"
              className="onboarding-svg-surface"
            />
            <text x="36" y="42" className="onboarding-svg-eyebrow">
              QUICK MEAL
            </text>
            <text x="36" y="65" className="onboarding-svg-title">
              Chicken rice bowl
            </text>
            <text x="36" y="88" className="onboarding-svg-value">
              520
            </text>
            <text x="76" y="88" className="onboarding-svg-unit">
              kcal
            </text>
            <g className="onboarding-svg-stepper">
              <rect
                x="194"
                y="69"
                width="88"
                height="34"
                rx="10"
                className="onboarding-svg-control"
              />
              <path
                d="M210 86h8M258 86h8M262 82v8"
                className="onboarding-svg-line"
              />
              <text
                x="235"
                y="90"
                textAnchor="middle"
                className="onboarding-svg-control-text"
              >
                1
              </text>
            </g>
            <rect
              x="36"
              y="108"
              width="104"
              height="8"
              rx="4"
              className="onboarding-svg-muted"
            />
            <rect
              x="148"
              y="108"
              width="67"
              height="8"
              rx="4"
              className="onboarding-svg-muted onboarding-svg-muted-delay"
            />
          </g>
        </svg>
      </article>

      <article className="onboarding-coach-glass" data-mockup="widget">
        <div className="onboarding-coach-copy">
          <p className="onboarding-coach-kicker">Dashboard widgets</p>
          <h2>Keep only what earns space</h2>
          <p>
            Preview a compact widget, then decide whether it belongs on Today.
          </p>
        </div>
        <svg
          viewBox="0 0 320 150"
          className="onboarding-coach-svg"
          role="img"
          aria-label="Animated compact caffeine dashboard widget"
        >
          <g className="onboarding-svg-widget">
            <rect
              x="22"
              y="24"
              width="276"
              height="102"
              rx="16"
              className="onboarding-svg-surface"
            />
            <rect
              x="22"
              y="24"
              width="3"
              height="102"
              rx="1.5"
              className="onboarding-svg-accent"
            />
            <text x="40" y="49" className="onboarding-svg-eyebrow">
              CAFFEINE TODAY
            </text>
            <text
              x="40"
              y="83"
              className="onboarding-svg-value onboarding-svg-value-large"
            >
              190
            </text>
            <text x="93" y="83" className="onboarding-svg-unit">
              mg
            </text>
            <g className="onboarding-svg-counter">
              <rect
                x="211"
                y="62"
                width="64"
                height="32"
                rx="9"
                className="onboarding-svg-control"
              />
              <path
                d="M222 78h8M256 78h8M260 74v8"
                className="onboarding-svg-line"
              />
            </g>
            <rect
              x="40"
              y="102"
              width="145"
              height="5"
              rx="2.5"
              className="onboarding-svg-track"
            />
            <rect
              x="40"
              y="102"
              width="69"
              height="5"
              rx="2.5"
              className="onboarding-svg-progress"
            />
          </g>
        </svg>
      </article>

      <article className="onboarding-coach-glass" data-mockup="followup">
        <div className="onboarding-coach-copy">
          <p className="onboarding-coach-kicker">Smart follow-ups</p>
          <h2>Extend the useful signal</h2>
          <p>
            Coach can suggest a related view without adding anything silently.
          </p>
        </div>
        <svg
          viewBox="0 0 320 150"
          className="onboarding-coach-svg"
          role="img"
          aria-label="Animated estimated caffeine decay chart"
        >
          <g className="onboarding-svg-followup">
            <rect
              x="22"
              y="21"
              width="276"
              height="108"
              rx="16"
              className="onboarding-svg-surface"
            />
            <text x="40" y="47" className="onboarding-svg-eyebrow">
              ESTIMATED DECAY · 5H HALF-LIFE
            </text>
            <path d="M42 107H278" className="onboarding-svg-axis" />
            <path
              d="M42 65C77 68 94 78 123 84S180 96 278 105"
              className="onboarding-svg-curve"
            />
            <circle cx="42" cy="65" r="4" className="onboarding-svg-dot" />
            <circle
              cx="123"
              cy="84"
              r="3"
              className="onboarding-svg-dot onboarding-svg-dot-two"
            />
            <text x="40" y="121" className="onboarding-svg-caption">
              now
            </text>
            <text x="255" y="121" className="onboarding-svg-caption">
              12h
            </text>
          </g>
        </svg>
      </article>
    </div>
  )
}

type StageId =
  | "intro"
  | "goal"
  | "experience"
  | "coach"
  | "sex"
  | "measurements"
  | "activity"
  | "safety"
  | "assistant"
  | "review"

const stages = [
  { id: "intro", label: "Welcome" },
  { id: "goal", label: "Goals" },
  { id: "experience", label: "Experience" },
  { id: "coach", label: "Coach" },
  { id: "sex", label: "Baseline" },
  { id: "measurements", label: "Baseline" },
  { id: "activity", label: "Activity" },
  { id: "safety", label: "Health" },
  { id: "assistant", label: "Coach setup" },
  { id: "review", label: "Review" },
] as const satisfies readonly { id: StageId; label: string }[]

const SETUP_MESSAGE_LIMIT = 5

const SETUP_STARTERS = [
  "Build me a 3-day full-body routine and put it on my week",
  "Set up a 6-day push/pull/legs split",
  "Give me a high-protein dinner recipe I can repeat",
  "Set me a 4-week goal I can actually hit",
  "Add a daily water tracker to Progress",
] as const

const SETUP_DESTINATIONS: Record<CoachUiAction, string> = {
  open_nutrition: "/nutrition",
  log_food: "/nutrition",
  open_workouts: "/workouts",
  open_workout_builder: "/workouts",
  open_progress: "/progress",
  open_recipe_builder: "/foods/recipes",
  open_settings: "/settings",
}

const SETUP_DESTINATION_LABELS: Record<CoachUiAction, string> = {
  open_nutrition: "Nutrition",
  log_food: "Nutrition",
  open_workouts: "Workouts",
  open_workout_builder: "Workouts",
  open_progress: "Progress",
  open_recipe_builder: "Recipes",
  open_settings: "Settings",
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function TypewriterText({
  text,
  onDone,
}: {
  text: string
  onDone: () => void
}) {
  const [visibleChars, setVisibleChars] = useState(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    setVisibleChars(0)
    if (prefersReducedMotion()) {
      setVisibleChars(text.length)
      return
    }
    const timer = window.setInterval(() => {
      setVisibleChars((current) => {
        const next = current + 2
        if (next >= text.length) {
          window.clearInterval(timer)
          return text.length
        }
        return next
      })
    }, 18)
    return () => window.clearInterval(timer)
  }, [text])

  useEffect(() => {
    if (visibleChars >= text.length) onDoneRef.current()
  }, [text.length, visibleChars])

  return <span aria-label={text}>{text.slice(0, visibleChars)}</span>
}

function QuickReplies<T extends string>({
  options,
  value,
  onChoose,
}: {
  options: readonly { value: T; label: string; icon?: Icon; hint?: string }[]
  value?: T | null
  onChoose: (value: T) => void
}) {
  return (
    <div className="onboarding-chat-replies" role="group">
      {options.map((option) => {
        const selected = value === option.value
        const OptionIcon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            data-selected={selected}
            className="onboarding-chat-chip"
            onClick={() => {
              hapticSelection()
              onChoose(option.value)
            }}
          >
            {OptionIcon && <OptionIcon size={17} weight="regular" />}
            <span>
              {option.label}
              {option.hint && (
                <span className="onboarding-chat-chip-hint">{option.hint}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function OnboardingMobile() {
  const navigate = useSmoothNavigate()
  const location = useLocation()
  const coachReplay =
    new URLSearchParams(location.search).get("replay") === "coach"
  const coachStageIndex = stages.findIndex((item) => item.id === "coach")
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
  const generateChat = useAction(
    api.ai.metricGeneration.generateCoachChatMessage
  )
  const applyCoachOperations = useAction(api.ai.coachOperations.applyApproved)
  const addFoodEntry = useMutation(api.logs.foodLogs.addEntry)
  const recordCoachAction = useMutation(api.ai.coachState.recordAction)
  const undoCoachAction = useMutation(api.ai.coachState.undoAction)
  const saveCoachGoal = useMutation(api.ai.coachGoals.save)
  const setCoachGoalPinned = useMutation(api.ai.coachGoals.setPinned)
  const setDashboardWidgetPinned = useMutation(api.dashboardWidgets.setPinned)
  const { context: coachContext } = useCoachContext()

  const [initialized, setInitialized] = useState(false)
  const [stage, setStage] = useState(() => (coachReplay ? coachStageIndex : 0))
  const [typing, setTyping] = useState(true)
  const [typedCount, setTypedCount] = useState(0)
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
  const [nutritionGoal, setNutritionGoal] = useState<NutritionGoal | null>(null)
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel | null>(null)
  const [safetyFlags, setSafetyFlags] = useState<string[]>(["none"])
  const [weightTrend] = useState<WeightTrend>("stable")
  const [occupationActivity] = useState<OccupationActivity>("mixed")
  const [dietType] = useState<DietType>("omnivore")
  const [allergies] = useState<string[]>(["none"])
  const [cookingSkill] = useState<CookingSkill>("intermediate")
  const [budget] = useState<Budget>("moderate")
  const [mealFrequency] = useState(3)
  const [trackingMode] = useState<TrackingMode>("full")
  const [loggingFeatures] = useState<string[]>(["barcode", "saved_meals"])
  const [firstNutritionAction] =
    useState<FirstNutritionAction>("log_first_meal")
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg")
  const [waterGoalMl, setWaterGoalMl] = useState(2500)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setupMessages, setSetupMessages] = useState<CoachMessage[]>([])
  const [setupInput, setSetupInput] = useState("")
  const [setupBusy, setSetupBusy] = useState(false)
  const [setupUsed, setSetupUsed] = useState(0)
  const [applyingMessageIndex, setApplyingMessageIndex] = useState<
    number | null
  >(null)
  const [setupDestination, setSetupDestination] = useState<string | null>(null)
  const {
    attachment: setupAttachment,
    attachmentRef: setupAttachmentRef,
    fileInputRef: setupFileInputRef,
    attachImage: attachSetupImage,
    clearAttachment: clearSetupAttachment,
    openImagePicker: openSetupImagePicker,
  } = useCoachAttachment()
  const savingRef = useRef(false)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const effectiveNutritionGoal = nutritionGoal ?? "maintain"
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
          nutritionGoal: effectiveNutritionGoal,
          safetyMode: deriveSafetyMode(
            profile.age,
            effectiveNutritionGoal,
            safetyFlags
          ),
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
    setNutritionGoal(
      isNutritionGoal(onboardingProfile?.nutritionGoal)
        ? onboardingProfile.nutritionGoal
        : null
    )
    setExperienceLevel(
      isExperienceLevel(onboardingProfile?.experienceLevel)
        ? onboardingProfile.experienceLevel
        : null
    )
    setSafetyFlags(
      Array.isArray(onboardingProfile?.safetyFlags) &&
        onboardingProfile.safetyFlags.length > 0
        ? onboardingProfile.safetyFlags
        : ["none"]
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

  useEffect(() => {
    setTyping(true)
    setTypedCount(0)
    const timer = window.setTimeout(() => setTyping(false), 520)
    return () => window.clearTimeout(timer)
  }, [stage])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [
    stage,
    typing,
    typedCount,
    error,
    preview?.targetCalories,
    setupMessages.length,
    setupBusy,
  ])

  const todayKey = currentDateKey(detectTimeZone())

  // The profile is not persisted until the review stage, so the Coach setup
  // stage runs against the in-progress draft rather than an empty account.
  const setupCoachContext = useMemo(
    () => ({
      ...coachContext,
      goal: preview?.calorieStrategy ?? calorieGoal,
      experienceLevel,
      safetyMode: deriveSafetyMode(
        profile.age,
        effectiveNutritionGoal,
        safetyFlags
      ),
      safetyFlags: safetyFlags.filter((flag) => flag !== "none"),
      nutritionGuidance: preview?.guidance ?? coachContext.nutritionGuidance,
      calorieTarget: preview?.targetCalories ?? coachContext.calorieTarget,
      proteinTarget: preview?.protein ?? coachContext.proteinTarget,
    }),
    [
      calorieGoal,
      coachContext,
      effectiveNutritionGoal,
      experienceLevel,
      preview,
      profile.age,
      safetyFlags,
    ]
  )

  const weightValue =
    weightUnit === "kg"
      ? Math.round(profile.weightKg)
      : kgToLbs(profile.weightKg)
  const weightMin = weightUnit === "kg" ? WEIGHT_KG_MIN : kgToLbs(WEIGHT_KG_MIN)
  const weightMax = weightUnit === "kg" ? WEIGHT_KG_MAX : kgToLbs(WEIGHT_KG_MAX)

  const coachMessages = [
    "One more thing before your numbers — meet Coach, the part of OneRep you talk to.",
    "Coach turns a conversation into interactive cards, compact dashboard widgets, and useful follow-ups. Nothing gets added silently.",
  ]

  const stageMessages: Record<StageId, string[]> = {
    intro: [
      "Hi, I'm your OneRep coach.",
      "I'll set up your training and nutrition targets in about a minute — just a quick chat, no forms.",
    ],
    goal: ["First things first: what are you working toward?"],
    experience: [
      "Good choice. How much experience do you have with training and tracking?",
    ],
    coach: coachMessages,
    sex: [
      "Now let's estimate your energy needs.",
      "Which option suits you best?",
    ],
    measurements: [
      "And your measurements — I use these to calculate your starting calorie budget.",
    ],
    activity: [
      "How active is a typical week for you? Pick your usual, not your best week.",
    ],
    safety: [
      "Almost done. Do any of these health considerations apply to you?",
      "This is optional — it helps me avoid unsuitable calorie recommendations.",
    ],
    assistant: [
      "Want a head start? I can build it now — routines and presets on your week, recipes, goals, progress trackers, or your first logged meal.",
      "Tell me what you want in your own words, or send a photo of your fridge, a menu, or a plan you already follow. You have 5 messages, and nothing gets saved without you seeing it first.",
    ],
    review: [
      "That's everything I need. Here are your starting daily targets — estimates, not medical advice. You can change them any time in Settings.",
    ],
  }

  const stageAnswers: Partial<Record<StageId, string>> = {
    intro: "Let's go",
    goal: nutritionGoal
      ? selectedLabel(nutritionGoals, nutritionGoal)
      : undefined,
    experience: experienceLevel
      ? selectedLabel(experienceLevels, experienceLevel)
      : undefined,
    coach: "Sounds good",
    sex: profile.sex ? (profile.sex === "male" ? "Male" : "Female") : undefined,
    measurements: `${profile.age} yrs · ${profile.heightCm} cm · ${weightValue} ${weightUnit}`,
    activity: selectedLabel(activities, profile.activityLevel),
    safety: safetyFlags.includes("none")
      ? "None of these"
      : safetyFlags
          .map((flag) => selectedLabel(safetyOptions, flag))
          .join(", ") || "None of these",
    assistant: setupUsed > 0 ? "That's all for now" : "Skip for now",
  }

  function advance(fromStage: number) {
    setError(null)
    hapticMedium()
    setStage(Math.min(fromStage + 1, stages.length - 1))
  }

  function rewindTo(index: number) {
    hapticTap()
    setError(null)
    setStage(index)
  }

  async function executeSetupOperations(operations: CoachOperation[]) {
    const validationErrors = validateCoachOperations(operations)
    if (validationErrors.length > 0) throw new Error(validationErrors[0])
    const signature = JSON.stringify(operations)
    let hash = 2166136261
    for (let index = 0; index < signature.length; index += 1) {
      hash ^= signature.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (await applyCoachOperations({
      requestId: `onboarding-${(hash >>> 0).toString(36)}`,
      operations,
    })) as CoachOperationResult[]
  }

  async function sendSetupMessage() {
    const rawPrompt = setupInput.trim().slice(0, 1200)
    const selectedAttachment = setupAttachmentRef.current
    if ((!rawPrompt && !selectedAttachment) || setupBusy) return
    if (setupUsed >= SETUP_MESSAGE_LIMIT) return
    if (selectedAttachment && selectedAttachment.status !== "ready") {
      hapticHeavy()
      toast.error(
        selectedAttachment.status === "error"
          ? (selectedAttachment.error ?? "That image could not be attached.")
          : "Wait for the image to finish uploading."
      )
      return
    }
    const prompt =
      rawPrompt || "Analyze this image in the context of my goals and setup."
    hapticMedium()
    setSetupInput("")
    setSetupUsed((current) => current + 1)
    const history = setupMessages
      .slice(-8)
      .map(({ role, content }) => ({ role, content }))
    const nextMessages: CoachMessage[] = [
      ...setupMessages,
      {
        role: "user",
        content: selectedAttachment
          ? `${rawPrompt || "Take a look at this image."}\n\n📷 ${selectedAttachment.fileName}`
          : prompt,
      },
    ]
    setSetupMessages(nextMessages)
    setSetupBusy(true)
    try {
      const response = (await generateChat({
        context: setupCoachContext,
        message: prompt,
        coachMode: "chat",
        today: todayKey,
        ...(selectedAttachment?.id
          ? { attachmentId: selectedAttachment.id }
          : {}),
        history,
      })) as {
        reply: string
        uiBlocks?: unknown
        operations?: unknown
        artifacts?: unknown
      }
      const operations = normalizeCoachOperations(response.operations)
      if (selectedAttachment) clearSetupAttachment()
      const needsConfirmation = operations.some(
        (operation) =>
          operation.type === "save_recipe" ||
          operation.confirmation === "confirm" ||
          operation.warnings.length > 0
      )
      const operationResults =
        operations.length > 0 && !needsConfirmation
          ? await executeSetupOperations(operations)
          : []
      setSetupMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: response.reply,
          uiBlocks: normalizeCoachUiBlocks(response.uiBlocks),
          operationResults,
          pendingOperations: needsConfirmation ? operations : undefined,
          artifacts: normalizeCoachArtifacts(response.artifacts),
        },
      ])
      hapticTap()
    } catch (caught) {
      hapticHeavy()
      setSetupMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            caught instanceof Error && caught.message
              ? caught.message
              : "I couldn't reach Coach just now. Try again, or finish setup and chat with Coach afterwards.",
          error: true,
        },
      ])
    } finally {
      setSetupBusy(false)
    }
  }

  async function applyPendingSetupOperations(messageIndex: number) {
    const operations = setupMessages[messageIndex]?.pendingOperations
    if (!operations?.length || applyingMessageIndex !== null) return
    hapticMedium()
    setApplyingMessageIndex(messageIndex)
    try {
      const operationResults = await executeSetupOperations(operations)
      setSetupMessages((current) =>
        current.map((message, index) =>
          index === messageIndex
            ? { ...message, pendingOperations: undefined, operationResults }
            : message
        )
      )
      hapticTap()
      toast.success("Coach applied your changes")
    } catch (caught) {
      hapticHeavy()
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Could not apply Coach changes"
      )
    } finally {
      setApplyingMessageIndex(null)
    }
  }

  function dismissPendingSetupOperations(messageIndex: number) {
    hapticSelection()
    setSetupMessages((current) =>
      current.map((message, index) =>
        index === messageIndex
          ? { ...message, pendingOperations: undefined }
          : message
      )
    )
  }

  async function undoSetupAction(id: string) {
    try {
      await undoCoachAction({ id: id as Id<"coachActionEvents"> })
      hapticTap()
      toast.success("Coach change undone")
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Could not undo change"
      )
    }
  }

  async function pinSetupGoal(goalId: string) {
    try {
      await setCoachGoalPinned({
        id: goalId as Id<"coachGoals">,
        pinned: true,
      })
      hapticTap()
      toast.success("Goal pinned to Today")
    } catch (caught) {
      hapticHeavy()
      toast.error(
        caught instanceof Error ? caught.message : "Could not pin this goal"
      )
      throw caught
    }
  }

  async function pinSetupGoalDraft(goal: {
    title: string
    detail: string
    durationDays: number
    tasks: Array<{ title: string; detail?: string; completed?: boolean }>
  }) {
    try {
      await saveCoachGoal({
        title: goal.title,
        description: goal.detail,
        startDate: todayKey,
        durationDays: goal.durationDays,
        pinned: true,
        sourceMode: "chat",
        tasks: goal.tasks,
      })
      hapticTap()
      toast.success("Goal pinned to Today")
    } catch (caught) {
      hapticHeavy()
      toast.error(
        caught instanceof Error ? caught.message : "Could not pin this goal"
      )
      throw caught
    }
  }

  async function pinSetupWidget(widgetId: string) {
    try {
      await setDashboardWidgetPinned({
        widgetId: widgetId as Id<"dashboardWidgets">,
        pinned: true,
      })
      hapticTap()
      toast.success("Added to your dashboard")
    } catch (caught) {
      hapticHeavy()
      toast.error(
        caught instanceof Error ? caught.message : "Could not add that widget"
      )
      throw caught
    }
  }

  function createSetupWidgetFollowUp(
    widget: Extract<CoachOperationResult, { type: "save_dashboard_widget" }>
  ) {
    if (!widget.followUpTitle) return
    setSetupInput(
      `Implement the ${widget.followUpTitle} dashboard widget following dashboard widget ${widget.widgetId}`
    )
  }

  async function logSetupRecipe(
    result: Extract<CoachOperationResult, { type: "save_recipe" }>
  ) {
    const totals = recipeTotals(result.ingredients, result.servings)
    const entryId = createClientId()
    try {
      await addFoodEntry({
        date: todayKey,
        entry: {
          id: entryId,
          name: result.name,
          meal: "Meal",
          loggedAt: new Date().toISOString(),
          calories: totals.calories,
          protein: totals.protein,
          carbs: totals.carbs,
          fat: totals.fat,
          recipeId: result.recipeId,
        },
      })
      await recordCoachAction({
        kind: "log_recipe",
        summary: `Logged one serving of ${result.name}`,
        targetType: "nutrition",
        targetId: entryId,
        undoPayload: { kind: "remove_food_entry", date: todayKey, entryId },
      })
      toast.success(`${result.name} logged`)
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Could not log recipe"
      )
    }
  }

  async function submitSetupInteractive(
    operation: Extract<CoachOperation, { type: "log_nutrition" }>
  ) {
    try {
      await executeSetupOperations([
        { ...operation, date: operation.date ?? todayKey },
      ])
      hapticTap()
      toast.success(`${operation.name} logged`)
    } catch (caught) {
      hapticHeavy()
      toast.error(caught instanceof Error ? caught.message : "Could not log it")
    }
  }

  // Onboarding cannot navigate away mid-flow, so a Coach destination is
  // remembered and opened once setup finishes instead of being dropped.
  function handleSetupUiAction(action: CoachUiAction) {
    hapticTap()
    setSetupDestination(SETUP_DESTINATIONS[action])
    toast.success(
      `${SETUP_DESTINATION_LABELS[action]} will open when setup is done`
    )
  }

  async function finish() {
    setError(null)
    if (!consent.dataUse) {
      hapticHeavy()
      setError("Tick the consent box above so I can save your plan.")
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
          nutritionGoal: effectiveNutritionGoal,
          consent,
          safetyFlags: safetyFlags.filter((flag) => flag !== "none"),
          safetyMode: deriveSafetyMode(
            profile.age,
            effectiveNutritionGoal,
            safetyFlags
          ),
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
      safeLocalStorageSet(COACH_ONBOARDING_SEEN_KEY, "true")
      // Arms the walkthrough welcome sheet. Local so it shows immediately,
      // without waiting on a Convex round trip.
      safeLocalStorageSet(WALKTHROUGH_WELCOME_PENDING_KEY, "true")
      setComplete(true)
      hapticMedium()
      await new Promise((resolve) => window.setTimeout(resolve, 720))
      navigate(
        setupDestination ??
          (experienceLevel === "beginner" ? "/coach?setup=beginner" : "/coach"),
        { replace: true }
      )
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

  function renderInput(stageId: StageId, stageIndex: number) {
    if (stageId === "intro") {
      return (
        <QuickReplies
          options={[{ value: "go", label: "Let's go", icon: ArrowRight }]}
          onChoose={() => advance(stageIndex)}
        />
      )
    }
    if (stageId === "goal") {
      return (
        <QuickReplies
          value={nutritionGoal}
          options={nutritionGoals.map(([value, label, hint, icon]) => ({
            value,
            label,
            hint,
            icon,
          }))}
          onChoose={(goal) => {
            setNutritionGoal(goal)
            setDraft((current) => ({
              ...current,
              goal: nutritionGoalToOnboardingGoal(goal),
            }))
            advance(stageIndex)
          }}
        />
      )
    }
    if (stageId === "experience") {
      return (
        <QuickReplies
          value={experienceLevel}
          options={experienceLevels.map(([value, label, hint, icon]) => ({
            value,
            label,
            hint,
            icon,
          }))}
          onChoose={(level) => {
            setExperienceLevel(level)
            advance(stageIndex)
          }}
        />
      )
    }
    if (stageId === "coach") {
      return (
        <>
          <div className="onboarding-chat-card onboarding-chat-card-flush">
            <CoachFeatureMockups />
          </div>
          <QuickReplies
            options={[
              {
                value: "continue",
                label: coachReplay ? "Open Coach" : "Sounds good",
                icon: ArrowRight,
              },
            ]}
            onChoose={() => {
              if (coachReplay) {
                safeLocalStorageSet(COACH_ONBOARDING_SEEN_KEY, "true")
                navigate("/coach", { replace: true })
                return
              }
              advance(stageIndex)
            }}
          />
        </>
      )
    }
    if (stageId === "sex") {
      return (
        <QuickReplies
          value={profile.sex}
          options={[
            { value: "female", label: "Female", icon: GenderFemale },
            { value: "male", label: "Male", icon: GenderMale },
          ]}
          onChoose={(sex: Sex) => {
            setProfile((current) => ({ ...current, sex }))
            advance(stageIndex)
          }}
        />
      )
    }
    if (stageId === "measurements") {
      return (
        <div className="onboarding-chat-card">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="onboarding-question-title mb-0">Measurements</span>
            <button
              type="button"
              onClick={() => {
                hapticSelection()
                setWeightUnit((current) => (current === "kg" ? "lbs" : "kg"))
              }}
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
              onChange={(age) => setProfile((current) => ({ ...current, age }))}
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
                  weightKg: weightUnit === "kg" ? value : lbsToKg(value),
                }))
              }
            />
          </div>
          <button
            type="button"
            className="onboarding-primary-button mt-4 w-full"
            onClick={() => advance(stageIndex)}
          >
            That's right
            <Check size={16} weight="bold" />
          </button>
        </div>
      )
    }
    if (stageId === "activity") {
      return (
        <QuickReplies
          value={profile.activityLevel}
          options={activities.map(([value, label, hint]) => ({
            value,
            label,
            hint,
          }))}
          onChoose={(activityLevel) => {
            setProfile((current) => ({ ...current, activityLevel }))
            advance(stageIndex)
          }}
        />
      )
    }
    if (stageId === "assistant") {
      const remaining = SETUP_MESSAGE_LIMIT - setupUsed
      return (
        <div className="onboarding-setup-chat">
          {setupMessages.map((message, messageIndex) =>
            message.role === "user" ? (
              <div
                key={messageIndex}
                className="onboarding-chat-bubble onboarding-chat-bubble-user onboarding-chat-bubble-static"
              >
                <span>{message.content}</span>
              </div>
            ) : (
              <div key={messageIndex} className="onboarding-setup-response">
                <div
                  className={
                    message.error
                      ? "onboarding-chat-bubble onboarding-chat-bubble-coach onboarding-chat-bubble-error"
                      : "onboarding-chat-bubble onboarding-chat-bubble-coach"
                  }
                >
                  <span>{message.content}</span>
                </div>
                <CoachUiBlocks
                  blocks={message.uiBlocks}
                  onAction={handleSetupUiAction}
                  onPinGoal={pinSetupGoalDraft}
                  onSubmitInteractive={submitSetupInteractive}
                />
                <CoachArtifacts artifacts={message.artifacts} />
                <CoachProposal
                  operations={message.pendingOperations}
                  applying={applyingMessageIndex === messageIndex}
                  onApply={() => void applyPendingSetupOperations(messageIndex)}
                  onDismiss={() => dismissPendingSetupOperations(messageIndex)}
                />
                <CoachOperationResults
                  results={message.operationResults}
                  onOpenRecipe={() =>
                    handleSetupUiAction("open_recipe_builder")
                  }
                  onOpenWorkouts={() => handleSetupUiAction("open_workouts")}
                  onOpenNutrition={() => handleSetupUiAction("open_nutrition")}
                  onOpenProgress={() => handleSetupUiAction("open_progress")}
                  onUndo={(id) => void undoSetupAction(id)}
                  onLogRecipe={(result) => void logSetupRecipe(result)}
                  onPinGoal={pinSetupGoal}
                  onPinWidget={pinSetupWidget}
                  onCreateWidgetFollowUp={createSetupWidgetFollowUp}
                />
              </div>
            )
          )}
          {setupBusy && <ThinkingIndicator />}
          {setupMessages.length === 0 && !setupBusy && (
            <div className="onboarding-setup-starters">
              {SETUP_STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => {
                    hapticSelection()
                    setSetupInput(starter)
                  }}
                >
                  {starter}
                </button>
              ))}
            </div>
          )}
          {remaining > 0 && (
            <form
              className="onboarding-chat-composer-shell"
              onSubmit={(event) => {
                event.preventDefault()
                void sendSetupMessage()
              }}
            >
              <CoachAttachmentInput
                inputRef={setupFileInputRef}
                onSelect={(file) => void attachSetupImage(file)}
              />
              <CoachAttachmentPreview
                attachment={setupAttachment}
                onRemove={() => clearSetupAttachment()}
              />
              <div className="onboarding-chat-composer">
                <CoachAttachButton
                  onClick={openSetupImagePicker}
                  disabled={setupBusy}
                  className="onboarding-chat-attach"
                />
                <input
                  type="text"
                  value={setupInput}
                  onChange={(event) => setSetupInput(event.target.value)}
                  placeholder="Ask Coach to build something…"
                  aria-label="Message Coach"
                  disabled={setupBusy}
                />
                <button
                  type="submit"
                  disabled={
                    setupBusy ||
                    (setupInput.trim().length === 0 && !setupAttachment)
                  }
                  aria-label="Send"
                >
                  <PaperPlaneTilt size={17} weight="fill" />
                </button>
              </div>
            </form>
          )}
          <p className="onboarding-setup-quota" aria-live="polite">
            {remaining > 0
              ? `${remaining} of ${SETUP_MESSAGE_LIMIT} messages left`
              : "Message limit reached — you can keep chatting in Coach later."}
          </p>
          <QuickReplies
            options={[
              {
                value: "continue",
                label: setupUsed > 0 ? "That's all for now" : "Skip for now",
                icon: ArrowRight,
              },
            ]}
            onChoose={() => advance(stageIndex)}
          />
        </div>
      )
    }
    if (stageId === "safety") {
      return (
        <div className="onboarding-chat-card">
          <MultiSelectList
            onInteract={hapticSelection}
            values={safetyFlags}
            options={[["none", "None"], ...safetyOptions]}
            onChange={setSafetyFlags}
            icon={ShieldCheck}
          />
          <button
            type="button"
            className="onboarding-primary-button mt-4 w-full"
            onClick={() => advance(stageIndex)}
          >
            {safetyFlags.includes("none") || safetyFlags.length === 0
              ? "None of these"
              : "That's everything"}
            <ArrowRight size={16} weight="bold" />
          </button>
        </div>
      )
    }
    return (
      <div className="onboarding-chat-review">
        <div className="onboarding-review-card">
          <div className="onboarding-review-hero">
            <p className="native-supporting">Calories</p>
            <p className="native-summary-value mt-1 tabular-nums">
              {preview?.targetCalories?.toLocaleString() ?? "Calculating…"}
              {preview?.targetCalories != null ? " kcal" : ""}
            </p>
            <p className="native-row-detail mt-2">
              {preview?.calorieStrategy ??
                "Calculating your starting budget from our chat."}
            </p>
          </div>
          {[
            [
              "Maintenance estimate",
              preview ? `${preview.tdee.toLocaleString()} kcal` : "—",
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
              <span className="native-row-value text-right">{value}</span>
            </div>
          ))}
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-border bg-[var(--surface-panel)] p-4 text-[13px] leading-5 text-muted-foreground">
          <input
            type="checkbox"
            checked={consent.dataUse}
            onChange={(event) => {
              hapticSelection()
              setConsent((current) => ({
                ...current,
                dataUse: event.target.checked,
              }))
            }}
            className="mt-0.5 size-4 shrink-0 accent-foreground"
          />
          <span>
            I explicitly consent to OneRep processing the fitness, nutrition,
            body, recovery, and related information I provide to deliver
            personalized tracking and Coach features. Some of this information
            may qualify as health data. I can withdraw consent with future
            effect by deleting affected data or my account, or by contacting{" "}
            <a
              href="mailto:support@onerep.life"
              className="font-semibold text-foreground underline decoration-border underline-offset-4"
            >
              support@onerep.life
            </a>
            . See the{" "}
            <a
              href="https://onerep.life/privacy"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-foreground underline decoration-border underline-offset-4"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {error && (
          <p
            role="alert"
            className="border-l-2 border-destructive py-2 pl-3 text-[14px] font-medium text-destructive"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={finish}
          disabled={saving}
          aria-busy={saving}
          className="onboarding-primary-button w-full"
        >
          {saving ? (
            "Saving..."
          ) : (
            <>
              Start training
              <Check size={16} weight="bold" />
            </>
          )}
        </button>
      </div>
    )
  }

  const visibleStages = coachReplay
    ? stages.filter((item) => item.id === "coach")
    : stages.slice(0, stage + 1)
  const coachStage =
    stages[stage].id === "coach" || stages[stage].id === "assistant"

  return (
    <main
      className="onboarding-shell auth-light-only relative isolate min-h-svh bg-background text-foreground"
      data-coach-stage={coachStage}
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
      {coachStage && (
        <div className="coach-background-layer" aria-hidden="true">
          <div className="coach-swoosh-backdrop coach-swoosh-backdrop--mobile" />
        </div>
      )}
      <section className="onboarding-frame">
        <header className="onboarding-header">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img src="/app-icon.svg" alt="" className="size-7" />
              <span className="onboarding-brand-name">OneRep</span>
            </div>
            <span className="onboarding-step-count tabular-nums">
              {coachReplay ? "Coach onboarding preview" : stages[stage].label}
            </span>
          </div>
          {!coachReplay && (
            <div
              className="onboarding-progress"
              role="progressbar"
              aria-label="Profile setup progress"
              aria-valuemin={1}
              aria-valuemax={stages.length}
              aria-valuenow={stage + 1}
            >
              {stages.map((item, index) => (
                <span
                  key={`${item.id}-${index}`}
                  className="onboarding-progress-segment"
                  data-complete={index <= stage}
                />
              ))}
            </div>
          )}
          {coachReplay && (
            <button
              type="button"
              onClick={() => navigate("/settings", { replace: true })}
              className="onboarding-back-button mt-3"
            >
              Exit
            </button>
          )}
        </header>

        <div
          className="onboarding-chat"
          role="log"
          aria-label="Setup conversation"
        >
          {visibleStages.map((item, index) => {
            const stageIndex = coachReplay ? coachStageIndex : index
            const isCurrent = stageIndex === stage
            const hidden = isCurrent && typing
            const answer = stageAnswers[item.id]
            const messages = stageMessages[item.id]
            const shownMessages = isCurrent
              ? messages.slice(0, typedCount + 1)
              : messages
            return (
              <div
                key={`${item.id}-${stageIndex}`}
                className="onboarding-chat-stage"
                data-stage={item.id}
              >
                {!hidden &&
                  shownMessages.map((message, messageIndex) => (
                    <div
                      key={messageIndex}
                      className="onboarding-chat-bubble onboarding-chat-bubble-coach"
                    >
                      {isCurrent && messageIndex === typedCount ? (
                        <TypewriterText
                          text={message}
                          onDone={() => {
                            hapticTap()
                            setTypedCount((current) => current + 1)
                          }}
                        />
                      ) : (
                        message
                      )}
                    </div>
                  ))}
                {isCurrent && !hidden && typedCount >= messages.length && (
                  <div className="onboarding-chat-input">
                    {renderInput(item.id, stageIndex)}
                  </div>
                )}
                {!isCurrent && answer && !coachReplay && (
                  <button
                    type="button"
                    className="onboarding-chat-bubble onboarding-chat-bubble-user"
                    onClick={() => rewindTo(stageIndex)}
                    aria-label={`Edit answer: ${answer}`}
                  >
                    <span>{answer}</span>
                    <PencilSimple size={13} weight="bold" aria-hidden="true" />
                  </button>
                )}
              </div>
            )
          })}
          {typing && (
            <div
              className="onboarding-chat-bubble onboarding-chat-bubble-coach onboarding-chat-typing"
              aria-label="Coach is typing"
            >
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={chatEndRef} aria-hidden="true" />
        </div>
      </section>
    </main>
  )
}
