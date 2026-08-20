import React, { useCallback, useState, useEffect, useMemo } from "react"
import {
  Compass,
  ArrowLeft,
  Barbell,
  BellSimple,
  CaretRight,
  Database,
  ForkKnife,
  GearFine,
  HardDrives,
  Info,
  Heartbeat,
  Key,
  Moon,
  PaperPlaneTilt,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserCircle,
  X,
} from "@phosphor-icons/react"
import { useAction, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { supportsLiveWorkoutStatusSetting } from "@/lib/workout-live-activity"
import { registeredPushToken, unregisterForCoachPush } from "@/lib/coach-push"
import {
  getHealthAvailability,
  getRecentHealthWorkouts,
  healthProvider,
  healthProviderLabel,
  isHealthSyncSupportedPlatform,
  openHealthProviderListing,
  openHealthSettings,
  requestHealthAuthorization,
  supportsHealthSettingsDeepLink,
  type HealthAvailability,
} from "@/lib/health-provider"
import {
  HEALTH_SYNC_DAYS_BACK,
  HEALTH_SYNC_LIMIT,
  healthWorkoutToImport,
} from "@/lib/health-sync"
import { api } from "../../../../convex/_generated/api"
import {
  healthMetricGroups,
  resolveHealthMetricSelection,
} from "../../../../convex/lib/healthMetricCatalog"
import { AboutApp } from "@/components/about-app"
import { useTour } from "@/components/walkthrough/tour-context"
import { WALKTHROUGH_CHAPTERS } from "@/lib/walkthrough/chapters"
import { walkthroughStatusLabel } from "@/lib/walkthrough/resolve"
import type { TourChapter } from "@/lib/walkthrough/types"
import type { Id } from "../../../../convex/_generated/dataModel"

/** "21:30" ↔ minutes-of-day, for the quiet-hours inputs. */
function minutesToTimeValue(minutes: number) {
  const clamped = Math.min(1439, Math.max(0, Math.trunc(minutes)))
  const hour = String(Math.floor(clamped / 60)).padStart(2, "0")
  const minute = String(clamped % 60).padStart(2, "0")
  return `${hour}:${minute}`
}

function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  hapticTap,
  hapticSelection,
  hapticMedium,
  hapticsEnabled,
  setHapticsEnabled,
} from "@/lib/haptics"
import {
  oneRepExportDocument,
  oneRepExportFilename,
  shareOrDownloadJsonExport,
} from "@/lib/data-export"
import { toast } from "@repo/ui"
import { useTheme } from "@repo/ui"
import posthog from "posthog-js"
import { trackUmami } from "@/lib/analytics"
import { convexClient } from "@/lib/convex"
import {
  authClient,
  betterAuthErrorMessage,
  signOutApp,
  useAppAuth,
} from "@/lib/auth-client"
import {
  restBellEnabled,
  restVibrationEnabled,
  setRestBellEnabled,
  setRestVibrationEnabled,
} from "@/lib/workout-celebration"
import {
  clearOfflineQueue,
  flushOfflineQueue,
  getOfflineQueueSummary,
  isBrowserOnline,
  subscribeOfflineQueue,
} from "@/lib/offline-queue"
import {
  offlineSyncErrorText,
  offlineSyncStatusCopy,
} from "@/lib/offline-sync-status"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { mealLabel } from "@/lib/food-log"
import { resetWelcomeNudge } from "@/lib/welcome-nudge"
import {
  isValidInviteEmail,
  normalizeInviteEmail,
  shareDiaryInvite,
  shareScopeLabel,
  type DiaryShare,
} from "@/lib/shared-diary"
import {
  DEFAULT_MEAL_IDS,
  DEFAULT_MEAL_SHARES,
  normalizeMealShares,
  resolveMealCalorieTargets,
  type MealShare,
} from "@/lib/meal-targets"
import { AppTooltip, APP_TOOLTIP_IDS } from "@/components/tooltips"
import {
  formatReminderLabel,
  mergeReminderSettings,
  syncPushReminders,
  type ReminderSettings,
} from "@/lib/reminders"
import {
  detectPwaInstallPlatform,
  isPwaStandalone,
  pwaInstallCopy,
  subscribePwaInstallState,
  takePwaInstallPrompt,
  type PwaBeforeInstallPromptEvent,
} from "@/lib/pwa-install"
import { useBilling } from "@/lib/billing"
import {
  BillingSubscriptionPanel,
  CheckoutResultOverlay,
} from "@/components/billing"
import { useAiFeatureGate } from "@/lib/ai-access"
import { useMomentPreview } from "@/lib/full-screen-events"
import { MOMENT_IDS, type MomentId } from "@/lib/moments"
import { ApiKeysSection } from "@/components/api-keys-section"
import { resolveConvexSiteUrl } from "@/lib/service-urls"
import { serverOverride } from "@/lib/server-config"
import { ServerPicker, currentServerLabel } from "@/components/server-picker"

/** Where a script or an MCP client points. Shown so nobody guesses the host. */
const apiSiteUrl =
  serverOverride?.convexSiteUrl ??
  resolveConvexSiteUrl(
    import.meta.env.VITE_CONVEX_SITE_URL,
    import.meta.env.VITE_CONVEX_URL
  )
const apiBaseUrl = apiSiteUrl ? `${apiSiteUrl}/v1` : undefined
const mcpEndpointUrl = apiSiteUrl ? `${apiSiteUrl}/mcp` : undefined
import {
  CompactSwitch,
  AiUsageProgress,
  DisclosureRow,
  GroupedList,
  ListRow,
  NavigationBar,
  NumberStepper,
  PrimaryButton,
  SectionSaveButton,
  SegmentedControl,
  SettingsRow,
  SettingsLoadingState,
  SettingsSectionIntro,
  MetricToggleList,
  SettingsSectionLabel,
  SettingsStatusPill as StatusPill,
  SyncStatusIcon,
  ToolbarButton,
} from "@repo/ui"
import { useTranslation } from "react-i18next"
import i18n, { setUiLanguage, storedUiLanguage, type UiLanguage } from "@/i18n"

const PRELOGIN_SEEN_KEY = "onerep:prelogin-onboarding-seen"

type WorkoutFocus = "strength" | "cardio" | "mobility"
type WeightUnit = "kg" | "lbs"
type FoodSearchLanguage = "en" | "es" | "fr" | "de" | "it" | "pt"
type AppTheme = "light" | "dark" | "system"
type SettingsView =
  | "overview"
  | "appearance"
  | "account"
  | "targets"
  | "preferences"
  | "nutrition"
  | "reminders"
  | "privacy"
  | "health"
  | "data"
  | "agents"
  | "server"
  | "walkthrough"
  | "about"
  | "developer"

const SHOW_DEV_SETTINGS = import.meta.env.DEV
const COACH_ONBOARDING_SEEN_KEY = "onerep:coach-onboarding-seen"

const SETTINGS_VIEW_TITLE_KEYS: Record<SettingsView, string> = {
  overview: "settings.titles.overview",
  appearance: "settings.titles.appearance",
  account: "settings.titles.account",
  targets: "settings.titles.targets",
  preferences: "settings.titles.preferences",
  nutrition: "settings.titles.nutrition",
  reminders: "settings.titles.reminders",
  privacy: "settings.titles.privacy",
  health: "settings.titles.health",
  data: "settings.titles.data",
  agents: "settings.titles.agents",
  server: "settings.titles.server",
  walkthrough: "settings.titles.walkthrough",
  about: "settings.titles.about",
  developer: "settings.titles.developer",
}

/**
 * Renders the Settings sheet UI for viewing and editing user preferences, goals, theme, and account actions.
 *
 * The component loads current preferences and effective goals, exposes controls for calories/protein/carbs/fat,
 * water goal, workout focus, and weight unit, and persists changes when the user saves.
 *
 * @param onClose - Callback invoked to close the settings sheet
 * @returns The Settings React element
 */
