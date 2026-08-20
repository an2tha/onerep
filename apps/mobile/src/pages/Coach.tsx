import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation } from "react-router"
import { createPortal, flushSync } from "react-dom"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  ArrowRight,
  Barbell,
  ArrowClockwise,
  Brain,
  CaretDown,
  Carrot,
  ChartLineUp,
  Check,
  ChatCircleDots,
  ArrowLeft,
  CheckCircle,
  Circle,
  ClockCounterClockwise,
  CookingPot,
  ChefHat,
  Heartbeat,
  ForkKnife,
  LightbulbFilament,
  Microphone,
  Minus,
  PaperPlaneTilt,
  Plus,
  PushPin,
  SneakerMove,
  Sparkle,
  StopCircle,
  Timer,
  TrendDown,
  TrendUp,
  TrashSimple,
  VideoCamera,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
// The same file the backend validates against, so the picker can never offer
// a model the server would turn away.
import modelCatalog from "../../../../convex/ai/models.json"
import { toast } from "@repo/ui"
import {
  cn,
  createClientId,
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "@/lib/utils"
import { useAiFeatureGate } from "@/lib/ai-access"
import { trackUmami, usageBucket } from "@/lib/analytics"
import { useSmoothNavigate } from "@/lib/navigation"
import { TourAnchor, useTourAnchor } from "@/components/walkthrough/tour-anchor"
import {
  currentDateKey,
  detectTimeZone,
  type FoodLogEntry,
} from "@/lib/food-log"
import { normalizeScheduleRoutines, type Day } from "@/lib/workout-sync"
import { searchExercises, type Exercise } from "@/lib/exercise-catalog"
import { useCoachContext, type CoachContext } from "@/lib/coach-context"
import type { AgentWorkoutDraft } from "@/lib/workout-logging"
import {
  FORM_COACH_AI_COST,
  matchFormCoachExercise,
  type FormCoachExercise,
} from "@/lib/form-coach"
import {
  clearFormCoachDraft,
  startFormCoachDraft,
  useFormCoachDraft,
} from "@/lib/form-coach-clips"
import { subscribeToFormCoachMessages } from "@/lib/form-coach-message"
import { FormCoachRecorder } from "@/components/form-coach-recorder"
import { FormCoachReviewSheet } from "@/components/form-coach-review-sheet"
import { FormCoachPoseConfirm } from "@/components/form-coach-pose-confirm"
import {
  hapticHeavy,
  hapticMedium,
  hapticSelection,
  hapticTap,
} from "@/lib/haptics"
import { useCoachDictation } from "@/lib/use-coach-dictation"
import {
  COACH_MAX_MESSAGE_CHARS,
  normalizeCoachOperations as normalizeSharedCoachOperations,
  validateCoachOperations as validateSharedCoachOperations,
} from "@repo/models"
import {
  COACH_CONVERSATION_KEY,
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
  type CoachGoalTaskDraft,
  type CoachMessage,
  type CoachOperation,
  type CoachOperationResult,
  type CoachUiAction,
  type GuidedCoachIntent,
  type RecipeCustomization,
} from "@/lib/coach-chat"

const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
type CoachMode = "chat" | "chef" | "personal_trainer"

const COACH_MODES = [
  {
    id: "chat",
    label: "Briefing",
    heading: "Your performance briefing",
    placeholder: "Ask Coach anything…",
    icon: PaperPlaneTilt,
    centerArt: ChatCircleDots,
    leftArt: LightbulbFilament,
    rightArt: ChartLineUp,
    tabClass: "border-violet-400/35",
    artClass: "text-violet-500/[0.10]",
    centerArtClass: "bg-violet-500/[0.05] text-violet-600/55",
    messageClass: "border-violet-500/16",
    composerClass: "focus-within:border-violet-500/25",
    cardClass: "border-violet-200/15 bg-indigo-950/55",
    cardIconClass: "border-violet-200/20 text-violet-100/65",
  },
  {
    id: "chef",
    label: "Nutrition",
    heading: "Your nutrition briefing",
    placeholder: "Ask about meals, recipes, or nutrition…",
    icon: ForkKnife,
    centerArt: ChefHat,
    leftArt: Carrot,
    rightArt: CookingPot,
    tabClass: "border-amber-400/35",
    artClass: "text-amber-600/[0.10]",
    centerArtClass: "bg-amber-500/[0.05] text-amber-700/55",
    messageClass: "border-amber-500/16",
    composerClass: "focus-within:border-amber-500/25",
    cardClass: "border-amber-200/20 bg-[#1d0d08]/60",
    cardIconClass: "border-amber-200/20 text-amber-100/65",
  },
  {
    id: "personal_trainer",
    label: "Training",
    heading: "Your training briefing",
    placeholder: "Ask about workouts, form, or recovery…",
    icon: Barbell,
    centerArt: Barbell,
    leftArt: SneakerMove,
    rightArt: Timer,
    tabClass: "border-sky-400/35",
    artClass: "text-sky-600/[0.10]",
    centerArtClass: "bg-sky-500/[0.05] text-sky-700/55",
    messageClass: "border-sky-500/16",
    composerClass: "focus-within:border-sky-500/25",
    cardClass: "border-cyan-200/20 bg-[#03141f]/62",
    cardIconClass: "border-cyan-200/20 text-cyan-100/65",
  },
] as const

const COACH_STARTERS = [
  {
    title: "Plan my day",
    prompt: "What should I focus on today based on my recent activity?",
    icon: Heartbeat,
  },
  {
    title: "Check progress",
    prompt: "How is my progress trending, and what should I watch next?",
    icon: ChartLineUp,
  },
  {
    title: "Explore a scenario",
    prompt:
      "Help me explore a change to my goals or routine without saving anything.",
    icon: LightbulbFilament,
  },
  {
    title: "Today’s check-in",
    prompt: null,
    icon: CheckCircle,
  },
] as const

const CHEF_STARTERS = [
  {
    title: "Review nutrition",
    prompt: "Review my recent nutrition and give me one thing to improve.",
    icon: ChartLineUp,
  },
  {
    title: "Create a recipe",
    prompt:
      "Create a practical recipe that fits my nutrition goals and saved preferences.",
    icon: CookingPot,
  },
  {
    title: "Plan my meals",
    prompt: "Help me plan simple meals for the next few days.",
    icon: ForkKnife,
  },
  {
    title: "Use what I have",
    prompt: "Help me make a meal from ingredients I already have.",
    icon: Carrot,
  },
] as const

const TRAINER_STARTERS = [
  {
    title: "Analyze training",
    prompt: "Analyze my training this week and suggest my next workout.",
    icon: ChartLineUp,
  },
  {
    title: "Plan a workout",
    prompt: "Build a workout for me based on my routine and recent training.",
    icon: Barbell,
  },
  {
    title: "Validate my routine",
    prompt:
      "Validate my current weekly routine for recovery, balance, duration, and volume.",
    icon: CheckCircle,
  },
  {
    title: "Adjust for recovery",
    prompt: "Adapt my next workout to my latest recovery and training data.",
    icon: Heartbeat,
  },
] as const

const BEGINNER_SETUP_STARTERS = [
  {
    title: "Build my workout plan",
    prompt:
      "Help me set up my first workout plan. Ask only the essential questions about my schedule, equipment, and limitations, then give me a simple plan I can save.",
    icon: Barbell,
  },
  {
    title: "Set up easy recipes",
    prompt:
      "Help me set up a few beginner-friendly recipes. Use what you already know about my safety needs, then ask only about food preferences, budget, and cooking access.",
    icon: ForkKnife,
  },
] as const

/**
 * The week as seven marks instead of a sentence. Seven days is small enough
 * that you read the shape before you read the number, which is the point.
 */
function CoachWeekStrip({ days }: { days: CoachContext["weekDays"] }) {
  return (
    <div className="mt-2 flex items-end gap-[3px]" aria-hidden="true">
      {days.map((day) => (
        <span
          key={day.date}
          className={cn(
            "h-4 flex-1 rounded-[2px] transition-colors",
            day.trained
              ? "bg-foreground/80"
              : day.today
                ? "bg-foreground/25"
                : "bg-foreground/12"
          )}
        />
      ))}
    </div>
  )
}

/**
 * One tile, one subject. Two of them is the whole briefing: the same number
 * printed twice in two sizes is not two facts.
 */
function CoachBriefTile({
  label,
  value,
  detail,
  fill,
  children,
  onClick,
}: {
  label: string
  value: string
  /** Only where the number does not already say it. */
  detail?: string
  /** 0-1, or null for tiles that are not a proportion of anything. */
  fill: number | null
  children?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="coach-brief-tile motion-tactile flex min-h-[6rem] flex-col justify-between rounded-2xl p-4 text-left"
    >
      <p className="text-[11px] font-medium text-foreground/50">{label}</p>
      <div className="mt-3">
        <p className="truncate text-[19px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
          {value}
        </p>
        {detail ? (
          <p className="mt-1 truncate text-[11px] leading-4 text-foreground/45">
            {detail}
          </p>
        ) : null}
        {children}
        {fill === null ? null : (
          <span className="mt-3 block h-[3px] w-full overflow-hidden rounded-full bg-foreground/12">
            <span
              className="block h-full rounded-full bg-foreground/70"
              style={{
                width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`,
              }}
            />
          </span>
        )}
      </div>
    </button>
  )
}

function relativeDay(date: string) {
  const days = Math.round(
    (Date.parse(`${currentDateKey()}T12:00:00Z`) -
      Date.parse(`${date}T12:00:00Z`)) /
      86400000
  )
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  return `${days} days ago`
}

function timeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning."
  if (hour < 18) return "Good afternoon."
  return "Good evening."
}

/** Survives navigation and new chats: pick a model once, keep it. */
const COACH_MODEL_KEY = "onerep:coach-model:v1"

function storedCoachModel() {
  const stored = safeLocalStorageGet(COACH_MODEL_KEY)
  return modelCatalog.some((entry) => entry.id === stored)
    ? (stored as string)
    : modelCatalog[0].id
}

function coachConversationKey(mode: CoachMode) {
  return mode === "chat"
    ? COACH_CONVERSATION_KEY
    : `${COACH_CONVERSATION_KEY}:${mode}`
}

function loadCoachConversation(mode: CoachMode): CoachMessage[] {
  const stored = safeLocalStorageGet(coachConversationKey(mode))
  if (!stored) return []
  try {
    const value = JSON.parse(stored) as unknown
    if (!Array.isArray(value)) return []
    return value
      .filter((message): message is CoachMessage =>
        Boolean(
          message &&
          typeof message === "object" &&
          ((message as CoachMessage).role === "user" ||
            (message as CoachMessage).role === "assistant") &&
          typeof (message as CoachMessage).content === "string"
        )
      )
      .slice(-20)
  } catch {
    return []
  }
}

function CoachLoadingState() {
  return (
    <div
      className="m-auto flex items-center gap-3 text-muted-foreground"
      role="status"
      aria-label="Loading Coach"
    >
      <span className="size-2 animate-pulse rounded-full bg-current" />
      <span className="text-[12px] font-medium">Connecting your data…</span>
    </div>
  )
}

/** Matches the `sheet-panel-exit` animation duration in the shared CSS. */
const COACH_SHEET_EXIT_MS = 320

function CoachSheet({
  title,
  open,
  onClose,
  mode,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  mode: CoachMode
  children: ReactNode
}) {
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // The sheet has to outlive `open` so the exit animation can play out.
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
      return
    }
    if (!rendered) return
    setClosing(true)
    const exitTimer = window.setTimeout(() => {
      setRendered(false)
      setClosing(false)
    }, COACH_SHEET_EXIT_MS)
    return () => window.clearTimeout(exitTimer)
  }, [open, rendered])

  useEffect(() => {
    if (!rendered) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusFrame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus()
    )

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [rendered])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [onClose, open])

  if (!rendered || typeof document === "undefined") return null
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-end bg-black/45 lg:items-center lg:p-6",
        closing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          "coach-swoosh-surface coach-sheet-surface max-h-[82svh] w-full origin-bottom overflow-y-auto overscroll-contain rounded-t-[26px] bg-background p-5 pb-[max(1.5rem,var(--app-safe-bottom))] shadow-2xl lg:mx-auto lg:max-w-xl lg:rounded-[26px] lg:pb-5",
          closing ? "sheet-panel-exit" : "sheet-panel-enter"
        )}
        data-coach-mode={mode}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-[17px] font-black">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex size-10 items-center justify-center rounded-full bg-muted"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Asks which lift the coach is about to be shown.
 *
 * The recorder needs an exercise before it can name what it is filming. The
 * workout screen has one to hand; the composer does not, so the button stops
 * here once and then gets out of the way.
 */
function FormCoachPicker({
  supported,
  onPick,
}: {
  supported: FormCoachExercise[] | undefined
  onPick: (exercise: Exercise, movement: FormCoachExercise) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Exercise[]>([])
  const [searching, setSearching] = useState(true)

  useEffect(() => {
    let cancelled = false
    setSearching(true)
    // The first list is wanted immediately; everything after it is a keystroke
    // and can wait for the user to stop typing.
    const timer = window.setTimeout(
      () => {
        void searchExercises({
          query,
          categories: ["strength", "core", "mobility"],
          limit: 14,
        })
          .then((found) => {
            if (cancelled) return
            setResults(found)
            setSearching(false)
          })
          .catch(() => {
            if (!cancelled) setSearching(false)
          })
      },
      query ? 220 : 0
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  return (
    <>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Pick the lift. You’ll film up to three angles, and the coach measures
        the joints rather than taking your word for it.
      </p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search exercises"
        aria-label="Search exercises to film"
        className="mt-3 min-h-11 w-full rounded-xl border border-border/60 bg-card px-3 text-[12px] outline-none"
      />
      {results.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-muted-foreground">
          {searching ? "Looking…" : "Nothing by that name."}
        </p>
      ) : (
        <div className="mt-2 divide-y divide-border/45">
          {results.map((exercise) => {
            // Null only while the movement catalog is still loading, which is
            // the one state in which starting a draft would have no slug.
            const movement = matchFormCoachExercise(exercise.name, supported)
            return (
              <button
                key={exercise.id}
                type="button"
                disabled={!movement}
                onClick={() => movement && onPick(exercise, movement)}
                className="flex min-h-14 w-full items-center gap-3 py-3 text-left disabled:opacity-45"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-bold">
                    {exercise.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {exercise.muscle}
                  </span>
                </span>
                <VideoCamera
                  size={15}
                  weight="fill"
                  className="shrink-0 text-muted-foreground"
                />
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

/**
 * The coach, whole. Normally a route of its own; `embedded` lets the live
 * workout mount the same screen inside a sheet, because a lifter mid-session
 * needs the real thing — memories, history, the mode tabs — and cannot afford
 * a navigation that would tear down the running workout.
 */
/**
 * Elapsed seconds for the analytics on a reply. The clock is read here, at
 * module scope, rather than inside the component: a bare `Date.now()` in a
 * component body reads as impure render work to the compiler even when it only
 * ever runs from an event handler.
 */
function startReplyTimer() {
  const started = Date.now()
  return () => Math.round((Date.now() - started) / 1000)
}

/**
 * A coach workout operation, rewritten as the draft the live workout speaks.
 * Same shape the active-workout Ask Coach path already applies.
 */
function workoutDraftFromOperation(
  operation: CoachOperation
): AgentWorkoutDraft | null {
  if (operation.type !== "create_workout_preset") return null
  const exercises = (operation.exercises ?? [])
    .filter((exercise) => exercise.name?.trim())
    .map((exercise) => ({
      name: exercise.name.trim(),
      sets: (exercise.sets ?? []).map((set) => ({
        type: set.type,
        weight: set.weight,
        reps: set.reps,
        restSeconds: set.restSeconds,
      })),
    }))
  if (exercises.length === 0) return null
  return { name: operation.name?.trim() || "Coach's workout", exercises }
}

export default function Coach({
  embedded = false,
  onClose,
  activeWorkout,
  initialInput,
}: {
  embedded?: boolean
  onClose?: () => void
  /**
   * What to put in the composer on open, unsent. The route form of this
   * arrives through `location.state`; a sheet has no navigation to carry it,
   * so it comes in as a prop and lands in the same place.
   */
  initialInput?: string
  /**
   * Present when Coach is open over a running session. It carries the live
   * state (which only this device knows) into the prompt, and takes back any
   * plan Coach proposes for the remaining work.
   */
  activeWorkout?: {
    summary: string
    applying: boolean
    onApply: (draft: AgentWorkoutDraft) => Promise<void> | void
  }
} = {}) {
  const { context, loading } = useCoachContext()
  const navigate = useSmoothNavigate()
  const coachHeaderRef = useTourAnchor("coach-header")
  const activeWorkouts = useQuery(api.logs.activeWorkout.getAllActive, {})
  const hasActiveWorkout = (activeWorkouts?.length ?? 0) > 0
  const coachModesRef = useTourAnchor("coach-modes")
  const location = useLocation()
  const todayKey = currentDateKey(detectTimeZone())
  const presets = useQuery(api.logs.presets.list, {})
  const schedule = useQuery(api.users.schedules.get, {})
  const recipes = useQuery(api.logs.recipes.list, {})
  const recentFoodDays = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: todayKey,
    limit: 14,
  })
  const todayWorkouts = useQuery(api.logs.workouts.getLog, { date: todayKey })
  const recentWorkouts = useQuery(api.logs.workouts.getHistory)
  const memories = useQuery(api.ai.coachState.listMemories, { limit: 40 })
  const checkIns = useQuery(api.ai.coachState.listCheckIns, { limit: 14 })
  const goals = useQuery(api.ai.coachGoals.listActive, { limit: 20 })
  const actionHistory = useQuery(api.ai.coachState.listActionHistory, {
    limit: 30,
  })
  const [input, setInput] = useState("")
  const [recipeCustomization, setRecipeCustomization] =
    useState<RecipeCustomization | null>(null)
  const [guidedIntent, setGuidedIntent] = useState<GuidedCoachIntent | null>(
    null
  )
  const [recipeCustomizationClosing, setRecipeCustomizationClosing] =
    useState(false)
  const [busy, setBusy] = useState(false)
  const [applyingMessageIndex, setApplyingMessageIndex] = useState<
    number | null
  >(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState("")
  const [showMemory, setShowMemory] = useState(false)
  const [showFormCoach, setShowFormCoach] = useState(false)
  const [newMemoryCategory, setNewMemoryCategory] = useState("preference")
  const [newMemoryValue, setNewMemoryValue] = useState("")
  const [savingMemory, setSavingMemory] = useState(false)
  const [activeMode, setActiveMode] = useState<CoachMode>("chat")
  const [chatModel, setChatModel] = useState(storedCoachModel)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  // A hand-rolled dropdown owes the two dismissals a native one gives for
  // free: tap anywhere else, or Escape.
  useEffect(() => {
    if (!modelMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModelMenuOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [modelMenuOpen])
  const [modeSwipeDirection, setModeSwipeDirection] = useState<
    "forward" | "back"
  >("forward")
  const [modeTransitioning, setModeTransitioning] = useState(false)
  const [carouselBackgroundPhase, setCarouselBackgroundPhase] = useState<
    "idle" | "out" | "in"
  >("idle")
  const coachSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const [workoutPlanDraft, setWorkoutPlanDraft] =
    useState<AgentWorkoutDraft | null>(null)
  const [newChatPhase, setNewChatPhase] = useState<
    "idle" | "appear" | "open" | "suck" | "out"
  >("idle")
  const newChatTimersRef = useRef<number[]>([])
  const [messages, setMessages] = useState<CoachMessage[]>(() =>
    loadCoachConversation("chat")
  )
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null)
  const {
    attachment,
    attachmentRef,
    fileInputRef,
    attachImage,
    clearAttachment,
    openImagePicker,
  } = useCoachAttachment()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recipeHandoffHandled = useRef(false)
  const generateChat = useAction(
    api.ai.metricGeneration.generateCoachChatMessage
  )
  const applyCoachOperations = useAction(api.ai.coachOperations.applyApproved)
  const saveRecipe = useMutation(api.logs.recipes.save)
  const addFoodEntry = useMutation(api.logs.foodLogs.addEntry)
  const updateFoodEntry = useMutation(api.logs.foodLogs.updateEntry)
  const removeFoodEntry = useMutation(api.logs.foodLogs.removeEntry)
  const createPreset = useMutation(api.logs.presets.create)
  const updatePreset = useMutation(api.logs.presets.update)
  const setSchedule = useMutation(api.users.schedules.set)
  const recordAction = useMutation(api.ai.coachState.recordAction)
  const undoCoachAction = useMutation(api.ai.coachState.undoAction)
  const setMemory = useMutation(api.ai.coachState.setMemory)
  const removeMemory = useMutation(api.ai.coachState.removeMemory)

  useEffect(() => {
    if (recipeHandoffHandled.current) return
    const state = location.state as {
      coachMode?: CoachMode
      recipeCustomization?: RecipeCustomization
      guidedIntent?: GuidedCoachIntent
      initialInput?: string
      /** Ask it on arrival rather than leaving it sitting in the composer. */
      autoSend?: boolean
    } | null
    if (!state?.coachMode) return
    // A handoff carries either a subject to work on, or a question to ask.
    // Anything else is a plain navigation that should not touch this state.
    if (
      !state.recipeCustomization &&
      !state.guidedIntent &&
      !state.initialInput
    )
      return
    recipeHandoffHandled.current = true
    setActiveMode(state.coachMode)
    setMessages(loadCoachConversation(state.coachMode))
    setRecipeCustomizationClosing(false)
    setRecipeCustomization(state.recipeCustomization ?? null)
    setGuidedIntent(state.guidedIntent ?? null)
    setInput(state.autoSend ? "" : (state.initialInput ?? ""))
    if (state.autoSend && state.initialInput) {
      setPendingAutoSend(state.initialInput)
      return
    }
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [location.state])

  /**
   * Sent from the effect below rather than the one above, so the send happens
   * on a render where the loaded conversation is already state. Submitting
   * inside the handoff would post the question against whatever history the
   * previous render was holding.
   */
  const [pendingAutoSend, setPendingAutoSend] = useState<string | null>(null)
  useEffect(() => {
    if (pendingAutoSend === null) return
    setPendingAutoSend(null)
    // `submit` gates on AI access itself, so a free account gets the paywall
    // rather than a silent no-op.
    void submit(pendingAutoSend)
  }, [pendingAutoSend])
  const saveCheckIn = useMutation(api.ai.coachState.saveCheckIn)
  const saveWeeklyPlan = useMutation(api.ai.coachState.saveWeeklyPlan)
  const saveCoachGoal = useMutation(api.ai.coachGoals.save)
  const setCoachGoalPinned = useMutation(api.ai.coachGoals.setPinned)
  const setDashboardWidgetPinned = useMutation(api.dashboardWidgets.setPinned)
  const { requireAiAccess, aiAccessModal, aiAccessLoading, aiUsage } =
    useAiFeatureGate()
  const dictation = useCoachDictation({
    value: input,
    onChange: updateComposer,
  })

  const formCoachMovements = useQuery(api.ai.formCoach.listSupported, {})
  const formCoachDraft = useFormCoachDraft()
  // A form analysis spends more than one AI request, so affordability is
  // checked as the camera opens rather than at send time — being told the
  // coach cannot be paid for after filming would waste the take.
  const formCoachOpening =
    formCoachDraft?.phase === "recording" && formCoachDraft.clips.length === 0
  useEffect(() => {
    if (!formCoachOpening || aiAccessLoading) return
    if (!requireAiAccess(FORM_COACH_AI_COST, "form_coach"))
      clearFormCoachDraft()
  }, [formCoachOpening, aiAccessLoading, requireAiAccess])

  // The report is written into the conversation by the pose confirmation, which
  // has no idea a coach is on screen. Take delivery directly, or the persist
  // effect below would write this page's stale history back over it.
  useEffect(
    () =>
      subscribeToFormCoachMessages((message) => {
        setMessages((current) => [...current, message].slice(-20))
      }),
    []
  )

  // Seeded once. Re-running it would wipe out whatever the user had started
  // typing every time the sheet re-rendered.
  const seededInput = useRef(false)
  useEffect(() => {
    if (!initialInput || seededInput.current) return
    seededInput.current = true
    setInput(initialInput)
    requestAnimationFrame(() => {
      const composer = composerRef.current
      if (!composer) return
      composer.focus()
      // Caret after the prompt, not in front of it: the seed is a lead-in the
      // user finishes, not something they have to click past.
      composer.setSelectionRange(initialInput.length, initialInput.length)
    })
  }, [initialInput])

  useEffect(() => {
    const end = messagesEndRef.current
    // The outgoing copy of this page mounts a second time inside the router's
    // exit frame, where this effect would smooth-scroll a transcript nobody
    // can see — dragging the whole screen around as it slides away. That copy
    // is inert; this one is not.
    if (!end || end.closest("[inert]")) return
    end.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [busy, messages.length])

  useEffect(() => {
    safeLocalStorageSet(
      coachConversationKey(activeMode),
      JSON.stringify(messages)
    )
  }, [activeMode, messages])

  useEffect(
    () => () => newChatTimersRef.current.forEach(window.clearTimeout),
    []
  )

  const coachWorkspace = useMemo(() => {
    const presetRows = (presets ?? []).map((preset) => ({
      id: String(preset._id),
      name: preset.name,
      updatedAt: preset.updatedAt,
      snapshot: {
        items: preset.items,
        exerciseData: preset.exerciseData,
        ...(preset.focus ? { focus: preset.focus } : {}),
        ...(preset.duration ? { duration: preset.duration } : {}),
        ...(preset.steps ? { steps: preset.steps } : {}),
      },
    }))
    const byId = new Map(presetRows.map((preset) => [preset.id, preset.name]))
    const routines = normalizeScheduleRoutines(schedule?.routine)
    return {
      today: todayKey,
      presets: presetRows,
      recipes: (recipes ?? []).slice(0, 30).map((recipe) => ({
        id: String(recipe._id),
        name: recipe.name,
        updatedAt: recipe.updatedAt,
        ...(recipe.servings ? { servings: recipe.servings } : {}),
        ingredients: recipe.ingredients.map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          grams: ingredient.grams,
          caloriesPer100: ingredient.caloriesPer100,
          proteinPer100: ingredient.proteinPer100,
          carbsPer100: ingredient.carbsPer100,
          fatPer100: ingredient.fatPer100,
        })),
      })),
      foodEntries: (recentFoodDays ?? []).flatMap((day) =>
        (day.entries as FoodLogEntry[]).slice(-12).map((entry) => ({
          id: entry.id,
          date: day.date,
          name: entry.name,
          meal: entry.meal,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
        }))
      ),
      memories: (memories ?? []).map((memory) => ({
        key: memory.key,
        category: memory.category,
        value: memory.value,
      })),
      checkIns: (checkIns ?? []).map((checkIn) => ({
        date: checkIn.date,
        energy: checkIn.energy,
        soreness: checkIn.soreness,
        sleepQuality: checkIn.sleepQuality,
        mood: checkIn.mood,
      })),
      goals: (goals ?? []).map((goal) => ({
        id: String(goal._id),
        title: goal.title,
        ...(goal.description ? { detail: goal.description } : {}),
        startDate: goal.startDate,
        endDate: goal.endDate,
        durationDays: goal.durationDays,
        pinned: goal.pinned,
        status: goal.status,
        tasks: goal.tasks.map((task) => ({
          title: task.title,
          ...(task.detail ? { detail: task.detail } : {}),
          completed: task.completed,
        })),
      })),
      recentWorkouts: (recentWorkouts ?? []).slice(0, 30).map((workout) => ({
        id: String(workout._id),
        date: workout.date,
        durationMinutes: Math.round(workout.durationSeconds / 60),
        exercises: workout.exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          completedSets: exercise.sets.filter((set) => set.completed).length,
          sets: exercise.sets,
        })),
      })),
      recentActions: (actionHistory ?? []).map((event) => ({
        id: String(event._id),
        summary: event.summary,
        status: event.status,
      })),
      routine: DAYS.map((day) => ({
        day,
        presetId: routines.primary[day],
        presetName: routines.primary[day]
          ? (byId.get(routines.primary[day] as string) ?? null)
          : null,
      })),
    }
  }, [
    checkIns,
    actionHistory,
    goals,
    memories,
    presets,
    recentFoodDays,
    recentWorkouts,
    recipes,
    schedule,
    todayKey,
  ])

  async function executeOperations(operations: CoachOperation[]) {
    const signature = JSON.stringify(operations)
    let hash = 2166136261
    for (let index = 0; index < signature.length; index += 1) {
      hash ^= signature.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (await applyCoachOperations({
      requestId: `coach-${(hash >>> 0).toString(36)}`,
      operations,
    })) as CoachOperationResult[]
    /* The old client executor remains below for one release as rollback-only
       code, but is unreachable. All authoritative writes now run in Convex.
    const expandedOperations = expandWorkoutPlanOperations(operations)
    const validationErrors = validateCoachOperations(expandedOperations)
    if (validationErrors.length > 0) throw new Error(validationErrors[0])
    const results: CoachOperationResult[] = []
    const knownPresets = new Map(
      (presets ?? []).map((preset) => [
        preset.name.trim().toLowerCase(),
        String(preset._id),
      ])
    )
    const originalRoutines = normalizeScheduleRoutines(schedule?.routine)
    let routine = originalRoutines.primary
    let routineChanged = false
    const presetOrder = (schedule?.presetOrder ?? []).map(String)

    const orderedOperations = [...expandedOperations].sort((left, right) => {
      const priority = (operation: CoachOperation) =>
        operation.type === "create_workout_preset"
          ? 0
          : operation.type === "update_routine"
            ? 2
            : 1
      return priority(left) - priority(right)
    })

    for (const operation of orderedOperations) {
      if (operation.type === "save_goal") {
        const existing = operation.goalId
          ? (goals ?? []).find((goal) => String(goal._id) === operation.goalId)
          : null
        if (operation.goalId && !existing) {
          throw new Error("That Coach goal no longer exists.")
        }
        const saved = await saveCoachGoal({
          ...(existing ? { id: existing._id } : {}),
          title: operation.title,
          description: operation.detail,
          startDate: operation.startDate,
          durationDays: operation.durationDays,
          pinned: operation.pinned,
          sourceMode: activeMode,
          tasks: operation.tasks,
        })
        const goalId = String(saved.goalId)
        const actionId = await recordAction({
          kind: existing ? "edit_goal" : "create_goal",
          summary: operation.summary,
          targetType: "coach_goal",
          targetId: goalId,
          undoPayload: existing
            ? {
                kind: "restore_goal",
                id: goalId,
                body: {
                  title: existing.title,
                  ...(existing.description
                    ? { description: existing.description }
                    : {}),
                  startDate: existing.startDate,
                  endDate: existing.endDate,
                  durationDays: existing.durationDays,
                  status: existing.status,
                  pinned: existing.pinned,
                  ...(existing.sourceMode
                    ? { sourceMode: existing.sourceMode }
                    : {}),
                  tasks: existing.tasks.map((task) => ({
                    title: task.title,
                    ...(task.detail ? { detail: task.detail } : {}),
                    completed: task.completed,
                  })),
                },
              }
            : { kind: "delete_goal", id: goalId },
        })
        results.push({
          ...operation,
          goalId,
          actionId: String(actionId),
        })
        continue
      }

      if (operation.type === "save_recipe") {
        const existing = operation.recipeId
          ? (recipes ?? []).find(
              (recipe) => String(recipe._id) === operation.recipeId
            )
          : null
        if (operation.recipeId && !existing) {
          throw new Error("That recipe no longer exists.")
        }
        const ingredients = operation.ingredients.map((ingredient) => ({
          id: ingredient.id ?? createClientId(),
          name: ingredient.name,
          grams: ingredient.grams,
          displayAmount: ingredient.grams,
          displayUnit: "g",
          caloriesPer100: ingredient.caloriesPer100,
          proteinPer100: ingredient.proteinPer100,
          carbsPer100: ingredient.carbsPer100,
          fatPer100: ingredient.fatPer100,
        }))
        const recipeId = await saveRecipe({
          ...(operation.recipeId
            ? { id: operation.recipeId as Id<"recipes"> }
            : {}),
          name: operation.name,
          description: operation.description,
          servings: operation.servings,
          prepMinutes: operation.prepMinutes,
          cookMinutes: operation.cookMinutes,
          category: operation.category,
          notes: operation.notes,
          recipeType: "detailed",
          placeholderImage: "coach-kitchen",
          tags: operation.tags,
          steps: operation.steps,
          ingredients,
        })
        const actionId = await recordAction({
          kind: existing ? "edit_recipe" : "create_recipe",
          summary: operation.summary,
          targetType: "recipe",
          targetId: String(recipeId),
          undoPayload: existing
            ? {
                kind: "restore_recipe",
                id: String(existing._id),
                body: {
                  name: existing.name,
                  ...(existing.description
                    ? { description: existing.description }
                    : {}),
                  ...(existing.servings ? { servings: existing.servings } : {}),
                  ...(existing.prepMinutes
                    ? { prepMinutes: existing.prepMinutes }
                    : {}),
                  ...(existing.cookMinutes
                    ? { cookMinutes: existing.cookMinutes }
                    : {}),
                  ...(existing.category ? { category: existing.category } : {}),
                  ...(existing.notes ? { notes: existing.notes } : {}),
                  ...(existing.recipeType
                    ? { recipeType: existing.recipeType }
                    : {}),
                  ...(existing.placeholderImage
                    ? { placeholderImage: existing.placeholderImage }
                    : {}),
                  ...(existing.tags ? { tags: existing.tags } : {}),
                  ...(existing.steps ? { steps: existing.steps } : {}),
                  ingredients: existing.ingredients,
                },
              }
            : { kind: "delete_recipe", id: String(recipeId) },
        })
        results.push({
          ...operation,
          recipeId: String(recipeId),
          actionId: String(actionId),
        })
        if (operation.logMeal) {
          const totals = recipeTotals(operation.ingredients, operation.servings)
          const servings = operation.servingsToLog ?? 1
          const entryId = createClientId()
          await addFoodEntry({
            date: todayKey,
            entry: {
              id: entryId,
              name: operation.name,
              meal: operation.logMeal,
              loggedAt: new Date().toISOString(),
              calories: Math.round(totals.calories * servings),
              protein: Math.round(totals.protein * servings),
              carbs: Math.round(totals.carbs * servings),
              fat: Math.round(totals.fat * servings),
              recipeId: String(recipeId),
            },
          })
          const logActionId = await recordAction({
            kind: "log_recipe",
            summary: `Logged ${servings} serving${servings === 1 ? "" : "s"} of ${operation.name}`,
            targetType: "nutrition",
            targetId: entryId,
            undoPayload: {
              kind: "remove_food_entry",
              date: todayKey,
              entryId,
            },
          })
          results.push({
            type: "log_nutrition",
            name: operation.name,
            meal: operation.logMeal,
            calories: Math.round(totals.calories * servings),
            protein: Math.round(totals.protein * servings),
            carbs: Math.round(totals.carbs * servings),
            fat: Math.round(totals.fat * servings),
            entryId,
            actionId: String(logActionId),
          })
        }
        continue
      }

      if (operation.type === "log_nutrition") {
        const date = operation.date ?? todayKey
        const existing = operation.entryId
          ? (recentFoodDays ?? [])
              .find((day) => day.date === date)
              ?.entries.find(
                (entry: FoodLogEntry) => entry.id === operation.entryId
              )
          : null
        if (operation.entryId && !existing) {
          throw new Error("That nutrition entry no longer exists.")
        }
        const entryId = operation.entryId ?? createClientId()
        const entry = {
          id: entryId,
          name: operation.name,
          meal: operation.meal,
          loggedAt: new Date().toISOString(),
          calories: operation.calories,
          protein: operation.protein,
          carbs: operation.carbs,
          fat: operation.fat,
        }
        if (existing) {
          await updateFoodEntry({ date, entry })
        } else {
          await addFoodEntry({ date, entry })
        }
        const actionId = await recordAction({
          kind: existing ? "correct_nutrition" : "log_nutrition",
          summary: operation.summary,
          targetType: "nutrition",
          targetId: entryId,
          undoPayload: existing
            ? { kind: "restore_food_entry", date, entry: existing }
            : { kind: "remove_food_entry", date, entryId },
        })
        results.push({
          ...operation,
          entryId,
          actionId: String(actionId),
        })
        continue
      }

      if (operation.type === "delete_nutrition") {
        const existing = (recentFoodDays ?? [])
          .find((day) => day.date === operation.date)
          ?.entries.find(
            (entry: FoodLogEntry) => entry.id === operation.entryId
          )
        if (!existing) throw new Error("That nutrition entry no longer exists.")
        await removeFoodEntry({
          date: operation.date,
          entryId: operation.entryId,
        })
        const actionId = await recordAction({
          kind: "delete_nutrition",
          summary: operation.summary,
          targetType: "nutrition",
          targetId: operation.entryId,
          undoPayload: {
            kind: "restore_food_entry",
            date: operation.date,
            entry: existing,
          },
        })
        results.push({
          type: operation.type,
          name: operation.name,
          actionId: String(actionId),
        })
        continue
      }

      if (operation.type === "create_workout_preset") {
        const resolved = await Promise.all(
          operation.exercises.map(async (exerciseDraft) => {
            const candidates = await searchExercises({
              query: exerciseDraft.name,
              limit: 6,
            })
            return {
              draft: exerciseDraft,
              exercise: bestExerciseMatch(exerciseDraft.name, candidates),
            }
          })
        )
        const matched = resolved.filter(
          (item): item is typeof item & { exercise: Exercise } =>
            Boolean(item.exercise)
        )
        if (matched.length !== operation.exercises.length) {
          throw new Error(
            "Coach couldn't recognise every exercise in this plan. Revise it before saving."
          )
        }
        const seen = new Set<string>()
        const unique = matched.filter(({ exercise }) => {
          if (seen.has(exercise.id)) return false
          seen.add(exercise.id)
          return true
        })
        const groupCounts = new Map<string, number>()
        for (const { draft } of unique) {
          if (!draft.supersetGroup) continue
          groupCounts.set(
            draft.supersetGroup,
            (groupCounts.get(draft.supersetGroup) ?? 0) + 1
          )
        }
        const emittedGroups = new Set<string>()
        const supersetColors = ["#8b5cf6", "#0ea5e9", "#f97316", "#10b981"]
        let colorIndex = 0
        const items: Array<
          | { kind: "solo"; exerciseId: string }
          | {
              kind: "superset"
              id: string
              color: string
              exerciseIds: string[]
            }
        > = []
        for (const { draft, exercise } of unique) {
          const group = draft.supersetGroup
          const groupSize = group ? (groupCounts.get(group) ?? 0) : 0
          if (!group || groupSize < 2 || groupSize > 3) {
            items.push({ kind: "solo", exerciseId: exercise.id })
            continue
          }
          if (emittedGroups.has(group)) continue
          emittedGroups.add(group)
          const exerciseIds = unique
            .filter((item) => item.draft.supersetGroup === group)
            .map((item) => item.exercise.id)
          const color = supersetColors[colorIndex % supersetColors.length]
          colorIndex += 1
          items.push({
            kind: "superset",
            id: createClientId(),
            color,
            exerciseIds,
          })
        }
        const exerciseData = Object.fromEntries(
          unique.map(({ draft, exercise }) => [
            exercise.id,
            {
              sets:
                exercise.category === "cardio"
                  ? []
                  : draft.sets.map((set) => ({
                      ...set,
                      id: createClientId(),
                    })),
              trackRpe: false,
              trackUnilateral: false,
              barWeight: "",
              barType: "olympic",
            },
          ])
        )
        const totalSets = unique.reduce(
          (sum, item) => sum + item.draft.sets.length,
          0
        )
        const presetBody = {
          name: operation.name,
          items,
          exerciseData,
          focus: operation.focus,
          duration: `${Math.max(15, 8 + totalSets * 3)} min`,
          steps: unique.map(({ exercise }) => exercise.name),
        }
        const existing = operation.presetId
          ? (presets ?? []).find(
              (preset) => String(preset._id) === operation.presetId
            )
          : null
        if (operation.presetId && !existing) {
          throw new Error("That workout preset no longer exists.")
        }
        let presetId: string
        if (existing) {
          await updatePreset({
            id: existing._id,
            ...presetBody,
          })
          presetId = String(existing._id)
        } else {
          const created = await createPreset(presetBody)
          presetId = String(created.id)
        }
        knownPresets.set(operation.name.trim().toLowerCase(), presetId)
        if (!presetOrder.includes(presetId)) presetOrder.push(presetId)
        for (const day of operation.scheduleDays) {
          routine = { ...routine, [day]: presetId }
          routineChanged = true
        }
        const actionId = await recordAction({
          kind: existing
            ? (operation.reason ?? "edit_workout_preset")
            : "create_workout_preset",
          summary: operation.summary,
          targetType: "workout_preset",
          targetId: presetId,
          undoPayload: existing
            ? {
                kind: "restore_preset",
                id: presetId,
                body: {
                  name: existing.name,
                  items: existing.items,
                  exerciseData: existing.exerciseData,
                  ...(existing.focus ? { focus: existing.focus } : {}),
                  ...(existing.duration ? { duration: existing.duration } : {}),
                  ...(existing.steps ? { steps: existing.steps } : {}),
                },
              }
            : { kind: "delete_preset", id: presetId },
        })
        results.push({
          type: operation.type,
          presetId,
          actionId: String(actionId),
          name: operation.name,
          exerciseNames: unique.map(({ exercise }) => exercise.name),
          scheduledDays: operation.scheduleDays,
        })
        continue
      }

      if (operation.type === "remember") {
        const saved = await setMemory({
          key: operation.key,
          category: operation.category,
          value: operation.value,
          source: "coach",
        })
        results.push({
          type: operation.type,
          label: `Remembered: ${operation.value}`,
          actionId: String(saved.actionId),
        })
        continue
      }

      if (operation.type === "forget_memory") {
        const memory = (memories ?? []).find(
          (item) => item.key.toLowerCase() === operation.key.toLowerCase()
        )
        if (!memory) throw new Error("That Coach memory no longer exists.")
        const removed = await removeMemory({ id: memory._id })
        results.push({
          type: operation.type,
          label: `Forgot: ${operation.value}`,
          actionId: String(removed.actionId),
        })
        continue
      }

      if (operation.type === "save_check_in") {
        const saved = await saveCheckIn({
          date: operation.date,
          kind:
            operation.date === todayKey && (todayWorkouts ?? []).length > 0
              ? "post_workout"
              : "daily",
          energy: operation.energy,
          soreness: operation.soreness,
          sleepQuality: operation.sleepQuality,
          mood: operation.mood,
          ...(operation.note ? { note: operation.note } : {}),
        })
        results.push({
          type: operation.type,
          label: "Recovery check-in saved",
          actionId: String(saved.actionId),
        })
        continue
      }

      if (operation.type === "save_weekly_plan") {
        const saved = await saveWeeklyPlan({
          weekStart: operation.weekStart,
          title: operation.title,
          days: operation.days,
          assumptions: operation.planAssumptions,
        })
        results.push({
          type: operation.type,
          label: operation.title,
          actionId: String(saved.actionId),
        })
        continue
      }

      if (operation.type === "undo_action") {
        await undoCoachAction({
          id: operation.actionId as Id<"coachActionEvents">,
        })
        results.push({
          type: operation.type,
          label: `Undid: ${operation.actionSummary}`,
        })
        continue
      }

      if (operation.type === "create_workout_plan") {
        throw new Error("Workout plan was not expanded before execution.")
      }

      if (operation.type !== "update_routine") {
        throw new Error("Unsupported Coach operation")
      }

      const previousSchedule = {
        routine: schedule?.routine ?? {
          primary: originalRoutines.primary,
          secondary: originalRoutines.secondary,
        },
        presetOrder: schedule?.presetOrder ?? [],
      }
      const applied: Array<{ day: Day; presetName: string | null }> = []
      for (const assignment of operation.assignments) {
        const presetId = assignment.presetName
          ? knownPresets.get(assignment.presetName.trim().toLowerCase())
          : null
        if (assignment.presetName && !presetId) {
          throw new Error(
            `No preset named “${assignment.presetName}” exists yet.`
          )
        }
        routine = { ...routine, [assignment.day]: presetId ?? null }
        routineChanged = true
        applied.push(assignment)
      }
      results.push({ type: "update_routine", assignments: applied })
      if (applied.length > 0) {
        ;(
          results.at(-1) as Extract<
            CoachOperationResult,
            { type: "update_routine" }
          >
        ).actionId = String(
          await recordAction({
            kind: "update_routine",
            summary: operation.summary,
            targetType: "routine",
            undoPayload: { kind: "restore_schedule", body: previousSchedule },
          })
        )
      }
    }

    if (routineChanged) {
      await setSchedule({
        routine: {
          primary: routine,
          secondary: originalRoutines.secondary,
        },
        presetOrder,
      })
    }
    return results */
  }

  async function pinGoalFromCoachBlock(goal: {
    title: string
    detail: string
    durationDays: number
    tasks: CoachGoalTaskDraft[]
  }) {
    try {
      const saved = await saveCoachGoal({
        title: goal.title,
        description: goal.detail,
        startDate: todayKey,
        durationDays: goal.durationDays,
        pinned: true,
        sourceMode: activeMode,
        tasks: goal.tasks,
      })
      await recordAction({
        kind: "create_goal",
        summary: `Pinned ${goal.title} to Today`,
        targetType: "coach_goal",
        targetId: String(saved.goalId),
        undoPayload: { kind: "delete_goal", id: String(saved.goalId) },
      })
      hapticTap()
      toast.success("Goal pinned to Today")
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not pin this goal"
      )
      throw error
    }
  }

  async function submitInteractiveCard(
    messageIndex: number,
    operation: Extract<CoachOperation, { type: "log_nutrition" }>
  ) {
    try {
      const datedOperation = {
        ...operation,
        date: operation.date ?? todayKey,
      }
      const operationResults = await executeOperations([datedOperation])
      setMessages((current) =>
        current.map((message, index) =>
          index === messageIndex
            ? {
                ...message,
                operationResults: [
                  ...(message.operationResults ?? []),
                  ...operationResults,
                ],
              }
            : message
        )
      )
      hapticTap()
      toast.success(`${operation.name} logged`)
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not log this meal"
      )
      throw error
    }
  }

  async function pinSavedGoal(goalId: string) {
    try {
      await setCoachGoalPinned({
        id: goalId as Id<"coachGoals">,
        pinned: true,
      })
      hapticTap()
      toast.success("Goal pinned to Today")
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not pin this goal"
      )
      throw error
    }
  }

  async function applyPendingOperations(messageIndex: number) {
    const operations = messages[messageIndex]?.pendingOperations
    if (!operations?.length || applyingMessageIndex !== null) return
    setApplyingMessageIndex(messageIndex)
    try {
      const operationResults = await executeOperations(operations)
      setMessages((current) =>
        current.map((message, index) =>
          index === messageIndex
            ? {
                ...message,
                pendingOperations: undefined,
                operationResults,
              }
            : message
        )
      )
      hapticTap()
      toast.success("Coach applied your changes")
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not apply Coach changes"
      )
    } finally {
      setApplyingMessageIndex(null)
    }
  }

  function dismissPendingOperations(messageIndex: number) {
    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex
          ? { ...message, pendingOperations: undefined }
          : message
      )
    )
    hapticSelection()
  }

  async function undoAction(id: string) {
    try {
      await undoCoachAction({ id: id as Id<"coachActionEvents"> })
      hapticTap()
      toast.success("Coach change undone")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not undo change"
      )
    }
  }

  async function logRecipeResult(
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
      await recordAction({
        kind: "log_recipe",
        summary: `Logged one serving of ${result.name}`,
        targetType: "nutrition",
        targetId: entryId,
        undoPayload: {
          kind: "remove_food_entry",
          date: todayKey,
          entryId,
        },
      })
      toast.success(`${result.name} logged`)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not log recipe"
      )
    }
  }

  async function addManualMemory() {
    const value = newMemoryValue.trim()
    if (!value || savingMemory) return
    setSavingMemory(true)
    try {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 38)
      await setMemory({
        key: `manual-${newMemoryCategory}-${slug || createClientId().slice(-8)}`,
        category: newMemoryCategory,
        value,
        source: "manual",
      })
      setNewMemoryValue("")
      toast.success("Added to Coach memory")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add memory"
      )
    } finally {
      setSavingMemory(false)
    }
  }

  function updateComposer(value: string, element?: HTMLTextAreaElement) {
    const nextValue = value.slice(0, COACH_MAX_MESSAGE_CHARS)
    setInput(nextValue)
    const textarea = element ?? composerRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`
  }

  async function submit(promptOverride?: string) {
    const dictatedInput =
      dictation.status === "listening" ? await dictation.stop() : input
    const selectedAttachment = attachmentRef.current
    const rawPrompt = (promptOverride ?? dictatedInput)
      .trim()
      .slice(0, COACH_MAX_MESSAGE_CHARS)
    if (!rawPrompt && !selectedAttachment) return
    if (selectedAttachment && selectedAttachment.status !== "ready") {
      toast.error(
        selectedAttachment.status === "error"
          ? selectedAttachment.error
          : "Wait for the image to finish uploading."
      )
      return
    }
    const guidedInstruction: Record<GuidedCoachIntent["kind"], string> = {
      create_recipe: "Create a detailed recipe",
      suggest_meal: "Suggest a practical meal",
      modify_workout: "Modify the user's next workout safely",
      explain_plateau: "Explain the likely plateau using recent progress data",
      plan_recovery: "Create a practical recovery adjustment",
      plan_week: "Create a realistic seven-day plan",
    }
    const prompt = recipeCustomization
      ? `Customize this recipe: ${recipeCustomization.name}. Current direction: ${recipeCustomization.description} Ingredients: ${recipeCustomization.ingredients.join(", ")}. The user wants: ${rawPrompt}`
      : guidedIntent
        ? `${guidedInstruction[guidedIntent.kind]} based on this request: ${rawPrompt}`
        : rawPrompt ||
          "Analyze this image in the context of my goals and recent data."
    if (busy || loading) return
    if (!requireAiAccess(1, "coach_chat")) return

    hapticMedium()
    setLastFailedPrompt(null)
    const visiblePrompt = selectedAttachment
      ? `${rawPrompt || "Take a look at this image."}\n\n📷 ${selectedAttachment.fileName}`
      : prompt
    const nextMessages: CoachMessage[] = [
      ...messages,
      { role: "user", content: visiblePrompt },
    ]
    setMessages(nextMessages)
    updateComposer("")
    if (recipeCustomization) setRecipeCustomization(null)
    if (guidedIntent) setGuidedIntent(null)
    setBusy(true)

    const elapsedSeconds = startReplyTimer()
    // Every field here is a shape, never content: how the request was framed,
    // not a word of what was asked.
    const requestShape = {
      mode: activeMode,
      turn: nextMessages.length,
      has_image: Boolean(selectedAttachment),
      intent:
        guidedIntent?.kind ??
        (recipeCustomization ? "customize_recipe" : "free"),
      allowance: aiUsage
        ? usageBucket(aiUsage.remaining, aiUsage.limit)
        : "unknown",
      is_pro: aiUsage?.isPro ?? false,
    }
    trackUmami("coach_request", requestShape)

    try {
      const result = await generateChat({
        context,
        message: activeWorkout
          ? [
              prompt,
              "",
              `The user is mid-workout right now. ${activeWorkout.summary}`,
              "Treat completed sets as fixed work that must be preserved; only plan the remaining work around them.",
              "If they are asking you to change this session, return exactly one create_workout_preset operation containing the COMPLETE session that should replace it, and keep the spoken reply short. Otherwise just answer.",
            ].join("\n")
          : prompt,
        coachMode: activeMode,
        model: chatModel,
        today: todayKey,
        ...(selectedAttachment?.id
          ? { attachmentId: selectedAttachment.id }
          : {}),
        history: messages
          .slice(-8)
          .map((message) => ({ role: message.role, content: message.content })),
      })
      const response = result as {
        reply: string
        uiBlocks?: unknown
        operations?: unknown
        artifacts?: unknown
      }
      const allOperations = normalizeCoachOperations(response.operations)
      // Over a live session a workout plan means "change what I am doing now".
      // Saving it as a preset instead would be the wrong verb entirely.
      const workoutPlan = activeWorkout
        ? allOperations.find(
            (operation) => operation.type === "create_workout_preset"
          )
        : undefined
      const operations = workoutPlan
        ? allOperations.filter((operation) => operation !== workoutPlan)
        : allOperations
      setWorkoutPlanDraft(
        workoutPlan ? workoutDraftFromOperation(workoutPlan) : null
      )
      if (selectedAttachment) clearAttachment()
      const needsConfirmation = operations.some(
        (operation) =>
          operation.type === "save_recipe" ||
          operation.confirmation === "confirm" ||
          operation.warnings.length > 0
      )
      const operationResults =
        operations.length > 0 && !needsConfirmation
          ? await executeOperations(operations)
          : []
      trackUmami("coach_reply", {
        mode: activeMode,
        seconds: elapsedSeconds(),
        operations: operations.length,
        needs_confirmation: needsConfirmation,
        reply_chars: response.reply.length,
      })
      hapticTap()
      setMessages([
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
    } catch (error) {
      // The server has no error code for a spent allowance, only prose, so the
      // string match is what separates "you ran out" from "it broke".
      const message = error instanceof Error ? error.message : ""
      trackUmami("coach_failed", {
        mode: activeMode,
        seconds: elapsedSeconds(),
        reason: /limit reached/i.test(message) ? "allowance_spent" : "error",
      })
      hapticHeavy()
      setLastFailedPrompt(prompt)
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "I could not answer that right now.",
          error: true,
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  function handleUiAction(action: CoachUiAction) {
    if (action === "open_workout_builder") {
      navigate("/workouts/new", { motion: "forward" })
      return
    }
    if (action === "open_recipe_builder") {
      navigate("/foods/recipe/new", { motion: "forward" })
      return
    }
    if (action === "open_nutrition" || action === "log_food") {
      navigate("/nutrition", { motion: "switch" })
      return
    }
    if (action === "open_workouts") {
      navigate("/workouts", { motion: "switch" })
      return
    }
    if (action === "open_progress") {
      navigate("/progress", { motion: "switch" })
      return
    }
    if (action === "open_supplements") {
      navigate("/supplements", { motion: "switch" })
      return
    }
    navigate("/settings", { motion: "switch" })
  }

  function startNewChat() {
    if (busy || newChatPhase !== "idle") return
    hapticTap()
    dictation.cancel()
    clearAttachment()
    newChatTimersRef.current.forEach(window.clearTimeout)
    setNewChatPhase("appear")
    newChatTimersRef.current = [
      window.setTimeout(() => setNewChatPhase("open"), 280),
      window.setTimeout(() => {
        hapticMedium()
        setNewChatPhase("suck")
      }, 540),
      window.setTimeout(() => {
        setMessages([])
        updateComposer("")
        setLastFailedPrompt(null)
        setNewChatPhase("out")
      }, 1160),
      window.setTimeout(() => {
        setNewChatPhase("idle")
        requestAnimationFrame(() => composerRef.current?.focus())
      }, 1500),
    ]
  }

  function switchCoachMode(nextMode: CoachMode) {
    if (busy || modeTransitioning || nextMode === activeMode) return
    const currentIndex = COACH_MODES.findIndex((item) => item.id === activeMode)
    const nextIndex = COACH_MODES.findIndex((item) => item.id === nextMode)
    const direction = nextIndex > currentIndex ? "forward" : "back"
    const isLongJump = Math.abs(nextIndex - currentIndex) > 1

    setModeSwipeDirection(direction)
    setModeTransitioning(true)
    hapticSelection()
    dictation.cancel()
    clearAttachment()

    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> }
    }
    const commitModeChange = (mode: CoachMode) => {
      setActiveMode(mode)
      setMessages(loadCoachConversation(mode))
      updateComposer("")
      setLastFailedPrompt(null)
    }
    const showMode = async (mode: CoachMode) => {
      document.documentElement.dataset.coachSwipe = direction
      // Embedded in a sheet there is a whole workout behind this panel, and a
      // document-level view transition would snapshot and animate that too.
      if (embedded || !transitionDocument.startViewTransition) {
        commitModeChange(mode)
        return
      }
      const transition = transitionDocument.startViewTransition(() => {
        flushSync(() => commitModeChange(mode))
      })
      await transition.finished
    }

    const flyAcrossNutrition = async () => {
      const currentPage =
        document.querySelector<HTMLElement>(".coach-page-slide")
      if (!currentPage) {
        commitModeChange(nextMode)
        return
      }
      const rect = currentPage.getBoundingClientRect()
      const source = currentPage.cloneNode(true) as HTMLElement
      flushSync(() => commitModeChange("chef"))
      const nutritionPage =
        document.querySelector<HTMLElement>(".coach-page-slide")
      const nutrition = nutritionPage?.cloneNode(true) as
        HTMLElement | undefined
      flushSync(() => commitModeChange(nextMode))
      const destination =
        document.querySelector<HTMLElement>(".coach-page-slide")
      if (!nutrition || !destination) return
      const destinationClone = destination.cloneNode(true) as HTMLElement
      const clip = document.createElement("div")
      clip.className = "coach-carousel-clip"
      Object.assign(clip.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: "120",
        overflow: "hidden",
        pointerEvents: "none",
        contain: "strict",
      })
      document.body.appendChild(clip)

      const prepareClone = (element: HTMLElement, mode: CoachMode) => {
        element.classList.add("coach-swoosh-surface", "coach-carousel-frame")
        element.dataset.coachMode = mode
        element.setAttribute("aria-hidden", "true")
        element.style.position = "absolute"
        element.style.inset = "0"
        element.style.width = "100%"
        element.style.height = "100%"
        element.style.pointerEvents = "none"
        element.style.overflow = "hidden"
        element.style.viewTransitionName = "none"
        element
          .querySelectorAll<HTMLElement>(".coach-background-layer")
          .forEach((layer) => {
            layer.style.opacity = "0"
          })
        clip.appendChild(element)
      }
      prepareClone(source, activeMode)
      prepareClone(nutrition, "chef")
      prepareClone(destinationClone, nextMode)
      destination.style.visibility = "hidden"

      const sign = direction === "forward" ? 1 : -1
      const timing: KeyframeAnimationOptions = {
        duration: 620,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        fill: "both",
      }
      const animations = [
        source.animate(
          [
            { transform: "translate3d(0,0,0)" },
            { transform: `translate3d(${-2 * sign * rect.width}px,0,0)` },
          ],
          timing
        ),
        nutrition.animate(
          [
            { transform: `translate3d(${sign * rect.width}px,0,0)` },
            { transform: `translate3d(${-sign * rect.width}px,0,0)` },
          ],
          timing
        ),
        destinationClone.animate(
          [
            { transform: `translate3d(${2 * sign * rect.width}px,0,0)` },
            { transform: "translate3d(0,0,0)" },
          ],
          timing
        ),
      ]
      await Promise.all(animations.map((animation) => animation.finished))
      // Paint the real destination underneath the final clone before removing
      // the animation layer. This avoids a one-frame empty compositor layer.
      destination.style.removeProperty("visibility")
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      )
      clip.remove()
    }

    // In a sheet the carousel would clone the panel over the workout and the
    // background choreography would drag a mode switch past a second. Embedded
    // mode swaps modes outright.
    if (embedded) {
      commitModeChange(nextMode)
      setModeTransitioning(false)
      return
    }

    void (async () => {
      try {
        // Commit the fade before measuring or cloning anything. Without the
        // synchronous paint boundary, React may batch the fade with the mode
        // change and the carousel starts while the background is still visible.
        flushSync(() => setCarouselBackgroundPhase("out"))
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => window.setTimeout(resolve, 420))
          )
        )
        if (isLongJump) await flyAcrossNutrition()
        else await showMode(nextMode)
        setCarouselBackgroundPhase("in")
        await new Promise((resolve) => window.setTimeout(resolve, 380))
      } finally {
        delete document.documentElement.dataset.coachSwipe
        setCarouselBackgroundPhase("idle")
        setModeTransitioning(false)
      }
    })()
  }

  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const mode = COACH_MODES.find((item) => item.id === activeMode)!
  /* One row of doors instead of one. Only the starters that carry a prompt:
     the rest need a host screen this one does not have. */
  const starters = (
    activeMode === "chef"
      ? CHEF_STARTERS
      : activeMode === "personal_trainer"
        ? TRAINER_STARTERS
        : COACH_STARTERS
  ).filter((starter) => starter.prompt)
  return (
    <main
      className={cn(
        "coach-mobile-immersive coach-swoosh-surface relative isolate bg-background",
        embedded
          ? "flex h-full min-h-0 flex-col overflow-hidden"
          : "desktop-canvas h-svh overflow-hidden lg:pl-64"
      )}
      data-coach-mode={activeMode}
      data-coach-embedded={embedded ? "true" : undefined}
      data-new-chat-phase={newChatPhase}
      data-carousel-background={carouselBackgroundPhase}
    >
      <div
        key={`coach-page-${activeMode}`}
        className="coach-page-slide relative h-full w-full touch-pan-y"
        data-swipe-direction={modeSwipeDirection}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button, input, textarea"))
            return
          coachSwipeStartRef.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={(event) => {
          const start = coachSwipeStartRef.current
          coachSwipeStartRef.current = null
          if (!start || modeTransitioning || busy) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.25) return
          const currentIndex = COACH_MODES.findIndex(
            (item) => item.id === activeMode
          )
          const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1
          const nextMode = COACH_MODES[nextIndex]?.id
          if (nextMode) switchCoachMode(nextMode)
        }}
        onPointerCancel={() => {
          coachSwipeStartRef.current = null
        }}
      >
        <div className="coach-background-layer" aria-hidden="true">
          <div className="coach-swoosh-backdrop coach-swoosh-backdrop--mobile" />
        </div>
        <div
          className={cn(
            "relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col px-[var(--app-page-x)] md:px-8",
            embedded ? "pt-0" : "pt-[var(--app-safe-top)] lg:pt-0"
          )}
        >
          <header
            ref={coachHeaderRef}
            className="coach-chrome-enter z-20 flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border/55 bg-transparent"
          >
            <div className="flex min-w-0 items-center gap-1">
              {/* Form advice arrives here mid-set, so getting back to the
                  workout should not mean hunting through the tab bar. */}
              {(embedded || hasActiveWorkout) && (
                <button
                  type="button"
                  onClick={() => {
                    hapticSelection()
                    if (embedded) {
                      onClose?.()
                      return
                    }
                    navigate("/workout/active", { motion: "back" })
                  }}
                  aria-label={embedded ? "Close coach" : "Back to your workout"}
                  className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                >
                  <ArrowLeft size={16} weight="bold" />
                </button>
              )}
              <h1 className="truncate text-[18px] leading-tight font-bold tracking-tight">
                Coach
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <div ref={modelMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    hapticSelection()
                    setModelMenuOpen((open) => !open)
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  aria-label="Coach model"
                  className="coach-header-action flex min-h-9 items-center gap-1 rounded-full border border-border/70 bg-card/40 px-2.5 text-[11px] font-bold text-foreground/75 active:bg-muted"
                >
                  <Sparkle
                    size={11}
                    weight="fill"
                    className="shrink-0 opacity-60"
                  />
                  <span className="max-w-28 truncate">
                    {modelCatalog.find((entry) => entry.id === chatModel)
                      ?.label ?? "Model"}
                  </span>
                  <CaretDown
                    size={11}
                    weight="bold"
                    className={cn(
                      "shrink-0 transition-transform",
                      modelMenuOpen && "rotate-180"
                    )}
                  />
                </button>
                {modelMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Coach model"
                    className="absolute top-full right-0 z-50 mt-1.5 w-60 rounded-xl border border-border/60 bg-card p-1 shadow-[0_18px_50px_color-mix(in_srgb,black_18%,transparent)]"
                  >
                    {modelCatalog.map((entry) => {
                      const selected = entry.id === chatModel
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            hapticTap()
                            setChatModel(entry.id)
                            safeLocalStorageSet(COACH_MODEL_KEY, entry.id)
                            setModelMenuOpen(false)
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold",
                            selected
                              ? "text-foreground"
                              : "text-muted-foreground active:bg-muted"
                          )}
                        >
                          <span className="min-w-0 truncate">
                            {entry.label}
                          </span>
                          {selected && (
                            <Check
                              size={13}
                              weight="bold"
                              className="shrink-0"
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  hapticSelection()
                  setShowMemory(true)
                }}
                aria-label="Coach memory"
                className="coach-header-action coach-header-action--memory flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              >
                <Brain size={16} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => {
                  hapticSelection()
                  setShowHistory(true)
                }}
                aria-label="Coach action history"
                className="coach-header-action coach-header-action--history flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              >
                <ClockCounterClockwise size={16} weight="bold" />
              </button>
              {messages.length > 0 ? (
                <TourAnchor anchor="coach-new-chat">
                  <button
                    type="button"
                    onClick={startNewChat}
                    disabled={busy}
                    className="motion-tactile inline-flex min-h-11 items-center gap-1.5 px-2 text-[11px] font-bold text-muted-foreground active:text-foreground disabled:opacity-40"
                  >
                    <Plus size={13} weight="bold" />
                    New chat
                  </button>
                </TourAnchor>
              ) : null}
            </div>
          </header>

          <nav
            ref={coachModesRef}
            className="coach-mode-tabs grid shrink-0 grid-cols-3 gap-1 border-b border-border/45 py-2"
            role="tablist"
            aria-label="Coach modes"
          >
            {COACH_MODES.map((item) => {
              const active = item.id === activeMode
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="coach-workspace"
                  disabled={busy || modeTransitioning}
                  onClick={() => switchCoachMode(item.id)}
                  className={cn(
                    "motion-tactile flex min-h-11 min-w-0 items-center justify-center gap-1 border-b-2 px-0.5 text-[10px] font-semibold transition-colors disabled:opacity-45 sm:gap-1.5 sm:text-[11px]",
                    active
                      ? cn(item.tabClass, "text-foreground")
                      : "border-transparent text-muted-foreground active:text-foreground"
                  )}
                >
                  <Icon className="shrink-0" size={13} weight="bold" />
                  <span className="min-w-0 whitespace-nowrap">
                    {item.label}
                  </span>
                </button>
              )
            })}
          </nav>

          <section
            key={activeMode}
            id="coach-workspace"
            role="tabpanel"
            aria-label={mode.label}
            className="coach-mode-stage relative isolate flex min-h-0 flex-1 flex-col overflow-hidden"
            data-coach-mode={activeMode}
            data-swipe-direction={modeSwipeDirection}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-5 sm:px-5">
              {loading ? (
                <CoachLoadingState />
              ) : messages.length === 0 ? (
                <div className="coach-empty-intro mx-auto flex w-full max-w-3xl flex-1 flex-col py-5 sm:py-9">
                  {guidedIntent && (
                    <div className="coach-customization-state mx-auto w-full max-w-2xl">
                      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_18px_50px_color-mix(in_srgb,black_7%,transparent)]">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h2 className="text-[24px] leading-tight font-semibold tracking-[-0.025em]">
                              {guidedIntent.title}
                            </h2>
                            <p className="mt-2 max-w-lg text-[13px] leading-5 text-muted-foreground">
                              {guidedIntent.detail}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              hapticSelection()
                              setGuidedIntent(null)
                              updateComposer("")
                            }}
                            aria-label="Close guided request"
                            className="coach-customization-close motion-tactile flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                          >
                            <X size={14} weight="bold" />
                          </button>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          {guidedIntent.examples.map((example) => (
                            <button
                              key={example}
                              type="button"
                              onClick={() => {
                                hapticSelection()
                                updateComposer(example)
                                requestAnimationFrame(() =>
                                  composerRef.current?.focus()
                                )
                              }}
                              className="motion-tactile min-h-10 rounded-full border border-border/70 px-3 text-[11px] font-medium active:bg-muted"
                            >
                              {example}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {recipeCustomization && (
                    <div
                      className={cn(
                        "coach-customization-state mx-auto w-full max-w-2xl",
                        recipeCustomizationClosing &&
                          "coach-customization-state--closing"
                      )}
                    >
                      <div className="coach-customization-card overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_18px_50px_color-mix(in_srgb,black_7%,transparent)] sm:grid sm:grid-cols-[11rem_1fr]">
                        <img
                          src={recipeCustomization.image}
                          alt=""
                          className="h-36 w-full object-cover sm:h-full"
                        />
                        <div className="relative p-4 sm:p-5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[12px] font-medium text-muted-foreground">
                              Customizing
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                if (recipeCustomizationClosing) return
                                hapticSelection()
                                setRecipeCustomizationClosing(true)
                                window.setTimeout(() => {
                                  setRecipeCustomization(null)
                                  setRecipeCustomizationClosing(false)
                                  updateComposer("")
                                }, 260)
                              }}
                              aria-label="Stop customizing recipe"
                              className="coach-customization-close motion-tactile -mt-2 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                            >
                              <X size={14} weight="bold" />
                            </button>
                          </div>
                          <h2 className="mt-1.5 text-[20px] leading-tight font-semibold tracking-tight">
                            {recipeCustomization.name}
                          </h2>
                          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                            {recipeCustomization.description}
                          </p>
                          <div className="mt-4 flex gap-3 text-[10px] font-semibold text-muted-foreground tabular-nums">
                            <span>{recipeCustomization.time} min</span>
                            <span>{recipeCustomization.calories} kcal</span>
                            <span>{recipeCustomization.protein}g protein</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-6 px-1">
                        <h3 className="text-[24px] leading-tight font-semibold tracking-[-0.025em]">
                          What would you like to change?
                        </h3>
                        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
                          Try “make it vegetarian,” “more protein,” or “under 20
                          minutes.”
                        </p>
                      </div>
                    </div>
                  )}
                  <div
                    className={cn(
                      "w-full px-1",
                      (recipeCustomization || guidedIntent) && "hidden"
                    )}
                  >
                    <h2 className="max-w-2xl text-[30px] leading-[1.06] font-semibold tracking-[-0.035em] text-foreground sm:text-[40px]">
                      {timeGreeting()}
                    </h2>
                    <p className="mt-2 max-w-md text-[14px] leading-5 text-foreground/60">
                      {!context.hasAnyData
                        ? "Nothing logged yet."
                        : activeMode === "chef"
                          ? context.proteinAdherence < 85
                            ? "Close the protein gap today."
                            : "Keep today’s food simple."
                          : activeMode === "personal_trainer"
                            ? context.workoutDays7 >= 4
                              ? "You’ve earned a lighter day."
                              : "Make the next session count."
                            : context.workoutDays7 >= 3 &&
                                context.proteinAdherence >= 85
                              ? "You’re on track. Don’t overcorrect."
                              : "Do one useful thing well today."}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void submit(
                          !context.hasAnyData
                            ? "I haven’t logged anything yet. Ask me the few questions you need, then set me up with something for today."
                            : activeMode === "chef"
                              ? "Turn today’s nutrition direction into a practical plan."
                              : activeMode === "personal_trainer"
                                ? "Turn today’s training direction into my next workout."
                                : "Explain today’s direction and give me the single best next action."
                        )
                      }
                      className="motion-tactile mt-7 inline-flex min-h-11 items-center gap-2 border-b border-foreground/35 text-[12px] font-semibold text-foreground active:border-foreground"
                    >
                      {context.hasAnyData ? "See what I’d do" : "Set me up"}{" "}
                      <ArrowRight size={14} weight="bold" />
                    </button>
                    {context.hasAnyData ? (
                      <div className="coach-brief-tiles mt-8 grid max-w-xl grid-cols-2 gap-2.5">
                        <CoachBriefTile
                          label="Today"
                          value={`${Math.round(context.todayCalories)} / ${Math.round(context.calorieTarget)} kcal`}
                          detail={`${Math.round(context.todayProtein)} of ${Math.round(context.proteinTarget)}g protein`}
                          fill={
                            context.calorieTarget > 0
                              ? context.todayCalories / context.calorieTarget
                              : 0
                          }
                          onClick={() =>
                            void submit(
                              "How am I tracking against today’s targets, and what should I eat next?"
                            )
                          }
                        />
                        <CoachBriefTile
                          label="This week"
                          value={`${context.workoutDays7} of 7 days`}
                          detail={
                            context.lastWorkout
                              ? `Last: ${context.lastWorkout.name}, ${relativeDay(context.lastWorkout.date)}`
                              : "No sessions logged"
                          }
                          fill={null}
                          onClick={() =>
                            void submit(
                              "Look at my week so far and tell me what my next session should be."
                            )
                          }
                        >
                          <CoachWeekStrip days={context.weekDays} />
                        </CoachBriefTile>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="coach-conversation-content mx-auto flex w-full max-w-3xl flex-1 flex-col">
                  <div
                    className="flex flex-1 flex-col gap-5"
                    aria-live="polite"
                  >
                    {messages.map((message, index) =>
                      message.role === "user" ? (
                        <div
                          key={index}
                          className="coach-message coach-message--user ml-auto max-w-[82%] rounded-xl bg-foreground px-4 py-3 text-[13.5px] leading-5 text-background"
                          style={{
                            animationDelay: `${Math.min(index, 6) * 35}ms`,
                          }}
                        >
                          {message.content}
                        </div>
                      ) : (
                        <div
                          key={index}
                          className="coach-message coach-message--assistant max-w-2xl"
                          style={{
                            animationDelay: `${Math.min(index, 6) * 35}ms`,
                          }}
                        >
                          <div
                            className={cn(
                              "min-w-0 border-l-2 pl-4 text-[14px] leading-6",
                              message.error
                                ? "border-destructive/35 text-foreground"
                                : cn(mode.messageClass, "text-foreground")
                            )}
                          >
                            <p>{message.content}</p>
                            {message.error && lastFailedPrompt ? (
                              <button
                                type="button"
                                onClick={() => void submit(lastFailedPrompt)}
                                className="motion-tactile mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-3 text-[11px] font-bold text-background"
                              >
                                <ArrowClockwise size={13} weight="bold" />
                                Try again
                              </button>
                            ) : (
                              <>
                                <CoachUiBlocks
                                  blocks={message.uiBlocks}
                                  onAction={handleUiAction}
                                  onSubmitInteractive={(operation) =>
                                    submitInteractiveCard(index, operation)
                                  }
                                  onPinGoal={pinGoalFromCoachBlock}
                                />
                                <CoachArtifacts artifacts={message.artifacts} />
                                <CoachProposal
                                  operations={message.pendingOperations}
                                  applying={applyingMessageIndex === index}
                                  onApply={() =>
                                    void applyPendingOperations(index)
                                  }
                                  onDismiss={() =>
                                    dismissPendingOperations(index)
                                  }
                                />
                                <CoachOperationResults
                                  results={message.operationResults}
                                  onOpenRecipe={(id) =>
                                    navigate(`/foods/recipe/${id}`, {
                                      motion: "forward",
                                    })
                                  }
                                  onOpenWorkouts={() =>
                                    navigate("/workouts", { motion: "switch" })
                                  }
                                  onStartWorkout={(presetId) =>
                                    navigate(`/workout/active/${presetId}`, {
                                      motion: "forward",
                                    })
                                  }
                                  onOpenNutrition={(date) =>
                                    navigate(
                                      date
                                        ? `/nutrition?date=${date}`
                                        : "/nutrition",
                                      { motion: "switch" }
                                    )
                                  }
                                  onOpenProgress={() =>
                                    navigate("/progress", { motion: "switch" })
                                  }
                                  onOpenSupplements={() =>
                                    navigate("/supplements", {
                                      motion: "switch",
                                    })
                                  }
                                  onUndo={(id) => void undoAction(id)}
                                  onLogRecipe={(result) =>
                                    void logRecipeResult(result)
                                  }
                                  onPinGoal={pinSavedGoal}
                                  onPinWidget={async (widgetId) => {
                                    await setDashboardWidgetPinned({
                                      widgetId:
                                        widgetId as Id<"dashboardWidgets">,
                                      pinned: true,
                                    })
                                    hapticTap()
                                    toast.success("Widget added to dashboard")
                                  }}
                                  onCreateWidgetFollowUp={(widget) => {
                                    const title =
                                      widget.followUpTitle ?? "Follow-up widget"
                                    const kind =
                                      widget.followUpKind ?? "sparkline"
                                    void submit(
                                      `Create the suggested compact ${kind} widget “${title}” as a follow-up to dashboard widget ${widget.widgetId}. Use ${widget.sourceMetricTitle} as its source and do not add it to my dashboard yet.`
                                    )
                                  }}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      )
                    )}
                    {busy && <ThinkingIndicator />}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* A plan for the session someone is standing in the middle of gets
              confirmed here, in the conversation, rather than silently rewriting
              their remaining sets. */}
          {activeWorkout && workoutPlanDraft && (
            <div className="z-20 mx-auto mb-2 w-full max-w-3xl shrink-0 rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-[15px] font-semibold">Update this workout?</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {(workoutPlanDraft.exercises ?? []).length} exercise
                {(workoutPlanDraft.exercises ?? []).length === 1 ? "" : "s"} ·
                completed sets are kept
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={activeWorkout.applying}
                  aria-busy={activeWorkout.applying}
                  onClick={() => {
                    const draft = workoutPlanDraft
                    setWorkoutPlanDraft(null)
                    void activeWorkout.onApply(draft)
                  }}
                  className="motion-tactile min-h-11 flex-1 rounded-xl bg-foreground px-4 text-[14px] font-semibold text-background disabled:opacity-45"
                >
                  Use this plan
                </button>
                <button
                  type="button"
                  onClick={() => setWorkoutPlanDraft(null)}
                  className="motion-tactile min-h-11 rounded-xl border border-border px-4 text-[14px] font-semibold text-muted-foreground"
                >
                  Keep mine
                </button>
              </div>
            </div>
          )}
          {!loading &&
          messages.length === 0 &&
          !guidedIntent &&
          !recipeCustomization ? (
            <div
              className="coach-starter-row z-20 mx-auto -mb-1 flex w-full max-w-3xl shrink-0 gap-2 overflow-x-auto pb-3"
              aria-label="Suggested questions"
            >
              {starters.map((starter) => {
                const Icon = starter.icon
                return (
                  <button
                    key={starter.title}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      hapticTap()
                      void submit(starter.prompt ?? undefined)
                    }}
                    className="coach-starter-chip motion-tactile flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-semibold whitespace-nowrap text-foreground/80 disabled:opacity-40"
                  >
                    <Icon size={12} weight="bold" className="shrink-0" />
                    {starter.title}
                  </button>
                )
              })}
            </div>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
            className="z-20 mx-auto w-full max-w-3xl min-w-0 shrink-0 border-t border-border/55 bg-transparent pt-3 pb-[calc(var(--app-safe-bottom)+4.25rem)] lg:pb-4"
          >
            <TourAnchor
              anchor="coach-composer"
              className="block w-full max-w-full min-w-0"
            >
              <div
                className={cn(
                  "coach-composer w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-1.5",
                  mode.composerClass
                )}
              >
                <CoachAttachmentInput
                  inputRef={fileInputRef}
                  onSelect={(file) => void attachImage(file)}
                />
                <CoachAttachmentPreview
                  attachment={attachment}
                  onRemove={() => clearAttachment()}
                />
                {/* Two grey icons pretending to be affordances became one
                    button that says what it opens when you open it. */}
                {attachMenuOpen && (
                  <div className="coach-attach-menu flex gap-1.5 px-1 pb-2">
                    <CoachAttachButton
                      onClick={() => {
                        setAttachMenuOpen(false)
                        openImagePicker()
                      }}
                      disabled={loading || busy}
                      className="w-auto gap-1.5 rounded-full px-3 text-[11.5px] font-semibold"
                      label="Picture"
                    />
                    {activeMode !== "chef" && (
                      <button
                        type="button"
                        onClick={() => {
                          hapticTap()
                          setAttachMenuOpen(false)
                          setShowFormCoach(true)
                        }}
                        disabled={loading || busy}
                        aria-label="Check my form"
                        title="Check my form"
                        className="motion-tactile flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-35"
                      >
                        <VideoCamera size={16} weight="bold" />
                        Check my form
                      </button>
                    )}
                  </div>
                )}
                <div className="flex min-w-0 items-end gap-1 sm:gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      hapticTap()
                      setAttachMenuOpen((open) => !open)
                    }}
                    disabled={loading || busy}
                    aria-label="Add a picture or a form check"
                    aria-expanded={attachMenuOpen}
                    className={cn(
                      "coach-attach-toggle motion-tactile flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-35",
                      attachMenuOpen && "bg-muted text-foreground"
                    )}
                  >
                    <Plus size={18} weight="bold" />
                  </button>
                  <textarea
                    ref={composerRef}
                    value={input}
                    rows={1}
                    maxLength={COACH_MAX_MESSAGE_CHARS}
                    onChange={(event) =>
                      updateComposer(event.target.value, event.currentTarget)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        void submit()
                      }
                    }}
                    placeholder={
                      loading
                        ? "Connecting your data…"
                        : recipeCustomization
                          ? "Describe what you’d like to change…"
                          : guidedIntent
                            ? "Tell Coach what you have in mind…"
                            : mode.placeholder
                    }
                    disabled={loading || busy}
                    className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2.5 text-[14px] leading-5 outline-none placeholder:text-muted-foreground/45 disabled:opacity-55 sm:px-2.5"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      if (dictation.status === "listening")
                        void dictation.stop()
                      else void dictation.start()
                    }}
                    disabled={loading || busy || !dictation.available}
                    aria-label={
                      dictation.status === "listening"
                        ? "Stop voice input"
                        : "Start voice input"
                    }
                    aria-pressed={dictation.status === "listening"}
                    title={
                      dictation.available
                        ? "Voice input"
                        : "Voice input is unavailable on this device"
                    }
                    className={cn(
                      "motion-tactile flex size-10 shrink-0 items-center justify-center rounded-lg disabled:opacity-35",
                      dictation.status === "listening"
                        ? "animate-pulse bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {dictation.status === "listening" ? (
                      <StopCircle size={18} weight="fill" />
                    ) : (
                      <Microphone size={18} weight="bold" />
                    )}
                  </button>
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      busy ||
                      (input.trim().length === 0 &&
                        attachment?.status !== "ready")
                    }
                    aria-label="Send message"
                    className="coach-send-button motion-tactile flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:bg-foreground/25 disabled:text-background/60"
                  >
                    <PaperPlaneTilt size={17} weight="fill" />
                  </button>
                </div>
                {dictation.status === "listening" ? (
                  <p
                    role="status"
                    aria-live="polite"
                    className="px-2.5 pt-1 text-[9px] font-bold text-foreground/65"
                  >
                    Listening
                    {dictation.interim ? ` · ${dictation.interim}` : "…"}
                  </p>
                ) : dictation.error ? (
                  <p
                    role="status"
                    className="px-2.5 pt-1 text-[9px] font-medium text-destructive"
                  >
                    {dictation.error}
                  </p>
                ) : null}
                <div className="flex items-center justify-end px-2.5 pb-1">
                  {input.length > 900 && (
                    <p className="text-[9px] font-bold text-muted-foreground/45 tabular-nums">
                      {input.length}/1200
                    </p>
                  )}
                </div>
              </div>
            </TourAnchor>
          </form>
        </div>
      </div>
      {/* Portaled to <body>: embedded in the workout sheet this sits inside a
          transformed, clipped panel, where a fixed overlay is measured against
          the panel instead of the screen and stutters with it. */}
      {newChatPhase !== "idle" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="coach-new-chat-ritual fixed inset-0 z-[80] flex items-center justify-center"
            data-new-chat-phase={newChatPhase}
            aria-hidden="true"
          >
            <div className="coach-new-chat-bin">
              <Sparkle
                className="coach-new-chat-sparkle coach-new-chat-sparkle--one"
                size={12}
                weight="fill"
              />
              <TrashSimple size={42} weight="thin" />
              <Sparkle
                className="coach-new-chat-sparkle coach-new-chat-sparkle--two"
                size={8}
                weight="fill"
              />
            </div>
          </div>,
          document.body
        )}
      <CoachSheet
        title="Coach activity"
        open={showHistory}
        onClose={() => setShowHistory(false)}
        mode={activeMode}
      >
        <input
          value={historySearch}
          onChange={(event) => setHistorySearch(event.target.value)}
          placeholder="Search Coach changes"
          className="mb-3 min-h-11 w-full rounded-xl border border-border/60 bg-card px-3 text-[12px] outline-none"
        />
        {(actionHistory ?? []).length === 0 ? (
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            Coach changes will appear here with an undo option.
          </p>
        ) : (
          <div className="divide-y divide-border/45">
            {(actionHistory ?? [])
              .filter((event) =>
                event.summary
                  .toLowerCase()
                  .includes(historySearch.trim().toLowerCase())
              )
              .map((event) => (
                <div key={event._id} className="flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full",
                      event.status === "undone"
                        ? "bg-muted text-muted-foreground"
                        : "bg-[var(--status-success)]/10 text-[var(--status-success)]"
                    )}
                  >
                    {event.status === "undone" ? (
                      <ClockCounterClockwise size={14} />
                    ) : (
                      <CheckCircle size={14} weight="fill" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold">{event.summary}</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {event.status === "undone" ? "Undone" : "Applied"} ·{" "}
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {event.status === "applied" ? (
                    <button
                      type="button"
                      onClick={() => void undoAction(String(event._id))}
                      className="min-h-9 px-2 text-[10px] font-black"
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </CoachSheet>
      <CoachSheet
        title="Coach memory"
        open={showMemory}
        onClose={() => setShowMemory(false)}
        mode={activeMode}
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Coach uses these durable preferences when creating meals, workouts,
          and weekly plans. Say “remember…” in chat to add one.
        </p>
        <div className="mt-4 rounded-2xl border border-border/60 bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <select
              value={newMemoryCategory}
              onChange={(event) => setNewMemoryCategory(event.target.value)}
              aria-label="Memory category"
              className="min-h-11 rounded-xl bg-muted px-2 text-[10px] font-bold"
            >
              <option value="preference">Preference</option>
              <option value="food">Food</option>
              <option value="equipment">Equipment</option>
              <option value="schedule">Schedule</option>
              <option value="constraint">Constraint</option>
              <option value="response_style">Response style</option>
            </select>
            <input
              value={newMemoryValue}
              onChange={(event) => setNewMemoryValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                void addManualMemory()
              }}
              maxLength={240}
              placeholder="What should Coach remember?"
              className="min-h-11 min-w-0 flex-1 rounded-xl bg-muted px-3 text-[11px] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void addManualMemory()}
            disabled={!newMemoryValue.trim() || savingMemory}
            className="mt-2 min-h-10 w-full rounded-full bg-foreground text-[10px] font-black text-background disabled:opacity-40"
          >
            {savingMemory ? "Adding…" : "Add memory"}
          </button>
        </div>
        {(memories ?? []).length === 0 ? (
          <div className="mt-5 rounded-2xl bg-muted/45 p-4 text-[11px] text-muted-foreground">
            Try: “Remember that I only have dumbbells,” “Remember I dislike
            mushrooms,” or “Keep answers concise.”
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border/45">
            {(memories ?? []).map((memory) => (
              <div key={memory._id} className="flex items-center gap-3 py-3">
                <Brain size={15} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black capitalize">
                    {memory.category.replaceAll("_", " ")}
                  </p>
                  <p className="mt-0.5 text-[11px] break-words text-foreground/70">
                    {memory.value}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void removeMemory({ id: memory._id }).then(() =>
                      toast.success("Coach forgot that preference")
                    )
                  }
                  aria-label={`Forget ${memory.value}`}
                  className="min-h-9 px-2 text-[9px] font-bold text-muted-foreground"
                >
                  Forget
                </button>
              </div>
            ))}
          </div>
        )}
      </CoachSheet>
      <CoachSheet
        title="Check my form"
        open={showFormCoach}
        onClose={() => setShowFormCoach(false)}
        mode={activeMode}
      >
        <FormCoachPicker
          supported={formCoachMovements}
          onPick={(exercise, movement) => {
            hapticTap()
            setShowFormCoach(false)
            startFormCoachDraft({
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              slug: movement.slug,
            })
          }}
        />
      </CoachSheet>
      {/* The Coach canvas is an isolated, clipped stacking context sitting
          below the app chrome, so these have to leave it the same way the
          sheets above do — inside `main` they render underneath the page. */}
      {typeof document !== "undefined" &&
        createPortal(
          <>
            <FormCoachRecorder />
            <FormCoachReviewSheet />
            <FormCoachPoseConfirm />
          </>,
          document.body
        )}
      {aiAccessModal}
    </main>
  )
}
