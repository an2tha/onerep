import { useEnergyUnit } from "@/lib/use-energy-unit"
import type { SettingsView } from "./Settings"
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { readCachedWeightUnit } from "@/lib/use-weight-unit"
import { energyDisplay, useTheme } from "@repo/ui"
import {
  SetupPreferences,
  defaultSetupPreferences,
  parseSetupPreferences,
  type SetupPreferencesValue,
} from "./onboarding/setup-preferences"
import { cacheEnergyUnit } from "@/lib/use-energy-unit"
import "./onboarding/setup.css"
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
  UploadSimple,
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
import { trackUmami } from "@/lib/analytics"
import {
  createClientId,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/lib/utils"
import { toast } from "@repo/ui"
import { uploadOwnedFile } from "@/lib/owned-upload"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  hapticHeavy,
  hapticMedium,
  hapticSelection,
  hapticTap,
} from "@/lib/haptics"
import { MINIMUM_AGE } from "@repo/models"
import { MedicalDisclaimer } from "@repo/ui"

const SetupSettings = lazy(() => import("./Settings"))

const AGE_MIN = MINIMUM_AGE
const AGE_MAX = 100
const HEIGHT_MIN = 100
const HEIGHT_MAX = 250
const WEIGHT_KG_MIN = 35
const WEIGHT_KG_MAX = 250
const POST_SIGNUP_ONBOARDING_KEY = "onerep:post-signup-onboarding"
const COACH_ONBOARDING_SEEN_KEY = "onerep:coach-onboarding-seen"
const ONBOARDING_DRAFT_KEY = "onerep:onboarding-draft:v2"

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

/** Answers recovered from an interrupted run. Absent fields mean "the saved
 * value was missing or garbage — keep whatever the server said instead". */
type OnboardingSnapshot = {
  stage: number
  nutritionGoal?: NutritionGoal
  experienceLevel?: ExperienceLevel
  sex?: Sex
  age?: number
  heightCm?: number
  weightKg?: number
  activityLevel?: ActivityLevel
  safetyFlags?: string[]
  weightUnit?: WeightUnit
  waterGoalMl?: number
  consent?: ConsentState
}

/**
 * Ten answers in, the phone rings, the app dies, and without this the coach
 * greets them at stage one like nothing happened. Every field is re-validated:
 * localStorage survives app updates and whatever the user's other tabs did.
 */
function parseOnboardingSnapshot(
  raw: string | null
): OnboardingSnapshot | null {
  if (!raw) return null
  let value: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    value = parsed as Record<string, unknown>
  } catch {
    return null
  }

  const number = (input: unknown, min: number, max: number) =>
    typeof input === "number" && Number.isFinite(input)
      ? clamp(input, min, max)
      : undefined
  const consent = value.consent as Record<string, unknown> | undefined

  return {
    stage:
      number(value.stage, 0, stages.length - 1) !== undefined
        ? Math.round(number(value.stage, 0, stages.length - 1)!)
        : 0,
    ...(isNutritionGoal(value.nutritionGoal)
      ? { nutritionGoal: value.nutritionGoal }
      : {}),
    ...(isExperienceLevel(value.experienceLevel)
      ? { experienceLevel: value.experienceLevel }
      : {}),
    ...(value.sex === "male" || value.sex === "female"
      ? { sex: value.sex }
      : {}),
    ...(number(value.age, AGE_MIN, AGE_MAX) !== undefined
      ? { age: number(value.age, AGE_MIN, AGE_MAX) }
      : {}),
    ...(number(value.heightCm, HEIGHT_MIN, HEIGHT_MAX) !== undefined
      ? { heightCm: number(value.heightCm, HEIGHT_MIN, HEIGHT_MAX) }
      : {}),
    ...(number(value.weightKg, WEIGHT_KG_MIN, WEIGHT_KG_MAX) !== undefined
      ? { weightKg: number(value.weightKg, WEIGHT_KG_MIN, WEIGHT_KG_MAX) }
      : {}),
    ...(isActivityLevel(value.activityLevel)
      ? { activityLevel: value.activityLevel }
      : {}),
    ...(Array.isArray(value.safetyFlags) &&
    value.safetyFlags.every((flag) => typeof flag === "string")
      ? { safetyFlags: value.safetyFlags as string[] }
      : {}),
    ...(value.weightUnit === "kg" || value.weightUnit === "lbs"
      ? { weightUnit: value.weightUnit }
      : {}),
    ...(number(value.waterGoalMl, 0, 10000) !== undefined
      ? { waterGoalMl: number(value.waterGoalMl, 0, 10000) }
      : {}),
    ...(consent &&
    typeof consent.dataUse === "boolean" &&
    typeof consent.weightData === "boolean" &&
    typeof consent.foodLogging === "boolean" &&
    typeof consent.wearableIntegrations === "boolean"
      ? {
          consent: {
            dataUse: consent.dataUse,
            weightData: consent.weightData,
            foodLogging: consent.foodLogging,
            wearableIntegrations: consent.wearableIntegrations,
          },
        }
      : {}),
  }
}

import { MultiSelectList, NumberQuestion } from "@repo/ui"

/**
 * A still of one real Coach exchange, in the same shapes Coach actually
 * renders: a question, an answer, the numbers behind it, and the ask before
 * anything is written. Nothing here animates or pretends to be tappable.
 */