export default function Settings({ onClose }: { onClose: () => void }) {
  const navigate = useSmoothNavigate()
  const { t } = useTranslation()
  const [uiLanguage, setUiLanguageState] = useState<UiLanguage>(
    () => storedUiLanguage() ?? (i18n.language.slice(0, 2) as UiLanguage)
  )
  const { theme, setTheme } = useTheme()
  const { user } = useAppAuth()
  const billing = useBilling({
    userId: user?.id,
    email: user?.email,
    name: user?.name,
  })
  const preferences = useQuery(api.users.users.getPreferences)
  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {})
  const onboarding = useQuery(api.users.onboarding.get)
  const aiUsage = useQuery(api.ai.usage.getMonthlyUsage, {})
  const { showAiPaywall, aiAccessModal } = useAiFeatureGate()
  const byokStatus = useQuery(api.ai.byok.getStatus, {})
  const saveByokKey = useAction(api.ai.byok.setKey)
  const removeByokKey = useMutation(api.ai.byok.removeKey)
  const [byokInput, setByokInput] = useState("")
  const [byokBusy, setByokBusy] = useState(false)

  const healthSync = preferences?.healthSync
  const wearableConsent =
    (onboarding as { consent?: { wearableIntegrations?: boolean } } | null)
      ?.consent?.wearableIntegrations === true
  const healthWorkouts = useQuery(
    api.logs.healthWorkouts.list,
    isHealthSyncSupportedPlatform() ? { limit: 10 } : "skip"
  )
  const setConsent = useOfflineMutation(
    api.users.onboarding.setConsent,
    "users.onboarding.setConsent"
  )
  const setHealthSync = useOfflineMutation(
    api.users.users.setHealthSync,
    "users.users.setHealthSync"
  )
  const importHealthWorkouts = useMutation(
    api.logs.healthWorkouts.importHealthWorkouts
  )
  const linkHealthWorkout = useMutation(
    api.logs.healthWorkouts.linkToTrainingLog
  )
  const dismissHealthWorkout = useMutation(api.logs.healthWorkouts.dismiss)
  const [healthBusy, setHealthBusy] = useState(false)
  const [healthError, setHealthError] = useState<string | null>(null)

  const healthLabel = healthProviderLabel()
  // healthSyncEnabled is canonical; appleHealthEnabled is the legacy name still
  // dual-written server-side until the backfill runs.
  const healthSyncEnabled =
    healthSync?.healthSyncEnabled ?? healthSync?.appleHealthEnabled ?? false
  const healthWriteEnabled = healthSync?.writeEnabled ?? false
  // Merged over the catalogue defaults, so a metric added after this user last
  // opened the screen arrives switched on rather than silently absent.
  const healthMetricSelection = resolveHealthMetricSelection(
    healthSync?.metrics
  )
  const liveWorkoutStatusEnabled = preferences?.liveWorkoutStatusEnabled ?? true
  const [healthAvailability, setHealthAvailability] =
    useState<HealthAvailability | null>(null)
  useEffect(() => {
    if (!isHealthSyncSupportedPlatform()) return
    void getHealthAvailability()
      .then(setHealthAvailability)
      .catch(() => setHealthAvailability(null))
  }, [])
  // Health Connect is a separate app that can be missing or outdated, which
  // HealthKit never is. Without this the toggle would simply fail forever.
  const healthProviderUnavailable =
    healthProvider() === "health_connect" &&
    healthAvailability !== null &&
    healthAvailability.providerStatus !== "available"

  const setDashboardSettings = useOfflineMutation(
    api.users.users.setDashboardSettings,
    "users.users.setDashboardSettings"
  )
  const setWeightUnit = useOfflineMutation(
    api.users.users.setWeightUnit,
    "users.users.setWeightUnit"
  )
  const setFoodSearchLanguage = useOfflineMutation(
    api.users.users.setFoodSearchLanguage,
    "users.users.setFoodSearchLanguage"
  )
  const setWaterGoal = useOfflineMutation(
    api.users.users.setWaterGoal,
    "users.users.setWaterGoal"
  )
  const setCustomGoals = useOfflineMutation(
    api.users.users.setCustomGoals,
    "users.users.setCustomGoals"
  )
  const setMacroCycling = useOfflineMutation(
    api.users.users.setMacroCycling,
    "users.users.setMacroCycling"
  )
  const outgoingSharesQuery = useQuery(api.sharing.diaryShares.listOutgoing, {})
  const outgoingShares = (outgoingSharesQuery ?? []) as DiaryShare[]
  const inviteToDiary = useOfflineMutation(
    api.sharing.diaryShares.invite,
    "sharing.diaryShares.invite"
  )
  const revokeShare = useOfflineMutation(
    api.sharing.diaryShares.revoke,
    "sharing.diaryShares.revoke"
  )
  const setNetCarbsEnabled = useOfflineMutation(
    api.users.users.setNetCarbsEnabled,
    "users.users.setNetCarbsEnabled"
  )
  const setMealCalorieTargets = useOfflineMutation(
    api.users.users.setMealCalorieTargets,
    "users.users.setMealCalorieTargets"
  )
  const setWorkoutAdjustment = useOfflineMutation(
    api.users.users.setWorkoutAdjustment,
    "users.users.setWorkoutAdjustment"
  )
  const setLiveWorkoutStatus = useMutation(api.users.users.setLiveWorkoutStatus)
  const setCoachOutreach = useMutation(api.users.users.setCoachOutreach)
  const unregisterPushToken = useMutation(api.push.tokens.unregister)

  // Best-effort, before the session dies: revoking needs auth, and a token
  // left behind keeps receiving coaching for an account somebody walked away
  // from. Failure must never block the sign-out itself.
  const revokeCoachPush = useCallback(async () => {
    const token = registeredPushToken()
    if (token) await unregisterPushToken({ token }).catch(() => undefined)
    await unregisterForCoachPush().catch(() => undefined)
  }, [unregisterPushToken])
  const setPushReminders = useOfflineMutation(
    api.users.users.setPushReminders,
    "users.users.setPushReminders"
  )
  const setPrivacySettings = useOfflineMutation(
    api.users.users.setPrivacySettings,
    "users.users.setPrivacySettings"
  )
  const clearOnboarding = useMutation(api.users.onboarding.clear)
  const resetShownTooltips = useMutation(api.users.tooltips.resetShownTooltips)
  const clearMomentHistory = useMutation(api.users.moments.clearHistory)
  // Only for the count on the overview row; the panel loads its own list.
  const mcpTokens = useQuery(api.mcp.tokens.list)
  const mcpTokenCount = mcpTokens?.length ?? 0
  const { startPreview } = useMomentPreview()
  const tour = useTour()
  const deleteMyDataBatch = useMutation(api.users.users.deleteMyDataBatch)

  const [workoutFocus, setWorkoutFocus] = useState<WorkoutFocus>(
    (preferences?.dashboardSettings?.workoutFocus as WorkoutFocus) || "strength"
  )
  const [simpleDashboard, setSimpleDashboard] = useState(
    preferences?.dashboardSettings?.simpleMode ?? false
  )
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>(
    (preferences?.weightUnit as WeightUnit) || "kg"
  )
  const [foodSearchLanguage, setFoodSearchLanguageState] =
    useState<FoodSearchLanguage>(
      (preferences?.foodSearchLanguage as FoodSearchLanguage) || "en"
    )
  const [waterGoal, setWaterGoalState] = useState(
    preferences?.waterGoalMl ?? 2500
  )
  const [calories, setCalories] = useState(
    effectiveGoals?.effective.calories ?? 2000
  )
  const [protein, setProtein] = useState(
    effectiveGoals?.effective.protein ?? 150
  )
  const [carbs, setCarbs] = useState(effectiveGoals?.effective.carbs ?? 200)
  const [fat, setFat] = useState(effectiveGoals?.effective.fat ?? 65)
  const [goalsInitialized, setGoalsInitialized] = useState(false)

  const [macroCyclingEnabled, setMacroCyclingEnabled] = useState(false)
  const [restDayTargets, setRestDayTargets] = useState({
    calories: 1800,
    protein: 150,
    carbs: 150,
    fat: 60,
  })
  const [trainingDayTargets, setTrainingDayTargets] = useState({
    calories: 2200,
    protein: 150,
    carbs: 250,
    fat: 65,
  })
  const [workoutAdjustmentEnabled, setWorkoutAdjustmentEnabled] =
    useState(false)
  const [netCarbsEnabled, setNetCarbsEnabledState] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [mealTargetsEnabled, setMealTargetsEnabledState] = useState(false)
  const [mealShares, setMealShares] = useState<MealShare[]>(DEFAULT_MEAL_SHARES)
  const [pushReminders, setPushRemindersState] = useState<ReminderSettings>(
    mergeReminderSettings(null)
  )
  // Mirrors the server defaults in convex/lib/outreach.ts: outreach is on
  // until the user says otherwise, which is the only way a feature that speaks
  // first ever reaches anyone.
  const [coachOutreach, setCoachOutreachState] = useState({
    enabled: true,
    weeklyReview: true,
    nudges: true,
    quietHours: { startMinutes: 21 * 60 + 30, endMinutes: 8 * 60 },
  })
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    return safeLocalStorageGet("onerep:analytics-enabled") === "true"
  })
  const [personalizedInsightsEnabled, setPersonalizedInsightsEnabled] =
    useState(true)
  const [offlineQueueTotal, setOfflineQueueTotal] = useState(0)
  const [offlineQueueError, setOfflineQueueError] = useState<string | null>(
    null
  )
  const [offlineOnline, setOfflineOnline] = useState(() => isBrowserOnline())
  const [syncingOfflineQueue, setSyncingOfflineQueue] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")

  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [resettingOnboarding, setResettingOnboarding] = useState(false)
  const [refreshingTooltips, setRefreshingTooltips] = useState(false)
  const [testingNotification, setTestingNotification] = useState(false)
  const [sendingTestEmail, setSendingTestEmail] = useState<string | null>(null)
  const sendTestEmail = useMutation(api.users.devEmails.sendTest)
  const [clearingMoments, setClearingMoments] = useState(false)
  const [activeView, setActiveView] = useState<SettingsView>("overview")
  const [hapticsOn, setHapticsOn] = useState(() => {
    if (typeof window === "undefined") return true
    return hapticsEnabled()
  })
  const [restBellOn, setRestBellOn] = useState(() => restBellEnabled())
  const [restVibrationOn, setRestVibrationOn] = useState(() =>
    restVibrationEnabled()
  )
  const [pwaInstallPrompt, setPwaInstallPrompt] =
    useState<PwaBeforeInstallPromptEvent | null>(null)
  const [pwaInstalled, setPwaInstalled] = useState(() => {
    if (typeof window === "undefined") return false
    return isPwaStandalone(window)
  })
  const [pwaPlatform] = useState(() => {
    if (typeof window === "undefined") return "other" as const
    return detectPwaInstallPlatform(window)
  })
  const pwaCopy = pwaInstallCopy({
    hasPrompt: pwaInstallPrompt !== null,
    installed: pwaInstalled,
    platform: pwaPlatform,
  })
  const offlineSyncStatus = offlineSyncStatusCopy({
    online: offlineOnline,
    canSync: Boolean(user),
    syncing: syncingOfflineQueue,
    total: offlineQueueTotal,
    lastError: offlineQueueError,
  })
  const offlineSyncActionLabel = syncingOfflineQueue
    ? "Syncing"
    : !offlineOnline
      ? "Offline"
      : offlineQueueError
        ? "Retry"
        : offlineQueueTotal > 0
          ? "Sync"
          : "Synced"

  useEffect(
    () =>
      subscribePwaInstallState((state) => {
        setPwaInstallPrompt(state.prompt)
        setPwaInstalled(state.installed)
      }),
    []
  )

  useEffect(() => {
    if (preferences?.dashboardSettings?.workoutFocus) {
      setWorkoutFocus(
        preferences.dashboardSettings.workoutFocus as WorkoutFocus
      )
    }
    if (preferences?.dashboardSettings?.simpleMode !== undefined) {
      setSimpleDashboard(preferences.dashboardSettings.simpleMode)
    }
    if (preferences?.macroCyclingEnabled !== undefined) {
      setMacroCyclingEnabled(preferences.macroCyclingEnabled)
    }
    if (preferences?.macroCyclingTargets) {
      setRestDayTargets(preferences.macroCyclingTargets.restDay)
      setTrainingDayTargets(preferences.macroCyclingTargets.trainingDay)
    }
    if (preferences?.workoutAdjustmentEnabled !== undefined) {
      setWorkoutAdjustmentEnabled(preferences.workoutAdjustmentEnabled)
    }
    if (preferences?.netCarbsEnabled !== undefined) {
      setNetCarbsEnabledState(preferences.netCarbsEnabled)
    }
    if (preferences?.mealCalorieTargets) {
      setMealTargetsEnabledState(preferences.mealCalorieTargets.enabled)
    }
    // Normalising against the live category list means a category added or
    // removed since the last save shows up in the editor straight away.
    setMealShares(
      normalizeMealShares(preferences?.mealCalorieTargets?.shares, [
        ...DEFAULT_MEAL_IDS,
        ...(preferences?.customMealCategories ?? []).map(
          (category) => category.id
        ),
      ])
    )
    if (preferences?.pushReminders || preferences?.bodyReminder) {
      setPushRemindersState(
        mergeReminderSettings({
          ...(preferences.pushReminders ?? {}),
          body: preferences.pushReminders?.body ?? preferences.bodyReminder,
        })
      )
    }
    if (preferences?.coachOutreach) {
      setCoachOutreachState({
        enabled: preferences.coachOutreach.enabled,
        weeklyReview: preferences.coachOutreach.weeklyReview,
        nudges: preferences.coachOutreach.nudges,
        quietHours: preferences.coachOutreach.quietHours ?? {
          startMinutes: 21 * 60 + 30,
          endMinutes: 8 * 60,
        },
      })
    }
    if (preferences?.privacySettings) {
      setAnalyticsEnabled(preferences.privacySettings.analyticsEnabled)
      setPersonalizedInsightsEnabled(
        preferences.privacySettings.personalizedInsightsEnabled
      )
    }
  }, [preferences])

  useEffect(() => {
    if (preferences?.weightUnit) {
      setWeightUnitState(preferences.weightUnit as WeightUnit)
    }
    if (preferences?.foodSearchLanguage) {
      setFoodSearchLanguageState(
        preferences.foodSearchLanguage as FoodSearchLanguage
      )
    }
  }, [preferences])

  useEffect(() => {
    if (preferences?.waterGoalMl) {
      setWaterGoalState(preferences.waterGoalMl)
    }
  }, [preferences])

  useEffect(() => {
    if (effectiveGoals === undefined) return

    if (effectiveGoals?.effective) {
      setCalories(effectiveGoals.effective.calories)
      setProtein(effectiveGoals.effective.protein)
      setCarbs(effectiveGoals.effective.carbs)
      setFat(effectiveGoals.effective.fat)
    }
    setGoalsInitialized(true)
  }, [effectiveGoals])

  useEffect(() => {
    const refresh = () => {
      const summary = getOfflineQueueSummary()
      setOfflineQueueTotal(summary.total)
      setOfflineQueueError(summary.lastError)
      setOfflineOnline(isBrowserOnline())
    }
    refresh()
    const unsubscribe = subscribeOfflineQueue(refresh)
    window.addEventListener("online", refresh)
    window.addEventListener("offline", refresh)
    return () => {
      unsubscribe()
      window.removeEventListener("online", refresh)
      window.removeEventListener("offline", refresh)
    }
  }, [])

  function handleThemeChange(nextTheme: AppTheme) {
    hapticMedium()
    setTheme(nextTheme)
  }

  function handleHapticsChange(enabled: boolean) {
    if (enabled) hapticSelection()
    setHapticsOn(enabled)
    setHapticsEnabled(enabled)
    toast.success(enabled ? "Haptics enabled" : "Haptics disabled")
  }

  async function runSectionSave(action: () => Promise<void>, success: string) {
    if (saving) return
    hapticTap()
    setSaving(true)
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveWorkout() {
    await runSectionSave(async () => {
      await setDashboardSettings({ workoutFocus, simpleMode: simpleDashboard })
      await setWeightUnit({ unit: weightUnit })
      await setFoodSearchLanguage({ language: foodSearchLanguage })
    }, "Workout settings saved")
  }

  async function handleSaveTargets() {
    await runSectionSave(async () => {
      await setCustomGoals({
        calories,
        protein,
        carbs,
        fat,
      })
      await setWaterGoal({ goalMl: waterGoal })
    }, "Targets saved")
  }

  const mealSharesTotal = mealShares.reduce(
    (total, share) => total + share.percent,
    0
  )
  // Preview the calorie split live, using the same normalisation the server
  // applies on save, so the numbers shown are the numbers stored.
  const resolvedMealCalories = useMemo(() => {
    const resolved = resolveMealCalorieTargets(
      normalizeMealShares(
        mealShares,
        mealShares.map((share) => share.meal)
      ),
      effectiveGoals?.effective.calories ?? 2000
    )
    return new Map(resolved.map((item) => [item.meal, item.calories]))
  }, [mealShares, effectiveGoals?.effective.calories])

  async function handleSaveNutritionLogic() {
    await runSectionSave(async () => {
      await setMacroCycling({
        enabled: macroCyclingEnabled,
        targets: macroCyclingEnabled
          ? { restDay: restDayTargets, trainingDay: trainingDayTargets }
          : undefined,
      })
      await setWorkoutAdjustment({ enabled: workoutAdjustmentEnabled })
      await setNetCarbsEnabled({ enabled: netCarbsEnabled })
      await setMealCalorieTargets({
        enabled: mealTargetsEnabled,
        shares: mealShares.map(({ meal, percent }) => ({ meal, percent })),
      })
      if (mealTargetsEnabled && Math.abs(mealSharesTotal - 100) > 0.5) {
        toast.info("Meal split adjusted to total 100%")
      }
    }, "Nutrition logic saved")
  }

  async function handleSaveNotifications() {
    await runSectionSave(async () => {
      await setPushReminders({ reminders: pushReminders })
      const reminderStatus = await syncPushReminders(pushReminders)
      if (reminderStatus === "denied") {
        throw new Error("Notifications permission is required for reminders")
      }
    }, "Notifications saved")
  }

  async function handleSavePrivacy() {
    await runSectionSave(async () => {
      await setPrivacySettings({
        analyticsEnabled,
        personalizedInsightsEnabled,
      })

      safeLocalStorageSet("onerep:analytics-enabled", String(analyticsEnabled))
      // Fired before the opt-out so the last thing PostHog hears is the reason
      // it is going quiet. Umami takes it either way — it is anonymous.
      trackUmami("privacy_settings_saved", {
        analytics: analyticsEnabled,
        personalized_insights: personalizedInsightsEnabled,
      })
      if (analyticsEnabled) posthog.opt_in_capturing()
      else posthog.opt_out_capturing()
    }, "Privacy settings saved")
  }

  async function handleLogout() {
    if (loggingOut) return
    hapticMedium()

    // Logging out wipes the queue. Try to land the writes first, and if any
    // survive, say so out loud rather than deleting the user's work on a
    // single tap of a button labelled "Remove this account from this device".
    if (getOfflineQueueSummary().total > 0 && isBrowserOnline()) {
      try {
        await flushOfflineQueue()
      } catch {
        // Fall through to the warning below.
      }
    }
    const stranded = getOfflineQueueSummary().total
    if (stranded > 0) {
      const plural = stranded === 1 ? "change" : "changes"
      if (
        !window.confirm(
          `${stranded} ${plural} haven't synced yet and will be lost if you log out now. Log out anyway?`
        )
      ) {
        return
      }
    }

    setLoggingOut(true)
    try {
      await revokeCoachPush()
      clearOfflineQueue()
      await signOutApp()
      safeLocalStorageRemove(PRELOGIN_SEEN_KEY)
      trackUmami("user_signed_out")
      posthog.reset()
      navigate("/login", { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Log out failed")
    } finally {
      setLoggingOut(false)
    }
  }

  async function handleResetOnboarding() {
    if (resettingOnboarding) return
    hapticTap()
    setResettingOnboarding(true)
    try {
      await clearOnboarding({})
      navigate("/onboarding", { replace: true })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reset onboarding"
      )
    } finally {
      setResettingOnboarding(false)
    }
  }

  function handleResetCoachOnboarding() {
    hapticTap()
    safeLocalStorageRemove(COACH_ONBOARDING_SEEN_KEY)
    toast.success("Coach onboarding reset")
    navigate("/onboarding?replay=coach", { replace: true })
  }

  async function handleRefreshShownTooltips() {
    if (refreshingTooltips) return
    hapticTap()
    setRefreshingTooltips(true)
    try {
      await resetShownTooltips({})
      toast.success("Shown tooltips refreshed")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not refresh tooltips"
      )
    } finally {
      setRefreshingTooltips(false)
    }
  }

  /**
   * Opens a moment over the top of Settings with its trigger bypassed. It
   * reads the real account data, so what you see is what that user would get;
   * it writes nothing, so previewing it here does not cost the real one.
   */
  function handlePreviewMoment(id: MomentId) {
    hapticTap()
    startPreview(id)
  }

  async function handleClearMomentHistory() {
    if (clearingMoments) return
    hapticTap()
    setClearingMoments(true)
    try {
      const { cleared } = await clearMomentHistory({})
      toast.success(
        cleared === 0
          ? "Nothing to forget"
          : `Forgot ${cleared} shown moment${cleared === 1 ? "" : "s"}`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear moments"
      )
    } finally {
      setClearingMoments(false)
    }
  }

  /**
   * Clears the chapter, then navigates to where it lives. Letting the normal
   * trigger path start it keeps one code path and respects the route settle.
   */
  async function handleReplayChapter(chapter: TourChapter) {
    hapticTap()
    try {
      await tour.resetChapter(chapter.id)
      navigate(chapter.route, { motion: "switch" })
    } catch {
      toast.error("Could not restart that walkthrough")
    }
  }

  async function handleReplayEverything() {
    hapticTap()
    try {
      await tour.resetChapter()
      toast.success("Walkthrough reset")
      navigate("/", { motion: "switch" })
    } catch {
      toast.error("Could not reset the walkthrough")
    }
  }

  async function handleSendTestEmail(
    kind: "verification" | "password-reset" | "diary-invite"
  ) {
    if (sendingTestEmail) return
    hapticTap()
    setSendingTestEmail(kind)
    try {
      await sendTestEmail({ kind })
      toast.success("On its way — check your inbox")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the email"
      )
    } finally {
      setSendingTestEmail(null)
    }
  }

  async function handleTestNotification() {
    if (testingNotification) return
    hapticTap()
    setTestingNotification(true)
    try {
      const { LocalNotifications } =
        await import("@capacitor/local-notifications")
      const permission = await LocalNotifications.requestPermissions()
      if (permission.display !== "granted") {
        toast.error("Notification permission was not granted")
        return
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: 909_001,
            title: "OneRep test notification",
            body: "Notifications are working on this device.",
            schedule: { at: new Date(Date.now() + 2_000) },
          },
        ],
      })
      toast.success("Test notification scheduled")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not test notifications"
      )
    } finally {
      setTestingNotification(false)
    }
  }

  function updateReminder(
    kind: keyof ReminderSettings,
    patch: Partial<ReminderSettings[keyof ReminderSettings]>
  ) {
    setPushRemindersState((current) => ({
      ...current,
      [kind]: { ...current[kind], ...patch },
    }))
  }

  async function handleFlushOfflineQueue() {
    if (syncingOfflineQueue) return
    if (!isBrowserOnline()) {
      const summary = getOfflineQueueSummary()
      setOfflineQueueTotal(summary.total)
      setOfflineQueueError(summary.lastError)
      setOfflineOnline(false)
      toast.message(
        summary.total > 0
          ? `${summary.total} change${summary.total === 1 ? "" : "s"} saved on this device. They’ll sync when you reconnect.`
          : "You’re offline. New changes stay saved on this device."
      )
      return
    }

    hapticTap()
    setSyncingOfflineQueue(true)
    try {
      const result = await flushOfflineQueue()
      const summary = getOfflineQueueSummary()
      setOfflineQueueTotal(summary.total)
      setOfflineQueueError(summary.lastError)
      setOfflineOnline(isBrowserOnline())
      if (result.remaining === 0) {
        toast.success(
          result.flushed > 0
            ? "Offline changes synced"
            : "All changes are synced"
        )
      } else if (summary.lastError) {
        toast.error("Some changes need attention. Tap Retry to try again.")
      } else {
        toast.message(
          `${result.remaining} change${result.remaining === 1 ? "" : "s"} saved locally and waiting to sync.`
        )
      }
    } catch (error) {
      const summary = getOfflineQueueSummary()
      setOfflineQueueTotal(summary.total)
      setOfflineQueueError(offlineSyncErrorText(error))
      setOfflineOnline(isBrowserOnline())
      toast.error(offlineSyncErrorText(error))
    } finally {
      setSyncingOfflineQueue(false)
    }
  }

  async function handleInstallApp() {
    hapticTap()
    if (!pwaInstallPrompt) {
      toast.message(pwaCopy.description)
      return
    }

    const prompt = takePwaInstallPrompt()
    if (!prompt) return
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === "accepted") {
        toast.success("OneRep install started")
      } else {
        toast.message("Install dismissed")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Install failed")
    }
  }

  function handleClearLocalData() {
    hapticMedium()
    clearOfflineQueue()
    safeLocalStorageRemove("onerep:analytics-enabled")
    setTheme("system")
    setOfflineQueueTotal(0)
    toast.success("Data on this device cleared")
  }

  async function handleExportData() {
    if (exporting) return
    setExporting(true)
    try {
      const exportData = await convexClient.query(
        api.users.users.exportMyData,
        {}
      )
      const exportedAt = new Date()
      const exportDocument = await oneRepExportDocument(exportData, {
        date: exportedAt,
      })
      const delivery = await shareOrDownloadJsonExport(
        exportDocument,
        oneRepExportFilename(exportedAt)
      )
      if (delivery !== "cancelled") {
        toast.success(
          delivery === "shared"
            ? "Export shared with a verification code"
            : "Export downloaded with a verification code"
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE" || deleting) return
    setDeleting(true)
    try {
      let remaining = true
      let batches = 0
      while (remaining && batches < 100) {
        const result = await deleteMyDataBatch({ batchSize: 100 })
        remaining = result.remaining
        batches += 1
        if (result.deleted === 0 && result.remaining) {
          throw new Error("Could not finish deleting account data")
        }
      }
      if (remaining)
        throw new Error("Account has too much data to delete in one session")

      const deletedAccount = await authClient.deleteUser({})
      if (deletedAccount.error) {
        throw new Error(
          betterAuthErrorMessage(
            deletedAccount.error,
            "Could not delete the account login"
          )
        )
      }

      await revokeCoachPush()
      clearOfflineQueue()
      await signOutApp().catch(() => undefined)

      trackUmami("account_deleted")
      posthog.reset()
      navigate("/login", { replace: true })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Account deletion failed"
      )
    } finally {
      setDeleting(false)
    }
  }

  const settingsContentReady = goalsInitialized
  const activeReminderCount = Object.values(pushReminders).filter(
    (reminder) => reminder.enabled
  ).length

  function showView(view: SettingsView) {
    hapticSelection()
    setActiveView(view)
    window.scrollTo({ top: 0, behavior: "auto" })
  }

  function showOverview() {
    if (activeView === "overview") {
      onClose()
      return
    }
    hapticSelection()
    setActiveView("overview")
    window.scrollTo({ top: 0, behavior: "auto" })
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background text-foreground lg:pr-8 lg:pl-72">
      <main className="mx-auto min-h-svh w-full max-w-2xl pb-[calc(var(--app-safe-bottom-lg)+5rem)] md:pb-12">
        <NavigationBar
          title={t(SETTINGS_VIEW_TITLE_KEYS[activeView])}
          subtitle={
            activeView === "overview" ? "Your OneRep experience" : undefined
          }
          large={activeView === "overview"}
          leading={
            activeView !== "overview" ? (
              <ToolbarButton
                onClick={showOverview}
                aria-label="Back to settings"
              >
                <ArrowLeft size={20} weight="bold" />
              </ToolbarButton>
            ) : undefined
          }
        />

        {!settingsContentReady ? (
          <SettingsLoadingState />
        ) : (
          <div key={activeView} className="animate-in duration-200 fade-in">
            {activeView === "overview" && (
              <>
                <button
                  type="button"
                  onClick={() => showView("account")}
                  className="mx-[var(--app-page-x)] flex items-center gap-3 border-y border-border py-4 text-left active:bg-muted/35"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                    <UserCircle size={27} weight="regular" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-semibold tracking-tight">
                      {user?.name || "Your account"}
                    </span>
                    <span className="native-row-detail block truncate">
                      {user?.email || "Account and subscription"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusPill
                      label={billing.hasOneRepPro ? "Pro" : "Free"}
                      strong={billing.hasOneRepPro}
                    />
                    <CaretRight size={18} className="text-muted-foreground" />
                  </span>
                </button>

                <SettingsSectionLabel
                  title="Plan"
                  detail="Targets, training, and daily guidance"
                />
                <GroupedList label="Plan settings">
                  <DisclosureRow
                    title="Daily targets"
                    detail="Calories, macros, and water"
                    value={`${calories.toLocaleString()} kcal`}
                    leading={<ForkKnife size={20} weight="regular" />}
                    onClick={() => showView("targets")}
                  />
                  <DisclosureRow
                    title="Training & app"
                    detail="Focus, units, language, and feedback"
                    value={
                      workoutFocus[0].toUpperCase() + workoutFocus.slice(1)
                    }
                    leading={<Barbell size={20} weight="regular" />}
                    onClick={() => showView("preferences")}
                  />
                  <DisclosureRow
                    title="Nutrition strategy"
                    detail="Macro cycling and workout adjustments"
                    value={macroCyclingEnabled ? "Cycling" : "Standard"}
                    leading={<SlidersHorizontal size={20} weight="regular" />}
                    onClick={() => showView("nutrition")}
                  />
                  <DisclosureRow
                    title="Reminders"
                    detail="Meals, water, workouts, and check-ins"
                    value={
                      activeReminderCount > 0
                        ? `${activeReminderCount} on`
                        : "Off"
                    }
                    leading={<BellSimple size={20} weight="regular" />}
                    onClick={() => showView("reminders")}
                  />
                </GroupedList>

                <SettingsSectionLabel
                  title="App"
                  detail="Appearance, privacy, and account data"
                />
                <GroupedList label="App settings">
                  <DisclosureRow
                    title="Appearance"
                    detail={
                      theme === "system"
                        ? "Follow this device"
                        : `${theme === "dark" ? "Dark" : "Light"} theme`
                    }
                    value={theme[0].toUpperCase() + theme.slice(1)}
                    leading={
                      theme === "dark" ? (
                        <Moon size={20} weight="regular" />
                      ) : (
                        <Sun size={20} weight="regular" />
                      )
                    }
                    onClick={() => showView("appearance")}
                  />
                  <DisclosureRow
                    title="Privacy & sync"
                    detail={offlineSyncStatus.body}
                    value={offlineSyncActionLabel}
                    leading={<ShieldCheck size={20} weight="regular" />}
                    onClick={() => showView("privacy")}
                  />
                  {/* A health row on the web is dead UI — there is no store to read. */}
                  {isHealthSyncSupportedPlatform() && (
                    <DisclosureRow
                      title="Health & wearables"
                      detail={
                        healthSyncEnabled
                          ? `Importing workouts from ${healthLabel}`
                          : `Import workouts from ${healthLabel}`
                      }
                      leading={<Heartbeat size={20} weight="regular" />}
                      onClick={() => showView("health")}
                    />
                  )}
                  <DisclosureRow
                    title="Data & account"
                    detail="Export, reset, or delete your data"
                    leading={<Database size={20} weight="regular" />}
                    onClick={() => showView("data")}
                  />
                  <DisclosureRow
                    title="API & MCP"
                    detail={
                      mcpTokenCount > 0
                        ? `${mcpTokenCount} active ${mcpTokenCount === 1 ? "key" : "keys"}`
                        : "Keys for your own scripts, Claude, or another MCP client"
                    }
                    value={
                      mcpTokenCount > 0 ? String(mcpTokenCount) : undefined
                    }
                    leading={<Key size={20} weight="regular" />}
                    onClick={() => showView("agents")}
                  />
                  <DisclosureRow
                    title="Server"
                    detail={
                      serverOverride
                        ? "Connected to your self-hosted server"
                        : "OneRep Cloud, the default"
                    }
                    value={serverOverride ? "Custom" : undefined}
                    leading={<HardDrives size={20} weight="regular" />}
                    onClick={() => showView("server")}
                  />
                  <DisclosureRow
                    title="App walkthrough"
                    detail="Replay the guided tour of each area"
                    leading={<Compass size={20} weight="regular" />}
                    onClick={() => showView("walkthrough")}
                  />
                  <DisclosureRow
                    title="About"
                    detail="Version, updates, and what is installed"
                    leading={<Info size={20} weight="regular" />}
                    onClick={() => showView("about")}
                  />
                  {SHOW_DEV_SETTINGS && (
                    <DisclosureRow
                      title="Developer"
                      detail="Internal testing controls"
                      leading={<GearFine size={20} weight="regular" />}
                      onClick={() => showView("developer")}
                    />
                  )}
                </GroupedList>

                <p className="native-row-detail px-[var(--app-page-x)] pt-7 text-center">
                  OneRep keeps core tracking available without Pro.
                </p>
              </>
            )}

            {activeView === "server" && (
              <>
                <SettingsSectionIntro>
                  OneRep can run against the hosted service or an install you
                  run yourself. Currently connected to {currentServerLabel()}.
                </SettingsSectionIntro>
                <div className="px-[var(--app-page-x)]">
                  <ServerPicker />
                </div>
              </>
            )}

            {activeView === "appearance" && (
              <>
                <SettingsSectionIntro>
                  Choose a fixed theme or keep OneRep in step with this device.
                </SettingsSectionIntro>
                <GroupedList label="Appearance options">
                  <SettingsRow label="Theme">
                    <SegmentedControl
                      onInteract={hapticSelection}
                      label="Theme"
                      value={theme}
                      onChange={(value) => handleThemeChange(value as AppTheme)}
                      options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                        { value: "system", label: "System" },
                      ]}
                    />
                  </SettingsRow>
                </GroupedList>
                <p className="native-row-detail px-[var(--app-page-x)] pt-3">
                  System updates automatically when your device appearance
                  changes.
                </p>
              </>
            )}

            {activeView === "account" && (
              <>
                <SettingsSectionIntro>
                  Review your account, AI usage, and OneRep Pro subscription.
                </SettingsSectionIntro>
                <GroupedList label="Signed in account">
                  <ListRow
                    title={user?.name || "OneRep user"}
                    detail={user?.email || "Signed in"}
                    leading={<UserCircle size={22} weight="regular" />}
                    value={billing.hasOneRepPro ? "Pro" : "Free"}
                  />
                </GroupedList>
                <SettingsSectionLabel title="AI usage" />
                <GroupedList label="AI usage">
                  <AiUsageProgress usage={aiUsage} />
                </GroupedList>
                <SettingsSectionLabel
                  title="Your own AI key"
                  detail="Add your OpenRouter API key and AI features run on it — no monthly cap, no Pro required. You pay OpenRouter directly for what you use."
                />
                {byokStatus?.configured ? (
                  <GroupedList label="Your OpenRouter key">
                    <ListRow
                      title={`Key ending in ${byokStatus.last4}`}
                      detail="AI requests use your key. Remove it to go back to the included allowance."
                      value={byokBusy ? "Removing…" : "Remove"}
                      disabled={byokBusy}
                      onClick={() => {
                        setByokBusy(true)
                        void (async () => {
                          try {
                            await removeByokKey({})
                            toast.success("Key removed")
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Couldn't remove the key"
                            )
                          } finally {
                            setByokBusy(false)
                          }
                        })()
                      }}
                    />
                  </GroupedList>
                ) : (
                  <div className="flex items-center gap-2 px-[var(--app-page-x)]">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="sk-or-…"
                      value={byokInput}
                      aria-label="OpenRouter API key"
                      onChange={(event) => setByokInput(event.target.value)}
                      className="h-11 flex-1 rounded-xl border border-border bg-transparent px-3 outline-none"
                    />
                    <PrimaryButton
                      aria-label="Save OpenRouter key"
                      disabled={
                        byokBusy || !byokInput.trim().startsWith("sk-or-")
                      }
                      onClick={async () => {
                        setByokBusy(true)
                        try {
                          // Verified against OpenRouter server-side before it saves.
                          await saveByokKey({ key: byokInput.trim() })
                          setByokInput("")
                          toast.success("Key saved — AI now runs on your key")
                          trackUmami("byok_key_saved")
                        } catch (error) {
                          toast.error(
                            error instanceof ConvexError
                              ? String(error.data)
                              : "This API key is invalid. Check it and try again."
                          )
                        } finally {
                          setByokBusy(false)
                        }
                      }}
                    >
                      {byokBusy ? "Verifying…" : "Save"}
                    </PrimaryButton>
                  </div>
                )}
                <SettingsSectionLabel title="Subscription" />
                <GroupedList
                  label="OneRep Pro subscription"
                  className="profile-pro-group"
                >
                  <BillingSubscriptionPanel billing={billing} />
                </GroupedList>
                <SettingsSectionLabel title="Session" />
                <GroupedList label="Session actions">
                  <ListRow
                    title={loggingOut ? "Signing out…" : "Sign out"}
                    detail="Remove this account from this device"
                    disabled={loggingOut}
                    busy={loggingOut}
                    onClick={() => void handleLogout()}
                    className="text-destructive"
                  />
                </GroupedList>
              </>
            )}

            {activeView === "targets" && (
              <>
                <SettingsSectionIntro>
                  These values drive Today, Nutrition, and progress coaching.
                </SettingsSectionIntro>
                <GroupedList label="Daily nutrition targets">
                  <SettingsRow label="Calories" detail="Daily energy budget">
                    <NumberStepper
                      onInteract={hapticTap}
                      value={calories}
                      onChange={setCalories}
                      suffix="kcal"
                      min={800}
                      max={5000}
                      step={50}
                      label="Calories"
                    />
                  </SettingsRow>
                  <SettingsRow label="Protein">
                    <NumberStepper
                      onInteract={hapticTap}
                      value={protein}
                      onChange={setProtein}
                      suffix="g"
                      min={20}
                      max={400}
                      step={5}
                      label="Protein"
                    />
                  </SettingsRow>
                  <SettingsRow label="Carbohydrates">
                    <NumberStepper
                      onInteract={hapticTap}
                      value={carbs}
                      onChange={setCarbs}
                      suffix="g"
                      min={10}
                      max={500}
                      step={10}
                      label="Carbohydrates"
                    />
                  </SettingsRow>
                  <SettingsRow label="Fat">
                    <NumberStepper
                      onInteract={hapticTap}
                      value={fat}
                      onChange={setFat}
                      suffix="g"
                      min={10}
                      max={200}
                      step={5}
                      label="Fat"
                    />
                  </SettingsRow>
                  <SettingsRow label="Water" detail="Daily hydration target">
                    <NumberStepper
                      onInteract={hapticTap}
                      value={waterGoal}
                      onChange={setWaterGoalState}
                      suffix="ml"
                      min={500}
                      max={5000}
                      step={250}
                      label="Water"
                    />
                  </SettingsRow>
                </GroupedList>
                <AppTooltip
                  id={APP_TOOLTIP_IDS.settingsTargets}
                  content="Save here so Today and Nutrition use the updated targets."
                  targetClassName="block"
                  side="top"
                >
                  <SectionSaveButton
                    label="Save daily targets"
                    saving={saving}
                    onClick={handleSaveTargets}
                  />
                </AppTooltip>
              </>
            )}

            {activeView === "preferences" && (
              <>
                <SettingsSectionIntro>
                  Set how OneRep presents training, measurements, and food
                  search.
                </SettingsSectionIntro>
                <SettingsSectionLabel title="Training" />
                <GroupedList label="Training preferences">
                  <SettingsRow label="Primary focus">
                    <SegmentedControl
                      onInteract={hapticSelection}
                      label="Primary focus"
                      value={workoutFocus}
                      onChange={(value) =>
                        setWorkoutFocus(value as WorkoutFocus)
                      }
                      options={[
                        { value: "strength", label: "Strength" },
                        { value: "cardio", label: "Cardio" },
                        { value: "mobility", label: "Mobility" },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow label="Weight unit">
                    <SegmentedControl
                      onInteract={hapticSelection}
                      label="Weight unit"
                      value={weightUnit}
                      onChange={(value) =>
                        setWeightUnitState(value as WeightUnit)
                      }
                      options={[
                        { value: "kg", label: "kg" },
                        { value: "lbs", label: "lb" },
                      ]}
                    />
                  </SettingsRow>
                </GroupedList>
                <SettingsSectionLabel title="App behavior" />
                <GroupedList label="App behavior">
                  <SettingsRow
                    label="Simple dashboard"
                    detail="Keep Today focused on actions and hide advanced panels"
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={simpleDashboard}
                      onChange={setSimpleDashboard}
                      label="Simple dashboard"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label={t("settings.language.label")}
                    detail={t("settings.language.detail")}
                  >
                    <SegmentedControl
                      onInteract={hapticSelection}
                      label={t("settings.language.label")}
                      value={uiLanguage}
                      onChange={(value) => {
                        const language = value as UiLanguage
                        setUiLanguageState(language)
                        setUiLanguage(language)
                      }}
                      options={[
                        { value: "en", label: "EN" },
                        { value: "es", label: "ES" },
                        { value: "fr", label: "FR" },
                        { value: "de", label: "DE" },
                        { value: "it", label: "IT" },
                        { value: "pt", label: "PT" },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow label="Food search language">
                    <SegmentedControl
                      onInteract={hapticSelection}
                      label="Food search language"
                      value={foodSearchLanguage}
                      onChange={(value) =>
                        setFoodSearchLanguageState(value as FoodSearchLanguage)
                      }
                      options={[
                        { value: "en", label: "EN" },
                        { value: "es", label: "ES" },
                        { value: "fr", label: "FR" },
                        { value: "de", label: "DE" },
                        { value: "it", label: "IT" },
                        { value: "pt", label: "PT" },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow label="Haptic feedback">
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={hapticsOn}
                      onChange={handleHapticsChange}
                      label="Haptic feedback"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Rest completion bell"
                    detail="A smooth bell when rest ends"
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={restBellOn}
                      onChange={(enabled) => {
                        setRestBellOn(enabled)
                        setRestBellEnabled(enabled)
                      }}
                      label="Rest completion bell"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Rest completion vibration"
                    detail="A distinct vibration when rest ends"
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={restVibrationOn}
                      onChange={(enabled) => {
                        setRestVibrationOn(enabled)
                        setRestVibrationEnabled(enabled)
                      }}
                      label="Rest completion vibration"
                    />
                  </SettingsRow>
                </GroupedList>
                <SectionSaveButton
                  label="Save preferences"
                  saving={saving}
                  onClick={handleSaveWorkout}
                />
              </>
            )}

            {activeView === "nutrition" && (
              <>
                <SettingsSectionIntro>
                  Choose whether daily targets respond to your training
                  schedule.
                </SettingsSectionIntro>
                <GroupedList label="Nutrition strategy options">
                  <SettingsRow
                    label="Macro cycling"
                    detail="Use separate training and rest-day targets"
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={macroCyclingEnabled}
                      onChange={setMacroCyclingEnabled}
                      label="Macro cycling"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Workout adjustment"
                    detail="Add estimated exercise calories to your budget"
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={workoutAdjustmentEnabled}
                      onChange={setWorkoutAdjustmentEnabled}
                      label="Workout adjustment"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Show net carbs"
                    detail="Display carbs minus fiber. Entry forms still take total carbs."
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={netCarbsEnabled}
                      onChange={setNetCarbsEnabledState}
                      label="Show net carbs"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Calories by meal"
                    detail="Budget your daily calories across each meal"
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={mealTargetsEnabled}
                      onChange={setMealTargetsEnabledState}
                      label="Calories by meal"
                    />
                  </SettingsRow>
                </GroupedList>

                {mealTargetsEnabled && (
                  <>
                    <SettingsSectionLabel
                      title="Meal split"
                      detail={`Shares of your ${Math.round(
                        effectiveGoals?.effective.calories ?? 2000
                      )} kcal budget`}
                    />
                    <GroupedList label="Meal calorie split">
                      {mealShares.map((share) => (
                        <SettingsRow
                          key={share.meal}
                          label={mealLabel(share.meal)}
                          detail={`${resolvedMealCalories.get(share.meal) ?? 0} kcal`}
                        >
                          <NumberStepper
                            onInteract={hapticTap}
                            value={Math.round(share.percent)}
                            onChange={(value) =>
                              setMealShares((current) =>
                                current.map((item) =>
                                  item.meal === share.meal
                                    ? { ...item, percent: value }
                                    : item
                                )
                              )
                            }
                            suffix="%"
                            min={0}
                            max={100}
                            step={5}
                            label={`${mealLabel(share.meal)} share`}
                          />
                        </SettingsRow>
                      ))}
                    </GroupedList>
                    <SettingsSectionIntro>
                      Total: {Math.round(mealSharesTotal)}%
                      {Math.abs(mealSharesTotal - 100) > 0.5
                        ? ". Saving will rescale these to 100%."
                        : ""}
                    </SettingsSectionIntro>
                    <button
                      type="button"
                      onClick={() => {
                        hapticTap()
                        setMealShares(
                          normalizeMealShares(
                            DEFAULT_MEAL_SHARES,
                            mealShares.map((share) => share.meal)
                          )
                        )
                      }}
                      className="native-toolbar-button mt-2 h-11 px-3"
                      aria-label="Reset meal split to default"
                    >
                      Reset to default split
                    </button>
                  </>
                )}

                {macroCyclingEnabled && (
                  <>
                    <SettingsSectionLabel
                      title="Training day"
                      detail="Higher-fuel target"
                    />
                    <GroupedList label="Training day targets">
                      <SettingsRow label="Calories">
                        <NumberStepper
                          onInteract={hapticTap}
                          value={trainingDayTargets.calories}
                          onChange={(value) =>
                            setTrainingDayTargets((current) => ({
                              ...current,
                              calories: value,
                            }))
                          }
                          suffix="kcal"
                          min={800}
                          max={5000}
                          step={50}
                          label="Training day calories"
                        />
                      </SettingsRow>
                      <SettingsRow label="Protein">
                        <NumberStepper
                          onInteract={hapticTap}
                          value={trainingDayTargets.protein}
                          onChange={(value) =>
                            setTrainingDayTargets((current) => ({
                              ...current,
                              protein: value,
                            }))
                          }
                          suffix="g"
                          min={20}
                          max={400}
                          step={5}
                          label="Training day protein"
                        />
                      </SettingsRow>
                    </GroupedList>
                    <SettingsSectionLabel
                      title="Rest day"
                      detail="Recovery target"
                    />
                    <GroupedList label="Rest day targets">
                      <SettingsRow label="Calories">
                        <NumberStepper
                          onInteract={hapticTap}
                          value={restDayTargets.calories}
                          onChange={(value) =>
                            setRestDayTargets((current) => ({
                              ...current,
                              calories: value,
                            }))
                          }
                          suffix="kcal"
                          min={800}
                          max={5000}
                          step={50}
                          label="Rest day calories"
                        />
                      </SettingsRow>
                      <SettingsRow label="Protein">
                        <NumberStepper
                          onInteract={hapticTap}
                          value={restDayTargets.protein}
                          onChange={(value) =>
                            setRestDayTargets((current) => ({
                              ...current,
                              protein: value,
                            }))
                          }
                          suffix="g"
                          min={20}
                          max={400}
                          step={5}
                          label="Rest day protein"
                        />
                      </SettingsRow>
                    </GroupedList>
                  </>
                )}
                <SectionSaveButton
                  label="Save nutrition strategy"
                  saving={saving}
                  onClick={handleSaveNutritionLogic}
                />
              </>
            )}

            {activeView === "reminders" && (
              <>
                <SettingsSectionIntro>
                  Reminders use your local time and only run when notifications
                  are allowed.
                </SettingsSectionIntro>
                <GroupedList label="Reminder schedule">
                  <ReminderRow
                    label="Water"
                    reminder={pushReminders.water}
                    onChange={(patch) => updateReminder("water", patch)}
                  />
                  <ReminderRow
                    label="Meal log"
                    reminder={pushReminders.meal}
                    onChange={(patch) => updateReminder("meal", patch)}
                  />
                  <ReminderRow
                    label="Workout"
                    reminder={pushReminders.workout}
                    onChange={(patch) => updateReminder("workout", patch)}
                  />
                  <ReminderRow
                    label="Body check-in"
                    reminder={pushReminders.body}
                    onChange={(patch) => updateReminder("body", patch)}
                  />
                  <ReminderRow
                    label="Supplements"
                    reminder={pushReminders.supplement}
                    onChange={(patch) => updateReminder("supplement", patch)}
                  />
                </GroupedList>

                <SettingsSectionLabel title="Coach" />
                <GroupedList label="When Coach reaches out">
                  <SettingsRow
                    label="Let Coach reach out"
                    detail="Your weekly review, and the occasional nudge when you go quiet. Never during your quiet hours."
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={coachOutreach.enabled}
                      onChange={(next) => {
                        const settings = { ...coachOutreach, enabled: next }
                        setCoachOutreachState(settings)
                        void setCoachOutreach(settings)
                      }}
                      label="Let Coach reach out"
                    />
                  </SettingsRow>
                  {coachOutreach.enabled && (
                    <>
                      <SettingsRow
                        label="Weekly review"
                        detail="Sunday evening: what the week held, and what to change"
                      >
                        <CompactSwitch
                          onInteract={hapticSelection}
                          checked={coachOutreach.weeklyReview}
                          onChange={(next) => {
                            const settings = {
                              ...coachOutreach,
                              weeklyReview: next,
                            }
                            setCoachOutreachState(settings)
                            void setCoachOutreach(settings)
                          }}
                          label="Weekly review"
                        />
                      </SettingsRow>
                      <SettingsRow
                        label="Nudges"
                        detail="At most three a week, and only when you have gone quiet"
                      >
                        <CompactSwitch
                          onInteract={hapticSelection}
                          checked={coachOutreach.nudges}
                          onChange={(next) => {
                            const settings = { ...coachOutreach, nudges: next }
                            setCoachOutreachState(settings)
                            void setCoachOutreach(settings)
                          }}
                          label="Nudges"
                        />
                      </SettingsRow>
                      <SettingsRow
                        label="Quiet hours"
                        detail="Coach stays silent between these times"
                      >
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            aria-label="Quiet hours start"
                            value={minutesToTimeValue(
                              coachOutreach.quietHours.startMinutes
                            )}
                            onChange={(event) => {
                              const startMinutes = timeValueToMinutes(
                                event.target.value
                              )
                              if (startMinutes === null) return
                              const settings = {
                                ...coachOutreach,
                                quietHours: {
                                  ...coachOutreach.quietHours,
                                  startMinutes,
                                },
                              }
                              setCoachOutreachState(settings)
                              void setCoachOutreach(settings)
                            }}
                            className="h-9 rounded-lg bg-muted/55 px-2 text-[13px] font-semibold tabular-nums"
                          />
                          <span className="text-[12px] text-muted-foreground">
                            to
                          </span>
                          <input
                            type="time"
                            aria-label="Quiet hours end"
                            value={minutesToTimeValue(
                              coachOutreach.quietHours.endMinutes
                            )}
                            onChange={(event) => {
                              const endMinutes = timeValueToMinutes(
                                event.target.value
                              )
                              if (endMinutes === null) return
                              const settings = {
                                ...coachOutreach,
                                quietHours: {
                                  ...coachOutreach.quietHours,
                                  endMinutes,
                                },
                              }
                              setCoachOutreachState(settings)
                              void setCoachOutreach(settings)
                            }}
                            className="h-9 rounded-lg bg-muted/55 px-2 text-[13px] font-semibold tabular-nums"
                          />
                        </div>
                      </SettingsRow>
                    </>
                  )}
                </GroupedList>

                {supportsLiveWorkoutStatusSetting() && (
                  <>
                    <SettingsSectionLabel title="During a workout" />
                    <GroupedList label="Workout status">
                      <SettingsRow
                        label="Ongoing notification"
                        detail="Show the current set and rest timer in the notification shade"
                      >
                        <CompactSwitch
                          onInteract={hapticSelection}
                          checked={liveWorkoutStatusEnabled}
                          onChange={(next) => {
                            void setLiveWorkoutStatus({ enabled: next })
                          }}
                          label="Ongoing notification"
                        />
                      </SettingsRow>
                    </GroupedList>
                  </>
                )}

                <SectionSaveButton
                  label="Save reminders"
                  saving={saving}
                  onClick={handleSaveNotifications}
                />
              </>
            )}

            {activeView === "health" && (
              <>
                <SettingsSectionIntro>
                  OneRep can read completed workouts from {healthLabel}.
                  Imported sessions only join your training log when you add
                  them.
                </SettingsSectionIntro>

                {healthProviderUnavailable && (
                  <GroupedList label="Health Connect">
                    <ListRow
                      title={
                        healthAvailability?.providerStatus === "update_required"
                          ? "Update Health Connect"
                          : "Install Health Connect"
                      }
                      detail={
                        healthAvailability?.providerStatus === "update_required"
                          ? "Your version of Health Connect is too old for OneRep to read from."
                          : "Android needs the Health Connect app to share workouts between apps."
                      }
                      onClick={() => {
                        void openHealthProviderListing()
                      }}
                    />
                  </GroupedList>
                )}

                {onboarding === null ? (
                  <GroupedList label="Health sync">
                    <ListRow
                      title="Finish onboarding first"
                      detail="Health sync needs the consent step from your profile setup."
                    />
                  </GroupedList>
                ) : (
                  <>
                    <SettingsSectionLabel title="Consent" />
                    <GroupedList label="Health consent">
                      <SettingsRow
                        label="Wearable data"
                        detail="Allow OneRep to read health and wearable data"
                      >
                        <CompactSwitch
                          onInteract={hapticSelection}
                          checked={wearableConsent}
                          onChange={(next) => {
                            void setConsent({ wearableIntegrations: next })
                              .then(() => {
                                if (!next) {
                                  return setHealthSync({
                                    healthSyncEnabled: false,
                                  })
                                }
                              })
                              .catch(() =>
                                toast.error("Could not update consent")
                              )
                          }}
                          label="Wearable data"
                        />
                      </SettingsRow>
                    </GroupedList>

                    <SettingsSectionLabel
                      title={healthLabel}
                      detail={
                        healthSync?.lastSyncedAt
                          ? `Last synced ${new Date(healthSync.lastSyncedAt).toLocaleString()}`
                          : "Not synced yet"
                      }
                    />
                    <GroupedList label={`${healthLabel} sync`}>
                      <SettingsRow
                        label="Import workouts"
                        detail={
                          wearableConsent
                            ? `Read completed workouts from ${healthLabel}`
                            : "Turn on wearable consent first"
                        }
                      >
                        <CompactSwitch
                          disabled={!wearableConsent}
                          onInteract={hapticSelection}
                          checked={healthSyncEnabled ?? false}
                          onChange={(next) => {
                            setHealthError(null)
                            if (!next) {
                              void setHealthSync({ healthSyncEnabled: false })
                              return
                            }
                            void requestHealthAuthorization()
                              .then((authorization) => {
                                if (!authorization.available) {
                                  setHealthError(
                                    `${healthLabel} is not available on this device.`
                                  )
                                  return
                                }
                                if (!authorization.granted) {
                                  setHealthError(
                                    healthProvider() === "health_connect"
                                      ? "Permission was denied. You can grant it in the Health Connect app."
                                      : "Permission was denied. Enable OneRep under Settings › Health › Data Access & Devices."
                                  )
                                  return
                                }
                                return setHealthSync({
                                  healthSyncEnabled: true,
                                })
                              })
                              .catch(() =>
                                setHealthError(
                                  `Could not reach ${healthLabel} on this device.`
                                )
                              )
                          }}
                          label="Import workouts"
                        />
                      </SettingsRow>
                      <SettingsRow
                        label="Sync on open"
                        detail="Check for new workouts when you open the app"
                      >
                        <CompactSwitch
                          disabled={!healthSyncEnabled}
                          onInteract={hapticSelection}
                          checked={healthSync?.autoSyncOnForeground ?? true}
                          onChange={(next) => {
                            void setHealthSync({ autoSyncOnForeground: next })
                          }}
                          label="Sync on open"
                        />
                      </SettingsRow>
                      <SettingsRow
                        label="Save workouts back"
                        detail={`Write finished OneRep sessions to ${healthLabel}`}
                      >
                        <CompactSwitch
                          disabled={!healthSyncEnabled}
                          onInteract={hapticSelection}
                          checked={healthWriteEnabled}
                          onChange={(next) => {
                            // Off by default: writing into someone's health
                            // record is not something to opt them into.
                            void setHealthSync({ writeEnabled: next })
                          }}
                          label="Save workouts back"
                        />
                      </SettingsRow>
                      {supportsHealthSettingsDeepLink() && (
                        // Health Connect owns revocation; there is no API to do
                        // it from here, so send the user to the app itself.
                        <ListRow
                          title="Manage permissions"
                          detail="Change or withdraw access in Health Connect"
                          onClick={() => {
                            void openHealthSettings()
                          }}
                        />
                      )}
                    </GroupedList>

                    {(healthError || healthSync?.lastSyncError) && (
                      <p className="native-row-detail px-[var(--app-page-x)] text-destructive">
                        {healthError ?? healthSync?.lastSyncError}
                      </p>
                    )}

                    <div className="px-[var(--app-page-x)] pt-4">
                      <PrimaryButton
                        className="w-full"
                        disabled={healthBusy || !healthSyncEnabled}
                        onClick={async () => {
                          setHealthBusy(true)
                          setHealthError(null)
                          try {
                            const authorization =
                              await requestHealthAuthorization()
                            if (!authorization.granted) {
                              setHealthError("Permission was denied.")
                              return
                            }
                            const workouts = await getRecentHealthWorkouts({
                              daysBack: HEALTH_SYNC_DAYS_BACK,
                              limit: HEALTH_SYNC_LIMIT,
                            })
                            const provider = healthProvider()
                            if (!provider) return
                            const result = await importHealthWorkouts({
                              provider,
                              workouts: workouts.map((workout) =>
                                healthWorkoutToImport(
                                  workout,
                                  preferences?.lastActiveTimezone || "UTC"
                                )
                              ),
                            })
                            toast.success(
                              result.imported > 0
                                ? `Imported ${result.imported} workout${result.imported === 1 ? "" : "s"}`
                                : "Already up to date"
                            )
                          } catch (error) {
                            setHealthError(
                              error instanceof Error
                                ? error.message
                                : "Sync failed"
                            )
                          } finally {
                            setHealthBusy(false)
                          }
                        }}
                      >
                        {healthBusy ? "Syncing…" : "Sync now"}
                      </PrimaryButton>
                    </div>

                    <MetricToggleList
                      busy={!healthSyncEnabled}
                      onInteract={hapticSelection}
                      onToggle={(key, enabled) => {
                        // One key per change: sending the resolved map back
                        // would let this build switch off any metric a newer
                        // one had added.
                        void setHealthSync({ metrics: { [key]: enabled } })
                      }}
                      groups={healthMetricGroups().map((group) => ({
                        key: group.group,
                        label: group.label,
                        items: group.metrics.map((metric) => ({
                          key: metric.key,
                          label: metric.label,
                          detail: metric.detail,
                          enabled: healthMetricSelection[metric.key] === true,
                          disabled: !healthSyncEnabled,
                          disabledReason: healthSyncEnabled
                            ? undefined
                            : `Turn on ${healthLabel} sync first`,
                        })),
                      }))}
                    />

                    <SettingsSectionLabel
                      title="Recent imports"
                      detail="Add a session to your training log, or hide it"
                    />
                    <GroupedList label="Imported workouts">
                      {(healthWorkouts ?? []).length === 0 ? (
                        <ListRow
                          title="Nothing imported yet"
                          detail={`Completed ${healthLabel} workouts will appear here.`}
                        />
                      ) : (
                        (healthWorkouts ?? []).map((workout) => (
                          <div
                            key={String(workout._id)}
                            className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="native-row-title truncate">
                                {workout.activityName}
                              </p>
                              <p className="native-row-detail mt-0.5">
                                {workout.date} ·{" "}
                                {Math.round(workout.durationSeconds / 60)} min
                                {workout.sourceName
                                  ? ` · ${workout.sourceName}`
                                  : ""}
                              </p>
                            </div>
                            {workout.linked ? (
                              <span className="native-row-detail shrink-0">
                                Added
                              </span>
                            ) : workout.linkable ? (
                              <button
                                type="button"
                                className="native-secondary-button min-h-10 shrink-0 px-3"
                                onClick={() => {
                                  void linkHealthWorkout({ id: workout._id })
                                    .then(() =>
                                      toast.success("Added to training log")
                                    )
                                    .catch((error) =>
                                      toast.error(
                                        error instanceof Error
                                          ? error.message
                                          : "Could not add this workout"
                                      )
                                    )
                                }}
                              >
                                Add
                              </button>
                            ) : null}
                            <button
                              type="button"
                              aria-label={`Hide ${workout.activityName}`}
                              className="native-toolbar-button h-11 w-11 shrink-0 px-0"
                              onClick={() => {
                                void dismissHealthWorkout({ id: workout._id })
                              }}
                            >
                              <X size={16} weight="bold" />
                            </button>
                          </div>
                        ))
                      )}
                    </GroupedList>
                  </>
                )}
              </>
            )}

            {activeView === "privacy" && (
              <>
                <SettingsSectionIntro>
                  Control optional analytics, personalized recommendations, and
                  this device’s sync state.
                </SettingsSectionIntro>
                <SettingsSectionLabel title="Privacy" />
                <GroupedList label="Privacy controls">
                  <SettingsRow
                    label="Optional analytics"
                    detail="Share anonymous feature-usage counts. Meal, workout, body, and Coach contents are never included. Basic usage measurement runs either way — see the privacy policy."
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={analyticsEnabled}
                      onChange={setAnalyticsEnabled}
                      label="Analytics"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Personalized insights"
                    detail="Use your logs for tailored coaching"
                  >
                    <CompactSwitch
                      onInteract={hapticSelection}
                      checked={personalizedInsightsEnabled}
                      onChange={setPersonalizedInsightsEnabled}
                      label="Personalized insights"
                    />
                  </SettingsRow>
                </GroupedList>

                <SettingsSectionLabel
                  title="Sharing"
                  detail="Give a coach or partner read-only access to your food diary"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="coach@example.com"
                    value={inviteEmail}
                    aria-label="Invite by email"
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="h-11 flex-1 rounded-xl border border-border bg-transparent px-3 outline-none"
                  />
                  <PrimaryButton
                    aria-label="Send diary invitation"
                    disabled={inviting || !isValidInviteEmail(inviteEmail)}
                    onClick={async () => {
                      setInviting(true)
                      try {
                        await inviteToDiary({
                          email: normalizeInviteEmail(inviteEmail),
                          // Read plus comment: the coach use case this exists for.
                          scope: { diary: true, report: true, comments: true },
                        })
                        setInviteEmail("")
                        toast.success(
                          "Invitation created — send them the link below"
                        )
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not send this invitation"
                        )
                      } finally {
                        setInviting(false)
                      }
                    }}
                  >
                    Invite
                  </PrimaryButton>
                </div>
                <GroupedList label="People I share with">
                  {outgoingShares.length === 0 ? (
                    <ListRow
                      title="Not shared with anyone"
                      detail="Invite someone above to give read-only access"
                    />
                  ) : (
                    outgoingShares.map((share) => (
                      <div
                        key={share.id ?? share._id}
                        className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="native-row-title truncate">
                            {share.inviteeName ?? share.inviteeEmail}
                          </p>
                          <p className="native-row-detail mt-0.5">
                            {share.status === "pending"
                              ? "Waiting for them"
                              : "Active"}{" "}
                            · {shareScopeLabel(share.scope)}
                          </p>
                        </div>
                        {share.status === "pending" && (
                          <button
                            type="button"
                            onClick={async () => {
                              const result = await shareDiaryInvite(
                                share.token,
                                share.inviteeEmail
                              )
                              if (result === "copied")
                                toast.success("Invite link copied")
                              if (result === "failed")
                                toast.error("Could not share the invite link")
                            }}
                            aria-label={`Send invite link to ${share.inviteeEmail}`}
                            className="native-toolbar-button h-11 w-11 px-0 text-muted-foreground"
                          >
                            <PaperPlaneTilt size={17} weight="bold" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await revokeShare({
                                id: (share.id ??
                                  share._id) as Id<"diaryShares">,
                              })
                              toast.success("Access revoked")
                            } catch {
                              toast.error("Could not revoke access")
                            }
                          }}
                          aria-label={`Revoke access for ${share.inviteeEmail}`}
                          className="native-toolbar-button h-11 px-3 text-destructive"
                        >
                          Revoke
                        </button>
                      </div>
                    ))
                  )}
                </GroupedList>
                <ListRow
                  title="Shared diaries"
                  detail="Diaries other people shared with you"
                  onClick={() => navigate("/shared")}
                  trailing={
                    <CaretRight size={18} className="text-muted-foreground" />
                  }
                />

                <SettingsSectionLabel title="Legal" />
                <GroupedList label="Legal documents">
                  <ListRow
                    title="Privacy Policy"
                    detail="How OneRep uses and protects your information"
                    onClick={() =>
                      window.open(
                        "https://onerep.life/privacy",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    trailing={
                      <CaretRight size={18} className="text-muted-foreground" />
                    }
                  />
                  <ListRow
                    title="Terms and Conditions"
                    detail="Rules for using OneRep and Coach"
                    onClick={() =>
                      window.open(
                        "https://onerep.life/terms",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    trailing={
                      <CaretRight size={18} className="text-muted-foreground" />
                    }
                  />
                </GroupedList>
                <SettingsSectionLabel title="This device" />
                <GroupedList label="Device and sync settings">
                  <ListRow
                    title="Install OneRep"
                    detail={pwaCopy.description}
                    value={pwaCopy.statusLabel}
                    disabled={pwaCopy.disabled}
                    onClick={() => void handleInstallApp()}
                  />
                  <ListRow
                    title="Data sync"
                    detail={offlineSyncStatus.body}
                    disabled={syncingOfflineQueue}
                    busy={syncingOfflineQueue}
                    onClick={() => void handleFlushOfflineQueue()}
                    trailing={
                      <SyncStatusIcon
                        status={offlineSyncStatus.tone}
                        online={offlineOnline}
                        syncing={syncingOfflineQueue}
                      />
                    }
                  />
                </GroupedList>
                <SectionSaveButton
                  label="Save privacy settings"
                  saving={saving}
                  onClick={handleSavePrivacy}
                />
              </>
            )}

            {activeView === "data" && (
              <>
                <SettingsSectionIntro>
                  Export or reset your information. Destructive actions are kept
                  separate below.
                </SettingsSectionIntro>
                <SettingsSectionLabel title="Your data" />
                <GroupedList label="Data tools">
                  <ListRow
                    title={exporting ? "Preparing export…" : "Export my data"}
                    detail="Download a complete copy of your data you can verify"
                    disabled={exporting}
                    busy={exporting}
                    onClick={() => void handleExportData()}
                    trailing={
                      <CaretRight size={18} className="text-muted-foreground" />
                    }
                  />
                  <ListRow
                    title={
                      resettingOnboarding
                        ? "Resetting health profile…"
                        : onboarding
                          ? "Recalculate health profile"
                          : "Set up health profile"
                    }
                    detail="Review the inputs used for your recommendations"
                    disabled={resettingOnboarding}
                    busy={resettingOnboarding}
                    onClick={() =>
                      onboarding
                        ? void handleResetOnboarding()
                        : navigate("/onboarding")
                    }
                    trailing={
                      <CaretRight size={18} className="text-muted-foreground" />
                    }
                  />
                  <ListRow
                    title="Clear data on this device"
                    detail="Remove offline changes and device-only preferences"
                    onClick={handleClearLocalData}
                  />
                </GroupedList>

                <SettingsSectionLabel
                  title="Permanent actions"
                  detail="These changes cannot be undone"
                  danger
                />
                <section
                  className="mx-[var(--app-page-x)] border-y border-destructive/35 py-4"
                  aria-labelledby="delete-account-heading"
                >
                  <h2
                    id="delete-account-heading"
                    className="native-section-title text-destructive"
                  >
                    Delete account
                  </h2>
                  <p className="native-row-detail mt-1 max-w-xl">
                    Permanently removes your logs, settings, any changes still
                    waiting to be saved, and OneRep account data.
                  </p>
                  <label className="native-field mt-4">
                    <span className="native-field-label">
                      Type DELETE to confirm
                    </span>
                    <input
                      value={deleteConfirmText}
                      onChange={(event) =>
                        setDeleteConfirmText(event.target.value)
                      }
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="native-input"
                      placeholder="DELETE"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAccount()}
                    disabled={deleteConfirmText !== "DELETE" || deleting}
                    aria-busy={deleting}
                    className="text-destructive-foreground mt-4 min-h-11 w-full rounded-[0.7rem] bg-destructive px-4 text-[15px] font-semibold disabled:opacity-35"
                  >
                    {deleting
                      ? "Deleting account…"
                      : "Permanently delete account"}
                  </button>
                </section>
              </>
            )}

            {activeView === "agents" && (
              <>
                <SettingsSectionIntro>
                  Give a script, or an AI assistant, a key to your log — over
                  the REST API or the Model Context Protocol. Read-only unless
                  you say otherwise, revocable, and nothing it can delete.
                </SettingsSectionIntro>
                <ApiKeysSection
                  apiBaseUrl={apiBaseUrl}
                  mcpEndpoint={mcpEndpointUrl}
                />
              </>
            )}

            {activeView === "walkthrough" && (
              <>
                <SettingsSectionIntro>
                  A short guided tour runs the first time you open each area.
                  Replay any of them here.
                </SettingsSectionIntro>
                <GroupedList label="Walkthrough chapters">
                  {WALKTHROUGH_CHAPTERS.map((chapter) => (
                    <ListRow
                      key={chapter.id}
                      title={chapter.title}
                      detail={walkthroughStatusLabel(
                        tour.progress[chapter.id],
                        chapter,
                        tour.featureContext
                      )}
                      value={tour.progress[chapter.id] ? "Replay" : "Start"}
                      onClick={() => void handleReplayChapter(chapter)}
                    />
                  ))}
                </GroupedList>
                <div className="px-[var(--app-page-x)] pt-4">
                  <button
                    type="button"
                    onClick={() => void handleReplayEverything()}
                    className="native-secondary-button min-h-12 w-full rounded-[0.8rem]"
                  >
                    Replay everything
                  </button>
                </div>
              </>
            )}

            {activeView === "about" && (
              <>
                <SettingsSectionIntro>
                  OneRep updates itself in the background. This is what is
                  running right now.
                </SettingsSectionIntro>
                <AboutApp />
              </>
            )}

            {activeView === "developer" && SHOW_DEV_SETTINGS && (
              <>
                <SettingsSectionIntro>
                  Internal controls for testing product education and account
                  state.
                </SettingsSectionIntro>
                <GroupedList label="Developer controls">
                  <ListRow
                    title="Reset Coach onboarding"
                    detail="Replay the animated Coach capabilities introduction"
                    onClick={handleResetCoachOnboarding}
                  />
                  <ListRow
                    title={
                      refreshingTooltips
                        ? "Refreshing…"
                        : "Refresh shown tooltips"
                    }
                    detail="Clear completed tooltip state for this account"
                    disabled={refreshingTooltips}
                    onClick={() => void handleRefreshShownTooltips()}
                  />
                  <ListRow
                    title={
                      testingNotification ? "Scheduling…" : "Test notification"
                    }
                    detail="Send a local notification in two seconds"
                    disabled={testingNotification}
                    onClick={() => void handleTestNotification()}
                  />
                  <ListRow
                    title="Show paywall"
                    detail="Preview the Pro paywall without spending an AI request"
                    onClick={() => {
                      hapticSelection()
                      showAiPaywall()
                    }}
                  />
                  <ListRow
                    title="Show the welcome nudge"
                    detail="Forget today's dismissal and open the dashboard"
                    onClick={() => {
                      hapticSelection()
                      resetWelcomeNudge()
                      navigate("/")
                    }}
                  />
                </GroupedList>

                <SettingsSectionIntro>
                  Every email the product sends, delivered to your own address
                  with harmless links, so the templates can be judged where they
                  live: an inbox.
                </SettingsSectionIntro>
                <GroupedList label="Test emails">
                  <ListRow
                    title="Send the verification email"
                    detail="The confirm-your-email template"
                    disabled={sendingTestEmail !== null}
                    onClick={() => void handleSendTestEmail("verification")}
                  />
                  <ListRow
                    title="Send the password-reset email"
                    detail="The choose-a-new-password template"
                    disabled={sendingTestEmail !== null}
                    onClick={() => void handleSendTestEmail("password-reset")}
                  />
                  <ListRow
                    title="Send the diary-invite email"
                    detail="What an invitee receives when you share your diary"
                    disabled={sendingTestEmail !== null}
                    onClick={() => void handleSendTestEmail("diary-invite")}
                  />
                </GroupedList>

                <SettingsSectionIntro>
                  Full-screen moments, opened by hand. They read your real
                  history and record nothing, so a preview never uses up the
                  real one.
                </SettingsSectionIntro>
                <GroupedList label="Full-screen moments">
                  <ListRow
                    title="Show the missed-log nudge"
                    detail="The check-in for a day that went unlogged"
                    onClick={() => handlePreviewMoment(MOMENT_IDS.missedLog)}
                  />
                  <ListRow
                    title="Show the training-lapse nudge"
                    detail="The check-in for a stretch of days off"
                    onClick={() =>
                      handlePreviewMoment(MOMENT_IDS.trainingLapse)
                    }
                  />
                  <ListRow
                    title="Show the weekly report"
                    detail="The week that most recently closed, whatever is in it"
                    onClick={() => handlePreviewMoment(MOMENT_IDS.weeklyReport)}
                  />
                  <ListRow
                    title={
                      clearingMoments ? "Forgetting…" : "Forget shown moments"
                    }
                    detail="Clear the record so the real triggers can fire again"
                    disabled={clearingMoments}
                    onClick={() => void handleClearMomentHistory()}
                  />
                </GroupedList>
              </>
            )}
          </div>
        )}
      </main>
      {aiAccessModal}
      <CheckoutResultOverlay />
    </div>
  )
}

function ReminderRow({
  label,
  reminder,
  onChange,
}: {
  label: string
  reminder: ReminderSettings[keyof ReminderSettings]
  onChange: (patch: Partial<ReminderSettings[keyof ReminderSettings]>) => void
}) {
  const timeValue = `${String(reminder.hour).padStart(2, "0")}:${String(reminder.minute).padStart(2, "0")}`

  return (
    <div className="native-list-row flex-wrap">
      <div className="min-w-[8rem] flex-1">
        <span className="native-row-title block">{label}</span>
        <span className="native-row-detail mt-0.5 block">
          {reminder.enabled ? formatReminderLabel(reminder) : "Off"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center">
          <span className="sr-only">{label} reminder time</span>
          <input
            type="time"
            value={timeValue}
            onChange={(event) => {
              const [hour, minute] = event.target.value.split(":").map(Number)
              onChange({ hour, minute })
            }}
            className="native-input min-h-11 w-auto px-2 text-[13px] font-semibold"
          />
        </label>
        <CompactSwitch
          onInteract={hapticSelection}
          checked={reminder.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={`${label} reminder`}
        />
      </div>
    </div>
  )
}