function CoachPreviewExchange() {
  const energyUnit = useEnergyUnit()
  return (
    <figure className="onboarding-coach-preview">
      <figcaption className="onboarding-coach-preview-ask">
        Logged a chicken rice bowl. What's left today?
      </figcaption>
      <div className="onboarding-coach-preview-reply">
        <p>
          That bowl is about {energyDisplay(520, energyUnit)} {energyUnit}.
          Here's the rest of your day.
        </p>
        <dl className="onboarding-coach-preview-stats">
          <div>
            <dt>Calories left</dt>
            <dd>780</dd>
          </div>
          <div>
            <dt>Protein left</dt>
            <dd>52 g</dd>
          </div>
          <div>
            <dt>Next session</dt>
            <dd>Push day</dd>
          </div>
        </dl>
        <p className="onboarding-coach-preview-note">
          I can log the bowl and put protein on Today — say the word and I'll do
          it.
        </p>
      </div>
    </figure>
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
  | "import"
  | "assistant"
  | "review"
  | "preferences"
  | "nutrition"
  | "lifestyle"
  | "connections"

const stages = [
  { id: "intro", label: "Welcome" },
  { id: "preferences", label: "Your app" },
  { id: "goal", label: "Goals" },
  { id: "experience", label: "Experience" },
  { id: "coach", label: "Coach" },
  { id: "sex", label: "Baseline" },
  { id: "measurements", label: "Baseline" },
  { id: "activity", label: "Activity" },
  { id: "safety", label: "Health" },
  { id: "nutrition", label: "Nutrition" },
  { id: "lifestyle", label: "Daily life" },
  { id: "connections", label: "Connections & more" },
  { id: "import", label: "Your history" },
  { id: "assistant", label: "Coach setup" },
  { id: "review", label: "Review" },
] as const satisfies readonly { id: StageId; label: string }[]

const IMPORT_MAX_FILES = 3
const IMPORT_MAX_TOTAL_BYTES = 5 * 1024 * 1024

type ImportFileKind = "workouts" | "measurements" | "unsupported"

type ImportPreviewFileView = {
  uploadId: Id<"fileUploads">
  fileName: string
  kind: ImportFileKind
  note?: string
  workouts: number
  measurements: number
  skippedRows: number
  firstDate?: string
  lastDate?: string
  exerciseCount: number
  plan: unknown
}

type ImportPreviewView = {
  files: ImportPreviewFileView[]
  totals: { workouts: number; measurements: number; skippedRows: number }
}

type ImportCommitView = {
  workouts: number
  workoutsSkipped: number
  measurements: number
}

function countNoun(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

function describeImportFile(file: ImportPreviewFileView): string {
  if (file.kind === "unsupported") {
    return file.note ?? "Not something I can file."
  }
  const parts: string[] = []
  if (file.workouts > 0) parts.push(countNoun(file.workouts, "workout"))
  if (file.measurements > 0)
    parts.push(countNoun(file.measurements, "check-in"))
  if (parts.length === 0) return "Nothing usable in here."
  const range =
    file.firstDate && file.lastDate && file.firstDate !== file.lastDate
      ? `, ${file.firstDate} to ${file.lastDate}`
      : ""
  return parts.join(" and ") + range
}

function describeImportResult(result: ImportCommitView): string {
  const parts: string[] = []
  if (result.workouts > 0) parts.push(countNoun(result.workouts, "workout"))
  if (result.measurements > 0) {
    parts.push(countNoun(result.measurements, "check-in"))
  }
  if (parts.length === 0) return "Nothing made it in."
  return `Imported ${parts.join(" and ")}.`
}

/**
 * Some browsers hand over a .csv with an empty MIME type. The upload pipeline
 * validates by declared type, so an unlabelled file gets one from its
 * extension before it goes anywhere.
 */
function withImportMimeType(file: File): File {
  if (file.type) return file
  const type = /\.json$/i.test(file.name) ? "application/json" : "text/csv"
  return new File([file], file.name, { type })
}

// Static per stage, so effects can reason about message counts without waiting
// for a render, and a revisited stage can be shown fully typed in one frame.
const stageMessages: Record<StageId, string[]> = {
  intro: [
    "A place for your training, food, and progress. Set it up around the way you live. You can revisit any completed section.",
  ],
  connections: [
    "Connect your health sources, choose reminders, and fine-tune privacy and nutrition settings here. Each section saves its own changes; health consent is confirmed when you finish setup.",
  ],
  preferences: [
    "Choose how OneRep looks, the units you use, and what you see first.",
  ],
  nutrition: [
    "Choose what you want to track and how you prefer to eat. These preferences help personalize your nutrition guidance.",
  ],
  lifestyle: [
    "Make your plan practical with your cooking experience, budget, meal rhythm, and hydration goal.",
  ],
  goal: ["First things first: what are you working toward?"],
  experience: [
    "Good choice. How much experience do you have with training and tracking?",
  ],
  coach: [
    "One more thing before your numbers. Coach is the part of OneRep you talk to.",
    "Ask about your day and you get an answer with your own numbers behind it. It only writes something after you say yes.",
  ],
  sex: [
    "Now let's estimate your energy needs.",
    "Which option suits you best?",
  ],
  measurements: [
    "And your measurements. I use these to calculate your starting calorie budget.",
  ],
  activity: [
    "How active is a typical week for you? Pick your usual, not your best week.",
  ],
  safety: [
    "Almost done. Do any of these health considerations apply to you?",
    "This is optional, and it helps me avoid unsuitable calorie recommendations.",
  ],
  import: [
    "Were you tracking in another app before this? That history is worth keeping.",
    "Export it as CSV or JSON — up to 5 MB — and I'll work out what's inside and file your workouts and weigh-ins where they belong. You see what I found before anything is saved.",
  ],
  assistant: [
    "Want a head start? I can build it now: routines and presets on your week, recipes, goals, progress trackers, or your first logged meal.",
    "Tell me what you want in your own words, or send a photo of your fridge, a menu, or a plan you already follow. You have 5 messages, and nothing gets saved without you seeing it first.",
  ],
  review: [
    "That's everything I need. Here are your starting daily targets. These are estimates, not medical advice. You can change them any time in Settings.",
  ],
}

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
  open_supplements: "/supplements",
  open_settings: "/settings",
}

const SETUP_DESTINATION_LABELS: Record<CoachUiAction, string> = {
  open_nutrition: "Nutrition",
  log_food: "Nutrition",
  open_workouts: "Workouts",
  open_workout_builder: "Workouts",
  open_progress: "Progress",
  open_recipe_builder: "Recipes",
  open_supplements: "Supplements",
  open_settings: "Settings",
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
            {OptionIcon && (
              <OptionIcon size={22} weight="regular" aria-hidden="true" />
            )}
            <span>
              {option.label}
              {option.hint && (
                <span className="onboarding-chat-chip-hint">{option.hint}</span>
              )}
            </span>
            {option.hint && (
              <ArrowRight
                className="onboarding-choice-arrow"
                size={18}
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function OnboardingMobile() {
  const navigate = useSmoothNavigate()
  const { theme, setTheme } = useTheme()
  const [setupPreferences, setSetupPreferences] =
    useState<SetupPreferencesValue>(() =>
      parseSetupPreferences(safeLocalStorageGet("onerep:setup-preferences"))
    )
  const energyUnit =
    setupPreferences.energyUnit === "Cal" ? "cal" : setupPreferences.energyUnit
  const saveEnergyUnit = useMutation(api.users.users.setEnergyUnit)
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
  // Self-hosted deployments often run without a server OpenRouter key. The
  // setup chat would just fail, so hint at BYOK instead of letting it.
  const aiUsage = useQuery(api.ai.usage.getMonthlyUsage, {})
  const aiUnavailable =
    aiUsage !== undefined && !aiUsage.serverAiConfigured && !aiUsage.byok
  const generateChat = useAction(
    api.ai.metricGeneration.generateCoachChatMessage
  )
  const previewImportFiles = useAction(api.logs.dataImport.preview)
  const commitImportFiles = useAction(api.logs.dataImport.commit)
  const discardUpload = useMutation(api.uploads.discard)
  const applyCoachOperations = useAction(api.ai.coachOperations.applyApproved)
  const addFoodEntry = useMutation(api.logs.foodLogs.addEntry)
  const recordCoachAction = useMutation(api.ai.coachState.recordAction)
  const undoCoachAction = useMutation(api.ai.coachState.undoAction)
  const saveCoachGoal = useMutation(api.ai.coachGoals.save)
  const setCoachGoalPinned = useMutation(api.ai.coachGoals.setPinned)
  const setDashboardWidgetPinned = useMutation(api.dashboardWidgets.setPinned)
  const { context: coachContext } = useCoachContext()

  const [settingsView, setSettingsView] = useState<SettingsView | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [stage, setStage] = useState(() => (coachReplay ? coachStageIndex : 0))
  // Where to jump back to after editing an earlier answer, so a correction
  // costs one tap instead of a forced re-walk through every stage between.
  const [returnStage, setReturnStage] = useState<number | null>(null)
  // The denominator for every step and completion number below.
  useEffect(() => {
    trackUmami("onboarding_started", { replay: coachReplay })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
  const {
    weightTrend,
    occupationActivity,
    dietType,
    allergies,
    cookingSkill,
    budget,
    mealFrequency,
    trackingMode,
    loggingFeatures,
    firstNutritionAction,
  } = setupPreferences
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(readCachedWeightUnit)
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
  const [importBusy, setImportBusy] = useState<"reading" | "importing" | null>(
    null
  )
  const [importPreview, setImportPreview] = useState<ImportPreviewView | null>(
    null
  )
  const [importResult, setImportResult] = useState<ImportCommitView | null>(
    null
  )
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const savingRef = useRef(false)

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

    // An interrupted run beats anything the server remembers: the snapshot
    // was written seconds before the app died, the server profile could be
    // months old.
    const snapshot = coachReplay
      ? null
      : parseOnboardingSnapshot(safeLocalStorageGet(ONBOARDING_DRAFT_KEY))

    const mergedNutritionGoal =
      snapshot?.nutritionGoal ??
      (isNutritionGoal(onboardingProfile?.nutritionGoal)
        ? onboardingProfile.nutritionGoal
        : null)
    const mergedGoal = snapshot?.nutritionGoal
      ? nutritionGoalToOnboardingGoal(snapshot.nutritionGoal)
      : nextGoal
    const mergedAge = snapshot?.age ?? nextAge
    const mergedHeight = snapshot?.heightCm ?? nextHeight

    setDraft({ age: mergedAge, heightCm: mergedHeight, goal: mergedGoal })
    setProfile({
      sex:
        snapshot?.sex ??
        (healthProfile?.sex === "male" || healthProfile?.sex === "female"
          ? healthProfile.sex
          : null),
      age: mergedAge,
      weightKg: snapshot?.weightKg ?? nextWeight,
      heightCm: mergedHeight,
      activityLevel: snapshot?.activityLevel ?? nextActivity,
      goal: mergedGoal
        ? mapOnboardingGoalToCalorieGoal(mergedGoal)
        : "maintain",
    })
    setConsent(
      snapshot?.consent ??
        onboardingProfile?.consent ?? {
          dataUse: false,
          weightData: true,
          foodLogging: true,
          wearableIntegrations: false,
        }
    )
    setNutritionGoal(mergedNutritionGoal)
    setExperienceLevel(
      snapshot?.experienceLevel ??
        (isExperienceLevel(onboardingProfile?.experienceLevel)
          ? onboardingProfile.experienceLevel
          : null)
    )
    setSafetyFlags(
      snapshot?.safetyFlags && snapshot.safetyFlags.length > 0
        ? snapshot.safetyFlags
        : Array.isArray(onboardingProfile?.safetyFlags) &&
            onboardingProfile.safetyFlags.length > 0
          ? onboardingProfile.safetyFlags
          : ["none"]
    )
    setWeightUnit(snapshot?.weightUnit ?? nextUnit)
    setWaterGoalMl(snapshot?.waterGoalMl ?? preferences?.waterGoalMl ?? 2500)
    if (snapshot && snapshot.stage > 0) {
      setStage(snapshot.stage)
    }
    if (!safeLocalStorageGet("onerep:setup-preferences")) {
      setSetupPreferences(
        parseSetupPreferences(
          JSON.stringify({
            ...defaultSetupPreferences,
            energyUnit: preferences?.energyUnit ?? "kcal",
            workoutFocus:
              preferences?.dashboardSettings?.workoutFocus ?? "strength",
            simpleMode: preferences?.dashboardSettings?.simpleMode ?? false,
            ...(onboardingProfile
              ? Object.fromEntries(
                  Object.entries(onboardingProfile).filter(
                    ([key]) => key in defaultSetupPreferences
                  )
                )
              : {}),
          })
        )
      )
    }
    setInitialized(true)
  }, [coachReplay, healthProfile, initialized, onboardingProfile, preferences])

  // Every answer is written down the moment it is given. The final save can
  // still fail, the app can still die — this is what makes either survivable.
  useEffect(() => {
    if (!initialized || coachReplay || complete) return
    safeLocalStorageSet(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({
        stage,
        nutritionGoal,
        experienceLevel,
        sex: profile.sex,
        age: profile.age,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        safetyFlags,
        weightUnit,
        waterGoalMl,
        consent,
      })
    )
  }, [
    complete,
    coachReplay,
    consent,
    experienceLevel,
    initialized,
    nutritionGoal,
    profile,
    safetyFlags,
    stage,
    waterGoalMl,
    weightUnit,
  ])

  // If the queries never land — offline, dead socket — stop waiting and let the
  // user answer against local defaults. The guard above makes a late arrival a
  // no-op, so nothing they typed can be overwritten after this fires. An
  // interrupted run still resumes here: the snapshot is local and owes the
  // socket nothing.
  useEffect(() => {
    if (initialized) return
    const timer = window.setTimeout(() => {
      const snapshot = coachReplay
        ? null
        : parseOnboardingSnapshot(safeLocalStorageGet(ONBOARDING_DRAFT_KEY))
      if (snapshot) {
        if (snapshot.nutritionGoal) {
          const goal = nutritionGoalToOnboardingGoal(snapshot.nutritionGoal)
          setNutritionGoal(snapshot.nutritionGoal)
          setDraft((current) => ({ ...current, goal }))
        }
        if (snapshot.experienceLevel) {
          setExperienceLevel(snapshot.experienceLevel)
        }
        setProfile((current) => ({
          ...current,
          sex: snapshot.sex ?? current.sex,
          age: snapshot.age ?? current.age,
          heightCm: snapshot.heightCm ?? current.heightCm,
          weightKg: snapshot.weightKg ?? current.weightKg,
          activityLevel: snapshot.activityLevel ?? current.activityLevel,
        }))
        if (snapshot.safetyFlags && snapshot.safetyFlags.length > 0) {
          setSafetyFlags(snapshot.safetyFlags)
        }
        if (snapshot.weightUnit) setWeightUnit(snapshot.weightUnit)
        if (snapshot.waterGoalMl !== undefined) {
          setWaterGoalMl(snapshot.waterGoalMl)
        }
        if (snapshot.consent) setConsent(snapshot.consent)
        if (snapshot.stage > 0) {
          setStage(snapshot.stage)
        }
      }
      setInitialized(true)
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [coachReplay, initialized])

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
    document
      .querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" })
    window.scrollTo({ top: 0, behavior: "instant" })
    document.getElementById("setup-heading")?.focus({ preventScroll: true })
    document
      .getElementById("setup-content")
      ?.scrollTo({ top: 0, behavior: "instant" })
  }, [stage, settingsView])

  useEffect(() => {
    if (initialized && !complete)
      safeLocalStorageSet(
        "onerep:setup-preferences",
        JSON.stringify(setupPreferences)
      )
  }, [setupPreferences, initialized, complete])

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
    import: importResult
      ? describeImportResult(importResult)
      : "Starting fresh",
    assistant: setupUsed > 0 ? "That's all for now" : "Skip for now",
  }

  function advance(fromStage: number) {
    setError(null)
    hapticMedium()
    // Onboarding is where accounts are won or abandoned, and the only way to
    // see where it happens is to count each step as it is left behind.
    trackUmami("onboarding_step", {
      stage: stages[fromStage]?.id ?? "unknown",
      index: fromStage,
      total: stages.length,
    })
    const next = Math.min(fromStage + 1, stages.length - 1)
    // After editing an earlier answer, one tap puts them back where they
    // were. The stages between still hold their answers; nobody needs to
    // watch themselves re-give them.
    const target =
      returnStage !== null && returnStage > next ? returnStage : next
    if (returnStage !== null && target >= returnStage) setReturnStage(null)
    setStage(target)
  }

  function rewindTo(index: number) {
    hapticTap()
    setError(null)
    setReturnStage((current) => Math.max(current ?? stage, stage))
    setStage(index)
  }

  async function handleImportSelection(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (files.length === 0 || importBusy) return
    setImportError(null)
    if (files.length > IMPORT_MAX_FILES) {
      hapticHeavy()
      setImportError(
        `${IMPORT_MAX_FILES} files at most. Pick the ones that matter.`
      )
      return
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > IMPORT_MAX_TOTAL_BYTES) {
      hapticHeavy()
      setImportError(
        "That's more than 5 MB together. Most apps can export a shorter date range."
      )
      return
    }
    hapticMedium()
    setImportBusy("reading")
    try {
      const uploadIds: Id<"fileUploads">[] = []
      for (const file of files) {
        uploadIds.push(
          await uploadOwnedFile(
            withImportMimeType(file),
            "data_import",
            file.name
          )
        )
      }
      const result = (await previewImportFiles({
        defaultWeightUnit: weightUnit === "lbs" ? "lb" : "kg",
        uploadIds,
      })) as ImportPreviewView
      setImportPreview(result)
      hapticTap()
    } catch (caught) {
      hapticHeavy()
      setImportError(
        caught instanceof Error && caught.message
          ? caught.message
          : "I couldn't read those files. Try again, or skip this — the app works fine without them."
      )
    } finally {
      setImportBusy(null)
      if (importInputRef.current) importInputRef.current.value = ""
    }
  }

  async function runImportCommit() {
    if (!importPreview || importBusy) return
    hapticMedium()
    setImportBusy("importing")
    setImportError(null)
    try {
      const result = (await commitImportFiles({
        files: importPreview.files
          .filter((file) => file.kind !== "unsupported")
          .map(({ uploadId, plan }) => ({ uploadId, plan })),
      })) as ImportCommitView
      setImportResult(result)
      setImportPreview(null)
      trackUmami("onboarding_import", {
        workouts: result.workouts,
        measurements: result.measurements,
        skipped: result.workoutsSkipped,
      })
      hapticTap()
    } catch (caught) {
      hapticHeavy()
      setImportError(
        caught instanceof Error && caught.message
          ? caught.message
          : "The import didn't go through. Nothing was half-written — try again."
      )
    } finally {
      setImportBusy(null)
    }
  }

  function abandonImportPreview() {
    if (!importPreview || importBusy) return
    hapticSelection()
    for (const file of importPreview.files) {
      // Best effort: an undiscarded upload expires on its own within a day.
      void discardUpload({ uploadId: file.uploadId }).catch(() => {})
    }
    setImportPreview(null)
    setImportError(null)
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
      toast.success("Goal pinned to Today", {
        action: {
          label: "Undo",
          onClick: () => {
            void setCoachGoalPinned({
              id: goalId as Id<"coachGoals">,
              pinned: false,
            }).catch(() => {
              toast.error("Couldn't undo that")
            })
          },
        },
      })
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
      toast.success("Added to your dashboard", {
        action: {
          label: "Undo",
          onClick: () => {
            void setDashboardWidgetPinned({
              widgetId: widgetId as Id<"dashboardWidgets">,
              pinned: false,
            }).catch(() => {
              toast.error("Couldn't undo that")
            })
          },
        },
      })
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
    if (savingRef.current || saving) return

    // Never fail silently here — a mute return leaves "Open OneRep" looking
    // broken with no way back. Send them to whatever answer went missing.
    const missing = !draft.goal
      ? {
          stage: "goal" as StageId,
          message: "Pick a goal first — tap it below.",
        }
      : !experienceLevel
        ? {
            stage: "experience" as StageId,
            message: "Tell me how long you've been training.",
          }
        : !profile.sex
          ? {
              stage: "sex" as StageId,
              message: "I still need your baseline to do the maths.",
            }
          : null
    if (missing) {
      hapticHeavy()
      trackUmami("onboarding_blocked", { stage: missing.stage })
      setStage(stages.findIndex((item) => item.id === missing.stage))
      setError(missing.message)
      return
    }

    hapticHeavy()
    savingRef.current = true
    setSaving(true)
    try {
      await Promise.all([
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
        saveEnergyUnit({ unit: setupPreferences.energyUnit }),
        saveDashboardSettings({
          workoutFocus: setupPreferences.workoutFocus,
          simpleMode: setupPreferences.simpleMode,
        }),
      ])
      // Mark onboarding complete only after every preference save succeeds.
      await saveOnboarding({
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
      })
      safeLocalStorageRemove(POST_SIGNUP_ONBOARDING_KEY)
      safeLocalStorageRemove(ONBOARDING_DRAFT_KEY)
      safeLocalStorageRemove("onerep:setup-preferences")
      cacheEnergyUnit(setupPreferences.energyUnit)
      safeLocalStorageSet(COACH_ONBOARDING_SEEN_KEY, "true")
      trackUmami("onboarding_completed", {
        goal: draft.goal ?? "unset",
        experience: experienceLevel ?? "unset",
        nutrition_goal: effectiveNutritionGoal ?? "unset",
        tracking_mode: trackingMode ?? "unset",
        coach_messages: setupUsed,
        replay: coachReplay,
      })
      setComplete(true)
      hapticMedium()
      await new Promise((resolve) => window.setTimeout(resolve, 720))
      navigate(setupDestination ?? setupPreferences.destination, {
        replace: true,
      })
    } catch (saveError) {
      trackUmami("onboarding_save_failed")
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
    if (
      initialized &&
      ["preferences", "nutrition", "lifestyle"].includes(stageId)
    ) {
      return (
        <SetupPreferences
          section={stageId}
          value={setupPreferences}
          onChange={setSetupPreferences}
          theme={theme}
          setTheme={setTheme}
          weightUnit={weightUnit}
          setWeightUnit={setWeightUnit}
          waterGoalMl={waterGoalMl}
          setWaterGoalMl={setWaterGoalMl}
          onContinue={() => advance(stageIndex)}
        />
      )
    }
    // Until hydration settles, answering is unsafe: the effect above still
    // holds the right to overwrite every answer with what the server says.
    if (!initialized) {
      return (
        <div
          className="onboarding-chat-typing"
          role="status"
          aria-label="Loading your details"
        >
          <span />
          <span />
          <span />
        </div>
      )
    }
    if (stageId === "connections") {
      return (
        <div className="setup-connections">
          {(
            [
              [
                "health",
                "Health connections",
                "Connect Apple Health or Health Connect on supported devices; choose what to read and write.",
              ],
              [
                "reminders",
                "Reminders & Coach check-ins",
                "Set meal, training and body reminders, Coach nudges, and quiet hours.",
              ],
              [
                "privacy",
                "Privacy & sharing",
                "Choose analytics, personalized insights, and sharing preferences.",
              ],
              [
                "nutrition",
                "Nutrition strategy",
                "Configure net carbs, meal targets, macro cycling, and workout adjustments.",
              ],
              [
                "preferences",
                "Language, sound & feedback",
                "Choose app language, haptic strength, and rest timer feedback.",
              ],
              [
                "agents",
                "AI & integrations",
                "Configure your own AI key and connected tools.",
              ],
            ] as const
          ).map(([view, title, detail]) => (
            <button
              type="button"
              key={view}
              onClick={() => setSettingsView(view)}
            >
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
          <button
            type="button"
            className="onboarding-primary-button"
            onClick={() => advance(stageIndex)}
          >
            Continue <ArrowRight size={18} />
          </button>
        </div>
      )
    }
    if (stageId === "intro") {
      return (
        <button
          type="button"
          className="onboarding-primary-button onboarding-start-button"
          onClick={() => {
            hapticSelection()
            advance(stageIndex)
          }}
        >
          Let's go <ArrowRight size={20} aria-hidden="true" />
        </button>
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
            <CoachPreviewExchange />
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
    if (stageId === "import") {
      const importable =
        importPreview?.files.some((file) => file.kind !== "unsupported") ??
        false
      return (
        <>
          <div className="setup-import-guide">
            <h2>Choose your export</h2>
            <dl>
              <div>
                <dt>Hevy</dt>
                <dd>CSV export or API workout JSON</dd>
              </div>
              <div>
                <dt>Strong</dt>
                <dd>CSV export or JSON rows with Strong column names</dd>
              </div>
              <div>
                <dt>FitNotes</dt>
                <dd>CSV export or equivalent JSON rows</dd>
              </div>
              <div>
                <dt>Other apps</dt>
                <dd>
                  CSV or JSON with dates, exercises, sets, or body measurements
                </dd>
              </div>
            </dl>
            <p>
              Built-in parsers run without AI. Other formats may use AI to
              identify columns. Always review the preview before importing.
            </p>
            <label>
              Weights without a unit
              <select
                value={weightUnit}
                disabled={importBusy !== null || importPreview !== null}
                onChange={(event) =>
                  setWeightUnit(event.target.value as WeightUnit)
                }
              >
                <option value="kg">Kilograms</option>
                <option value="lbs">Pounds</option>
              </select>
            </label>
            <a href="/imports/workout-template.json" download>
              Download example workout JSON
            </a>
          </div>
          <div className="onboarding-chat-card">
            {importResult ? (
              <p className="native-row-detail">
                {describeImportResult(importResult)} It's in your history now.
                {importResult.workoutsSkipped > 0 &&
                  ` ${countNoun(importResult.workoutsSkipped, "workout")} didn't fit — two sessions a day is the ceiling.`}
              </p>
            ) : importPreview ? (
              <>
                <div>
                  {importPreview.files.map((file) => (
                    <div
                      key={file.uploadId}
                      className="flex min-h-12 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0"
                    >
                      <span className="native-row-title break-all">
                        {file.fileName}
                      </span>
                      <span className="native-row-detail max-w-[55%] text-right">
                        {describeImportFile(file)}
                        {file.note && (
                          <small className="block">{file.note}</small>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="onboarding-primary-button mt-4 w-full"
                  onClick={() => void runImportCommit()}
                  disabled={!importable || importBusy !== null}
                  aria-busy={importBusy === "importing"}
                >
                  {importBusy === "importing" ? (
                    "Filing it away…"
                  ) : (
                    <>
                      Bring it in
                      <Check size={16} weight="bold" />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="onboarding-back-button mt-2 w-full"
                  onClick={abandonImportPreview}
                  disabled={importBusy !== null}
                >
                  Never mind
                </button>
              </>
            ) : (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  multiple
                  accept=".csv,.json,text/csv,application/json"
                  className="sr-only"
                  aria-label="Choose export files"
                  onChange={(event) =>
                    void handleImportSelection(event.target.files)
                  }
                />
                <button
                  type="button"
                  className="onboarding-primary-button w-full"
                  disabled={importBusy !== null}
                  aria-busy={importBusy === "reading"}
                  onClick={() => {
                    hapticSelection()
                    importInputRef.current?.click()
                  }}
                >
                  {importBusy === "reading" ? (
                    "Reading your files…"
                  ) : (
                    <>
                      Choose files
                      <UploadSimple size={16} weight="bold" />
                    </>
                  )}
                </button>
              </>
            )}
            {importError && (
              <p
                role="alert"
                className="mt-3 border-l-2 border-destructive py-2 pl-3 text-[14px] font-medium text-destructive"
              >
                {importError}
              </p>
            )}
          </div>
          <QuickReplies
            options={[
              {
                value: "continue",
                label: importResult ? "Keep going" : "Start fresh",
                icon: ArrowRight,
              },
            ]}
            onChoose={() => advance(stageIndex)}
          />
        </>
      )
    }
    if (stageId === "assistant") {
      const remaining = SETUP_MESSAGE_LIMIT - setupUsed
      return (
        <div className="onboarding-setup-chat">
          {aiUnavailable && (
            <div className="onboarding-chat-bubble onboarding-chat-bubble-coach">
              <span>
                One catch: this server doesn't have an AI key of its own, so I
                can't build anything just yet. After setup, paste your own
                OpenRouter key in Settings and all of this works — on your key,
                with no monthly cap.
              </span>
            </div>
          )}
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
                  // Nobody starts a session mid-setup; send them to the list.
                  onStartWorkout={() => handleSetupUiAction("open_workouts")}
                  onOpenNutrition={() => handleSetupUiAction("open_nutrition")}
                  onOpenProgress={() => handleSetupUiAction("open_progress")}
                  onOpenSupplements={() =>
                    handleSetupUiAction("open_supplements")
                  }
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
          {setupMessages.length === 0 && !setupBusy && !aiUnavailable && (
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
          {remaining > 0 && !aiUnavailable && (
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
          {!aiUnavailable && (
            <p className="onboarding-setup-quota" aria-live="polite">
              {remaining > 0
                ? `${remaining} of ${SETUP_MESSAGE_LIMIT} messages left`
                : "Message limit reached. You can keep chatting in Coach later."}
            </p>
          )}
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
        <div className="setup-review-list">
          {stages
            .filter(
              (item) => !["intro", "review", "assistant"].includes(item.id)
            )
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  rewindTo(stages.findIndex((step) => step.id === item.id))
                }
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {item.id === "preferences"
                      ? `${theme} · ${weightUnit} · ${setupPreferences.energyUnit} · ${setupPreferences.workoutFocus}`
                      : item.id === "nutrition"
                        ? `${dietType} · ${trackingMode.replaceAll("_", " ")}`
                        : item.id === "lifestyle"
                          ? `${mealFrequency} meals · ${waterGoalMl} ml water · ${budget} budget`
                          : (stageAnswers[item.id] ?? "Review choices")}
                  </small>
                </span>
                <PencilSimple size={18} aria-hidden="true" />
              </button>
            ))}
        </div>
        <div className="onboarding-review-card">
          <div className="onboarding-review-hero">
            <p className="native-supporting">Calories</p>
            <p className="native-summary-value mt-1 tabular-nums">
              {preview?.targetCalories != null
                ? energyDisplay(
                    preview.targetCalories,
                    energyUnit
                  ).toLocaleString()
                : "Calculating…"}
              {preview?.targetCalories != null ? ` ${energyUnit}` : ""}
            </p>
            <p className="native-row-detail mt-2">
              {preview?.calorieStrategy ??
                "Calculating your starting budget from your profile."}
            </p>
          </div>
          {[
            [
              "Maintenance estimate",
              preview
                ? `${energyDisplay(preview.tdee, energyUnit).toLocaleString()} ${energyUnit}`
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
              <span className="native-row-value text-right">{value}</span>
            </div>
          ))}
        </div>
        {/*
          Above the consent box, not below it: the targets are on screen, they
          were produced by arithmetic rather than a clinician, and that is
          worth saying before somebody agrees to anything. The chat line at the
          top of this step says a version of it too, but that scrolls away.
        */}
        <MedicalDisclaimer tone="panel" />
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
            may qualify as health data. When I choose an AI feature, prompts,
            selected account context, and submitted images are sent to
            OpenRouter, which routes them to the selected model provider,
            currently OpenAI; both may process the request. AI is optional and
            core tracking remains available without it. I can withdraw consent
            with future effect by deleting affected data or my account, or by
            contacting{" "}
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
              Open OneRep
              <Check size={16} weight="bold" />
            </>
          )}
        </button>
      </div>
    )
  }

  const activeStage = stages[stage]
  const titles: Record<StageId, string> = {
    intro: "Your whole routine. One place.",
    preferences: "Make OneRep yours.",
    goal: "What are you working toward?",
    experience: "Start where you are.",
    coach: "Meet your Coach.",
    sex: "Personalize your targets.",
    measurements: "Your starting point.",
    activity: "Find your rhythm.",
    safety: "Your wellbeing comes first.",
    connections: "Connect the rest of your routine.",
    nutrition: "Food that fits your life.",
    lifestyle: "Build an everyday rhythm.",
    import: "Bring your progress.",
    assistant: "Build your first plan.",
    review: "Ready for your first day.",
  }
  if (settingsView)
    return (
      <Suspense
        fallback={
          <div role="status" className="p-8">
            Loading settings…
          </div>
        }
      >
        <SetupSettings
          setupView={settingsView}
          setupWearableConsent={consent.wearableIntegrations}
          onSetupWearableConsentChange={async (next) => {
            setConsent((current) => ({
              ...current,
              wearableIntegrations: next,
            }))
          }}
          onClose={() => setSettingsView(null)}
        />
      </Suspense>
    )
  return (
    <main className="setup-shell bg-background text-foreground">
      {complete && (
        <div
          className="onboarding-complete"
          role="status"
          aria-live="assertive"
        >
          <Check size={30} />
          <p>Your plan is ready</p>
        </div>
      )}
      <aside className="setup-sidebar">
        <div className="setup-brand">
          <img src="/app-icon.svg" alt="" width="32" height="32" />
          <strong>OneRep</strong>
          <span>Your setup</span>
        </div>
        <nav aria-label="Setup steps">
          <ol>
            {stages.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={index === stage ? "step" : undefined}
                  disabled={index > Math.max(stage, returnStage ?? 0)}
                  onClick={() => rewindTo(index)}
                >
                  <span className="setup-step-number">
                    {index < stage ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <p>
          Built around you.
          <br />
          Change your preferences anytime in Settings.
        </p>
      </aside>
      <section className="setup-main">
        <header className="setup-topbar">
          <button
            type="button"
            disabled={stage === 0 || saving}
            onClick={() => {
              setReturnStage(null)
              setStage((current) => Math.max(0, current - 1))
            }}
          >
            Back
          </button>
          <span>
            {coachReplay
              ? "Coach onboarding preview"
              : `${stage + 1} of ${stages.length} · ${activeStage.label}`}
          </span>
          {coachReplay && (
            <button
              type="button"
              onClick={() => navigate("/settings", { replace: true })}
            >
              Exit
            </button>
          )}
        </header>
        <div
          className="setup-progress"
          role="progressbar"
          aria-label="Profile setup progress"
          aria-valuemin={1}
          aria-valuemax={stages.length}
          aria-valuenow={stage + 1}
        >
          <span style={{ transform: `scaleX(${(stage + 1) / stages.length})` }} />
        </div>
        <div id="setup-content" className="setup-content">
          <div className="setup-page" data-stage={activeStage.id}>
            <h1 id="setup-heading" tabIndex={-1}>
              {titles[activeStage.id]}
            </h1>
            <div className="setup-description">
              {stageMessages[activeStage.id].map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
            {activeStage.id === "intro" && (
              <div className="setup-feature-list">
                {[
                  [
                    "Train",
                    "Log sets, build routines, schedule workouts, and follow your strength over time.",
                  ],
                  [
                    "Eat",
                    "Track meals with search, barcodes or photos. Save recipes, plan meals, and build grocery lists.",
                  ],
                  [
                    "Recover",
                    "Track water, body measurements, fasting, and health trends. Connect supported health sources from Settings.",
                  ],
                  [
                    "Progress",
                    "Bring your history, follow your goals, and customize your dashboard and progress trackers.",
                  ],
                  [
                    "Coach",
                    "Ask questions with your own context, create plans, and review proposed changes. AI is optional.",
                  ],
                ].map(([title, description]) => (
                  <div key={title}>
                    <h2>{title}</h2>
                    <p>{description}</p>
                  </div>
                ))}
              </div>
            )}
            {error && activeStage.id !== "review" && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <div className="setup-controls">
              {renderInput(activeStage.id, stage)}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
