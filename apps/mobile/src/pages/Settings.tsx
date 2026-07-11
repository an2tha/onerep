import React, { useState, useEffect, useRef } from "react"
import {
  ArrowsClockwise,
  CaretRight,
  CheckCircle,
  CloudArrowUp,
  Minus,
  Moon,
  Plus,
  Sun,
  Warning,
  WifiSlash,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  cn,
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
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@repo/ui"
import { toast } from "sonner"
import posthog from "posthog-js"
import { convexClient } from "@/lib/convex"
import { signOutApp, useAppAuth } from "@/lib/auth-client"
import { celebrateSubscription } from "@/lib/subscription-celebration"
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
import { AppTooltip, APP_TOOLTIP_IDS } from "@/components/tooltips"
import {
  formatReminderLabel,
  mergeReminderSettings,
  syncPushReminders,
  type ReminderSettings,
} from "@/lib/reminders"
import {
  isPwaStandalone,
  pwaInstallCopy,
  type PwaBeforeInstallPromptEvent,
} from "@/lib/pwa-install"
import {
  hasOneRepPro,
  revenueCatErrorMessage,
  useRevenueCat,
} from "@/lib/revenuecat"
import { resetCoachOnboarding } from "@/lib/coach-onboarding"

// ─── Theme helper ─────────────────────────────────────────────────────────────

type Theme = "light" | "dark"

const PRELOGIN_SEEN_KEY = "onerep:prelogin-onboarding-seen"

/**
 * Determine the current UI theme.
 *
 * Resolves to the persisted theme if available; otherwise infers the theme from the user's system preference. During server-side rendering (when `window` is undefined) this returns `"light"`.
 *
 * @returns `'light'` or `'dark'` - the resolved theme to apply
 */
function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light"
  return (
    (safeLocalStorageGet("theme") as Theme) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light")
  )
}

/**
 * Apply the given theme to the page and persist it for future visits.
 *
 * If `document` is undefined (server-side rendering) this function does nothing.
 *
 * @param theme - The theme to apply (`"light"` or `"dark"`)
 */
function setTheme(theme: Theme) {
  if (typeof document === "undefined") return
  safeLocalStorageSet("theme", theme)
  if (theme === "dark") {
    document.documentElement.classList.add("dark")
  } else {
    document.documentElement.classList.remove("dark")
  }
}

/**
 * Toggle the current theme between "light" and "dark" and apply the change.
 *
 * @returns The newly applied theme: `"dark"` or `"light"`.
 */
function toggleTheme() {
  const current = getStoredTheme()
  const next = current === "dark" ? "light" : "dark"
  setTheme(next)
  return next
}

// Initialize theme on load
if (typeof window !== "undefined") {
  setTheme(getStoredTheme())
}

type WorkoutFocus = "strength" | "cardio" | "mobility"
type WeightUnit = "kg" | "lbs"
type FoodSearchLanguage = "en" | "es" | "fr" | "de" | "it" | "pt"

const SETTINGS_SECTION_TRIGGER_CLASS =
  "app-rail-surface px-4 py-3 text-left hover:no-underline data-[state=open]:rounded-b-none short-phone:py-2.5"
const SETTINGS_PANEL_CLASS = "app-surface overflow-hidden rounded-t-none"
const SHOW_DEV_SETTINGS = import.meta.env.DEV

/**
 * Renders the Settings sheet UI for viewing and editing user preferences, goals, theme, and account actions.
 *
 * The component loads current preferences and effective goals, exposes controls for calories/protein/carbs/fat,
 * water goal, workout focus, and weight unit, and persists changes when the user saves.
 *
 * @param onClose - Callback invoked to close the settings sheet
 * @returns The Settings React element
 */
export default function Settings({
  onClose: _onClose,
}: {
  onClose: () => void
}) {
  const navigate = useSmoothNavigate()
  const { user } = useAppAuth()
  const revenueCat = useRevenueCat({
    userId: user?.id,
    email: user?.email,
    name: user?.name,
  })
  const preferences = useQuery(api.users.users.getPreferences)
  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {})
  const onboarding = useQuery(api.users.onboarding.get)
  const aiUsage = useQuery(api.ai.usage.getMonthlyUsage, {})

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
  const setWorkoutAdjustment = useOfflineMutation(
    api.users.users.setWorkoutAdjustment,
    "users.users.setWorkoutAdjustment"
  )
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
  const deleteMyDataBatch = useMutation(api.users.users.deleteMyDataBatch)

  const [workoutFocus, setWorkoutFocus] = useState<WorkoutFocus>(
    (preferences?.dashboardSettings?.workoutFocus as WorkoutFocus) || "strength"
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
  const [pushReminders, setPushRemindersState] = useState<ReminderSettings>(
    mergeReminderSettings(null)
  )
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => {
    if (typeof window === "undefined") return true
    return safeLocalStorageGet("onerep:analytics-enabled") !== "false"
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
  const [theme, setThemeState] = useState<Theme>("light")
  const [hapticsOn, setHapticsOn] = useState(() => {
    if (typeof window === "undefined") return true
    return hapticsEnabled()
  })
  const [pwaInstallPrompt, setPwaInstallPrompt] =
    useState<PwaBeforeInstallPromptEvent | null>(null)
  const [pwaInstalled, setPwaInstalled] = useState(() => {
    if (typeof window === "undefined") return false
    return isPwaStandalone(window)
  })
  const pwaCopy = pwaInstallCopy({
    hasPrompt: pwaInstallPrompt !== null,
    installed: pwaInstalled,
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

  // Initialize theme
  useEffect(() => {
    setThemeState(getStoredTheme())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      if (isPwaStandalone(window)) return
      setPwaInstallPrompt(event as PwaBeforeInstallPromptEvent)
      setPwaInstalled(false)
    }

    function handleAppInstalled() {
      setPwaInstallPrompt(null)
      setPwaInstalled(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      )
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (preferences?.dashboardSettings?.workoutFocus) {
      setWorkoutFocus(
        preferences.dashboardSettings.workoutFocus as WorkoutFocus
      )
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
    if (preferences?.pushReminders || preferences?.bodyReminder) {
      setPushRemindersState(
        mergeReminderSettings({
          ...(preferences.pushReminders ?? {}),
          body: preferences.pushReminders?.body ?? preferences.bodyReminder,
        })
      )
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

  function handleThemeToggle() {
    hapticMedium()
    const nextTheme = toggleTheme()
    setThemeState(nextTheme)
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

  async function handleSaveWaterGoal() {
    await runSectionSave(async () => {
      await setWaterGoal({ goalMl: waterGoal })
    }, "Water goal saved")
  }

  async function handleSaveWorkout() {
    await runSectionSave(async () => {
      await setDashboardSettings({ workoutFocus })
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
      await setDashboardSettings({ workoutFocus })
      await setWeightUnit({ unit: weightUnit })
      await setFoodSearchLanguage({ language: foodSearchLanguage })
    }, "Targets saved")
  }

  async function handleSaveNutritionLogic() {
    await runSectionSave(async () => {
      await setMacroCycling({
        enabled: macroCyclingEnabled,
        targets: macroCyclingEnabled
          ? { restDay: restDayTargets, trainingDay: trainingDayTargets }
          : undefined,
      })
      await setWorkoutAdjustment({ enabled: workoutAdjustmentEnabled })
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
      if (analyticsEnabled) posthog.opt_in_capturing()
      else posthog.opt_out_capturing()
    }, "Privacy settings saved")
  }

  async function handleLogout() {
    if (loggingOut) return
    hapticMedium()
    setLoggingOut(true)
    try {
      clearOfflineQueue()
      await signOutApp()
      safeLocalStorageRemove(PRELOGIN_SEEN_KEY)
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

  function handleResetCoachOnboarding() {
    hapticTap()
    const reset = resetCoachOnboarding()

    if (reset) {
      toast.success("Coach introduction will show on your next visit")
      return
    }
    toast.error("Could not reset Coach introduction")
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

    const prompt = pwaInstallPrompt
    setPwaInstallPrompt(null)
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === "accepted") {
        toast.success("OneRep install started")
      } else {
        toast.message("Install dismissed")
      }
    } catch (error) {
      setPwaInstallPrompt(prompt)
      toast.error(error instanceof Error ? error.message : "Install failed")
    }
  }

  function handleClearLocalData() {
    hapticMedium()
    clearOfflineQueue()
    safeLocalStorageRemove("onerep:analytics-enabled")
    safeLocalStorageRemove("theme")
    setOfflineQueueTotal(0)
    toast.success("Local cached settings cleared")
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
            ? "Export shared with checksum"
            : "Export downloaded with checksum"
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

      clearOfflineQueue()
      await signOutApp()

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

  return (
    <div className="desktop-canvas min-h-svh bg-background text-foreground lg:pr-8 lg:pl-72">
      <main className="mx-auto min-h-svh w-full max-w-2xl px-4 pt-[var(--app-safe-top)] pb-[calc(var(--app-safe-bottom-lg)+5rem)] md:px-8 md:pt-10 md:pb-12">
        {/* Header */}
        <div className="mb-5 px-1 pt-1 md:mb-6 md:px-0 md:pt-0">
          <h1 className="app-title text-[24px] md:mt-1 short-phone:text-[21px]">
            Settings
          </h1>
        </div>

        {settingsContentReady ? (
          <>
            <div className="space-y-2.5 short-phone:space-y-2">
              <Accordion
                type="multiple"
                defaultValue={["profile", "targets", "reminders"]}
                className="space-y-2.5 short-phone:space-y-2"
              >
                {/* Account Section */}
                <AccordionItem value="profile" className="border-none">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Account
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      <div className="flex items-center justify-between gap-4 px-4 py-4">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold">
                            {user?.name || "User"}
                          </p>
                          {user?.email && (
                            <p className="mt-0.5 truncate text-[12px] text-muted-foreground/50">
                              {user.email}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleThemeToggle}
                          aria-label={
                            theme === "dark"
                              ? "Switch to light mode"
                              : "Switch to dark mode"
                          }
                          className="app-icon-button"
                        >
                          {theme === "dark" ? (
                            <Sun size={16} weight="bold" />
                          ) : (
                            <Moon size={16} weight="bold" />
                          )}
                        </button>
                      </div>
                      <RowDivider />
                      <AiUsageProgress usage={aiUsage} />
                      <RowDivider />
                      <RevenueCatSubscriptionPanel revenueCat={revenueCat} />
                      <RowDivider />
                      <button
                        type="button"
                        onClick={() => {
                          hapticTap()
                          handleLogout()
                        }}
                        disabled={loggingOut}
                        aria-busy={loggingOut}
                        className="flex w-full items-center justify-between px-4 py-4 text-left text-muted-foreground transition-opacity active:opacity-60 disabled:opacity-50"
                      >
                        <span className="text-[14px] font-medium">
                          {loggingOut ? "Signing out…" : "Sign out"}
                        </span>
                      </button>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Targets Section */}
                <AccordionItem value="targets" className="border-none">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Targets
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      <SettingsRow label="Calories">
                        <NumberStepper
                          value={calories}
                          onChange={setCalories}
                          suffix="kcal"
                          min={800}
                          max={5000}
                          step={50}
                          label="Calories"
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Protein">
                        <NumberStepper
                          value={protein}
                          onChange={setProtein}
                          suffix="g"
                          min={20}
                          max={400}
                          step={5}
                          label="Protein"
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Carbs">
                        <NumberStepper
                          value={carbs}
                          onChange={setCarbs}
                          suffix="g"
                          min={10}
                          max={500}
                          step={10}
                          label="Carbs"
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Fat">
                        <NumberStepper
                          value={fat}
                          onChange={setFat}
                          suffix="g"
                          min={10}
                          max={200}
                          step={5}
                          label="Fat"
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Water">
                        <NumberStepper
                          value={waterGoal}
                          onChange={setWaterGoalState}
                          suffix="ml"
                          min={500}
                          max={5000}
                          step={250}
                          label="Water"
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Focus">
                        <SegmentedControl
                          value={workoutFocus}
                          onChange={(v) => setWorkoutFocus(v as WorkoutFocus)}
                          options={[
                            { value: "strength", label: "Strength" },
                            { value: "cardio", label: "Cardio" },
                            { value: "mobility", label: "Mobility" },
                          ]}
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Weight unit">
                        <SegmentedControl
                          value={weightUnit}
                          onChange={(v) => setWeightUnitState(v as WeightUnit)}
                          options={[
                            { value: "kg", label: "kg" },
                            { value: "lbs", label: "lbs" },
                          ]}
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Search language">
                        <SegmentedControl
                          value={foodSearchLanguage}
                          onChange={(v) =>
                            setFoodSearchLanguageState(v as FoodSearchLanguage)
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
                      <RowDivider />
                      <SettingsRow label="Haptics">
                        <SegmentedControl
                          value={hapticsOn ? "on" : "off"}
                          onChange={(v) => handleHapticsChange(v === "on")}
                          options={[
                            { value: "off", label: "Off" },
                            { value: "on", label: "On" },
                          ]}
                        />
                      </SettingsRow>
                    </div>
                    <AppTooltip
                      id={APP_TOOLTIP_IDS.settingsTargets}
                      content="After changing targets, save here so the dashboard and nutrition pages use the new numbers."
                      targetClassName="block"
                      side="top"
                    >
                      <SectionSaveButton
                        label="Save targets"
                        saving={saving}
                        onClick={handleSaveTargets}
                      />
                    </AppTooltip>
                  </AccordionContent>
                </AccordionItem>

                {/* Water Goal Section */}
                <AccordionItem value="water" className="hidden">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Water
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      <SettingsRow label="Daily goal">
                        <NumberStepper
                          value={waterGoal}
                          onChange={setWaterGoalState}
                          suffix="ml"
                          min={500}
                          max={5000}
                          step={250}
                          label="Daily goal"
                        />
                      </SettingsRow>
                    </div>
                    <SectionSaveButton
                      label="Save water goal"
                      saving={saving}
                      onClick={handleSaveWaterGoal}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Workout Section */}
                <AccordionItem value="workout" className="hidden">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Workout
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      <SettingsRow label="Focus">
                        <SegmentedControl
                          value={workoutFocus}
                          onChange={(v) => setWorkoutFocus(v as WorkoutFocus)}
                          options={[
                            { value: "strength", label: "Strength" },
                            { value: "cardio", label: "Cardio" },
                            { value: "mobility", label: "Mobility" },
                          ]}
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Weight unit">
                        <SegmentedControl
                          value={weightUnit}
                          onChange={(v) => setWeightUnitState(v as WeightUnit)}
                          options={[
                            { value: "kg", label: "kg" },
                            { value: "lbs", label: "lbs" },
                          ]}
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Search language">
                        <SegmentedControl
                          value={foodSearchLanguage}
                          onChange={(v) =>
                            setFoodSearchLanguageState(v as FoodSearchLanguage)
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
                    </div>
                    <SectionSaveButton
                      label="Save workout settings"
                      saving={saving}
                      onClick={handleSaveWorkout}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Health Profile Section */}
                <AccordionItem value="health" className="hidden">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Health Profile
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      {onboarding ? (
                        <button
                          onClick={handleResetOnboarding}
                          className="flex w-full items-center justify-between px-4 py-4 text-left transition-opacity active:opacity-60"
                        >
                          <span className="text-[14px]">
                            Recalculate from profile
                          </span>
                          <CaretRight
                            className="text-muted-foreground/30"
                            size={16}
                          />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            hapticTap()
                            navigate("/onboarding")
                          }}
                          className="flex w-full items-center justify-between px-4 py-4 text-left transition-opacity active:opacity-60"
                        >
                          <span className="text-[14px]">
                            Set up health profile
                          </span>
                          <CaretRight
                            className="text-muted-foreground/30"
                            size={16}
                          />
                        </button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Nutrition Logic Section */}
                <AccordionItem value="nutrition-logic" className="border-none">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Nutrition Logic
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      <SettingsRow label="Macro cycling">
                        <SegmentedControl
                          value={macroCyclingEnabled ? "on" : "off"}
                          onChange={(v) => setMacroCyclingEnabled(v === "on")}
                          options={[
                            { value: "off", label: "Off" },
                            { value: "on", label: "On" },
                          ]}
                        />
                      </SettingsRow>
                      {macroCyclingEnabled && (
                        <div className="space-y-4 bg-muted/20 px-4 py-4 transition-all">
                          <div>
                            <p className="mb-2 text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
                              Training Day
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              <SettingsRow label="Calories">
                                <NumberStepper
                                  value={trainingDayTargets.calories}
                                  onChange={(v) =>
                                    setTrainingDayTargets((t) => ({
                                      ...t,
                                      calories: v,
                                    }))
                                  }
                                  suffix="kcal"
                                  min={800}
                                  max={5000}
                                  step={50}
                                />
                              </SettingsRow>
                              <SettingsRow label="Protein">
                                <NumberStepper
                                  value={trainingDayTargets.protein}
                                  onChange={(v) =>
                                    setTrainingDayTargets((t) => ({
                                      ...t,
                                      protein: v,
                                    }))
                                  }
                                  suffix="g"
                                  min={20}
                                  max={400}
                                  step={5}
                                />
                              </SettingsRow>
                            </div>
                          </div>
                          <div className="h-px bg-border/20" />
                          <div>
                            <p className="mb-2 text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
                              Rest Day
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              <SettingsRow label="Calories">
                                <NumberStepper
                                  value={restDayTargets.calories}
                                  onChange={(v) =>
                                    setRestDayTargets((t) => ({
                                      ...t,
                                      calories: v,
                                    }))
                                  }
                                  suffix="kcal"
                                  min={800}
                                  max={5000}
                                  step={50}
                                />
                              </SettingsRow>
                              <SettingsRow label="Protein">
                                <NumberStepper
                                  value={restDayTargets.protein}
                                  onChange={(v) =>
                                    setRestDayTargets((t) => ({
                                      ...t,
                                      protein: v,
                                    }))
                                  }
                                  suffix="g"
                                  min={20}
                                  max={400}
                                  step={5}
                                />
                              </SettingsRow>
                            </div>
                          </div>
                        </div>
                      )}
                      <RowDivider />
                      <SettingsRow label="Workout adjust">
                        <SegmentedControl
                          value={workoutAdjustmentEnabled ? "on" : "off"}
                          onChange={(v) =>
                            setWorkoutAdjustmentEnabled(v === "on")
                          }
                          options={[
                            { value: "off", label: "Off" },
                            { value: "on", label: "On" },
                          ]}
                        />
                      </SettingsRow>
                    </div>
                    <p className="mt-2 px-4 text-[11px] leading-tight text-muted-foreground/60">
                      Macro cycling adjusts targets on days you log a workout.
                      Workout adjust adds estimated burned calories to your
                      daily budget.
                    </p>
                    <SectionSaveButton
                      label="Save nutrition logic"
                      saving={saving}
                      onClick={handleSaveNutritionLogic}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Notifications Section */}
                <AccordionItem value="reminders" className="border-none">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Notifications
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      <ReminderRow
                        label="Water"
                        reminder={pushReminders.water}
                        onChange={(patch) => updateReminder("water", patch)}
                      />
                      <RowDivider />
                      <ReminderRow
                        label="Meal log"
                        reminder={pushReminders.meal}
                        onChange={(patch) => updateReminder("meal", patch)}
                      />
                      <RowDivider />
                      <ReminderRow
                        label="Workout"
                        reminder={pushReminders.workout}
                        onChange={(patch) => updateReminder("workout", patch)}
                      />
                      <RowDivider />
                      <ReminderRow
                        label="Body check-in"
                        reminder={pushReminders.body}
                        onChange={(patch) => updateReminder("body", patch)}
                      />
                      <RowDivider />
                      <ReminderRow
                        label="Supplements"
                        reminder={pushReminders.supplement}
                        onChange={(patch) =>
                          updateReminder("supplement", patch)
                        }
                      />
                    </div>
                    <SectionSaveButton
                      label="Save notifications"
                      saving={saving}
                      onClick={handleSaveNotifications}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Privacy Section */}
                <AccordionItem value="privacy" className="border-none">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Privacy & Offline
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      <SettingsRow label="Analytics">
                        <SegmentedControl
                          value={analyticsEnabled ? "on" : "off"}
                          onChange={(v) => setAnalyticsEnabled(v === "on")}
                          options={[
                            { value: "off", label: "Off" },
                            { value: "on", label: "On" },
                          ]}
                        />
                      </SettingsRow>
                      <RowDivider />
                      <SettingsRow label="Personal insights">
                        <SegmentedControl
                          value={personalizedInsightsEnabled ? "on" : "off"}
                          onChange={(v) =>
                            setPersonalizedInsightsEnabled(v === "on")
                          }
                          options={[
                            { value: "off", label: "Off" },
                            { value: "on", label: "On" },
                          ]}
                        />
                      </SettingsRow>
                      <RowDivider />
                      <button
                        type="button"
                        onClick={handleInstallApp}
                        disabled={pwaCopy.disabled}
                        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-opacity active:opacity-60 disabled:opacity-55"
                      >
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium">
                            Install app
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/45">
                            {pwaCopy.description}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-muted/70 px-2 py-1 text-[10px] font-bold tracking-wide text-muted-foreground/65 uppercase">
                            {pwaCopy.statusLabel}
                          </span>
                          <span className="app-button app-button-quiet pointer-events-none min-h-8 px-3 text-[11px]">
                            {pwaCopy.actionLabel}
                          </span>
                        </span>
                      </button>
                      <RowDivider />
                      <button
                        type="button"
                        onClick={handleFlushOfflineQueue}
                        disabled={syncingOfflineQueue}
                        aria-busy={syncingOfflineQueue}
                        aria-label={`${offlineSyncStatus.title}. ${offlineSyncStatus.body}${offlineSyncActionLabel === "Retry" ? " Retry saved changes." : ""}`}
                        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-opacity active:opacity-60 disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium">
                            Data sync
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/45">
                            {offlineSyncStatus.body}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2 text-[10px] font-bold",
                              offlineSyncStatus.tone === "error"
                                ? "bg-destructive/10 text-destructive"
                                : offlineSyncStatus.tone === "synced"
                                  ? "bg-muted/70 text-muted-foreground/70"
                                  : "bg-muted/70 text-muted-foreground/70"
                            )}
                          >
                            {syncingOfflineQueue ? (
                              <ArrowsClockwise
                                size={12}
                                className="animate-spin"
                                weight="bold"
                              />
                            ) : offlineSyncStatus.tone === "error" ? (
                              <Warning size={12} weight="bold" />
                            ) : offlineSyncStatus.tone === "synced" ? (
                              <CheckCircle size={12} weight="bold" />
                            ) : !offlineOnline ? (
                              <WifiSlash size={12} weight="bold" />
                            ) : (
                              <CloudArrowUp size={12} weight="bold" />
                            )}
                            {offlineSyncActionLabel}
                          </span>
                          <CaretRight
                            className="text-muted-foreground/30"
                            size={16}
                          />
                        </span>
                      </button>
                      <RowDivider />
                      <button
                        type="button"
                        onClick={handleExportData}
                        disabled={exporting}
                        aria-busy={exporting}
                        className="flex w-full items-center justify-between px-4 py-4 text-left transition-opacity active:opacity-60 disabled:opacity-50"
                      >
                        <span className="text-[14px] font-medium">
                          {exporting ? "Preparing export…" : "Export my data"}
                        </span>
                        <CaretRight
                          className="text-muted-foreground/30"
                          size={16}
                        />
                      </button>
                      <RowDivider />
                      <button
                        type="button"
                        onClick={handleClearLocalData}
                        className="flex w-full items-center justify-between px-4 py-4 text-left transition-opacity active:opacity-60"
                      >
                        <span>
                          <span className="block text-[14px] font-medium">
                            Clear local cache
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground/45">
                            Removes offline queue and local preferences on this
                            device.
                          </span>
                        </span>
                      </button>
                    </div>
                    <SectionSaveButton
                      label="Save privacy settings"
                      saving={saving}
                      onClick={handleSavePrivacy}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Data Section */}
                <AccordionItem value="data" className="border-none">
                  <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                    <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                      Data
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="!h-auto px-0 pt-1">
                    <div className={SETTINGS_PANEL_CLASS}>
                      <button
                        type="button"
                        onClick={handleResetOnboarding}
                        disabled={resettingOnboarding}
                        aria-busy={resettingOnboarding}
                        className="flex w-full items-center justify-between px-4 py-4 text-left text-destructive transition-opacity active:opacity-60 disabled:opacity-50"
                      >
                        <span className="text-[14px] font-medium">
                          {resettingOnboarding
                            ? "Resetting onboarding..."
                            : "Reset onboarding"}
                        </span>
                      </button>
                      <RowDivider />
                      <div className="space-y-3 px-4 py-4">
                        <div>
                          <p className="text-[14px] font-semibold text-destructive">
                            Delete account
                          </p>
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground/55">
                            Permanently removes your OneRep logs, settings,
                            local offline queue, and app account data.
                          </p>
                        </div>
                        <input
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="Type DELETE to confirm"
                          className="w-full rounded-xl border border-border/40 bg-muted/40 px-3 py-2.5 text-[13px] outline-none focus:border-destructive/50"
                        />
                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          disabled={deleteConfirmText !== "DELETE" || deleting}
                          aria-busy={deleting}
                          className="text-destructive-foreground w-full rounded-xl bg-destructive px-3 py-3 text-[13px] font-bold transition-opacity active:opacity-75 disabled:opacity-35"
                        >
                          {deleting
                            ? "Deleting…"
                            : "Permanently delete account"}
                        </button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {SHOW_DEV_SETTINGS && (
                  <AccordionItem value="developer" className="border-none">
                    <AccordionTrigger
                      className={SETTINGS_SECTION_TRIGGER_CLASS}
                    >
                      <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                        Developer
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="!h-auto px-0 pt-1">
                      <div className={SETTINGS_PANEL_CLASS}>
                        <button
                          type="button"
                          onClick={handleResetCoachOnboarding}
                          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-opacity active:opacity-60"
                        >
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium">
                              Reset Coach introduction
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/45">
                              Shows the Coach skill walkthrough again on your
                              next visit.
                            </span>
                          </span>
                          <span className="app-button app-button-quiet pointer-events-none min-h-8 px-3 text-[11px]">
                            Reset
                          </span>
                        </button>
                        <RowDivider />
                        <button
                          type="button"
                          onClick={handleRefreshShownTooltips}
                          disabled={refreshingTooltips}
                          aria-busy={refreshingTooltips}
                          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-opacity active:opacity-60 disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium">
                              Refresh shown tooltips
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/45">
                              Clears completed tooltip state for this account.
                            </span>
                          </span>
                          <span className="app-button app-button-quiet pointer-events-none min-h-8 px-3 text-[11px]">
                            {refreshingTooltips ? "Refreshing..." : "Refresh"}
                          </span>
                        </button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </div>
          </>
        ) : (
          <div
            role="status"
            aria-label="Loading settings"
            className="flex min-h-[45svh] flex-col items-center justify-center px-6 text-center"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
            <p className="mt-4 text-[14px] font-semibold tracking-tight">
              Loading settings
            </p>
            <p className="mt-1 max-w-[16rem] text-[12px] leading-4 text-muted-foreground/60">
              Syncing your preferences, goals, and account controls.
            </p>
          </div>
        )}
      </main>
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
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 short-phone:py-3">
      <div>
        <span className="block text-[14px] text-foreground/80">{label}</span>
        <span className="mt-0.5 block text-[10.5px] text-muted-foreground/45">
          {reminder.enabled ? formatReminderLabel(reminder) : "Off"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={timeValue}
          onChange={(e) => {
            const [hour, minute] = e.target.value.split(":").map(Number)
            onChange({ hour, minute })
          }}
          className="h-10 rounded-[10px] bg-muted/60 px-2 text-[12px] font-semibold outline-none"
        />
        <button
          type="button"
          onClick={() => {
            hapticSelection()
            onChange({ enabled: !reminder.enabled })
          }}
          aria-label={`${reminder.enabled ? "Disable" : "Enable"} ${label} reminder`}
          className={cn(
            "relative h-10 w-16 rounded-full transition-colors",
            reminder.enabled ? "bg-foreground" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-8 w-8 rounded-full bg-background shadow-sm transition-transform",
              reminder.enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>
    </div>
  )
}

function SettingsRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 short-phone:py-3">
      <span className="text-[14px] text-foreground/80">{label}</span>
      {children}
    </div>
  )
}

function RowDivider() {
  return <div className="mx-4 h-px bg-border/20" />
}

type AiUsageSummary = {
  count: number
  remaining: number
  limit: number
  month: string
}

function formatAiUsageMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return "This month"
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function AiUsageProgress({ usage }: { usage?: AiUsageSummary | null }) {
  const limit = usage?.limit ?? 150
  const count = usage?.count ?? 0
  const remaining = usage?.remaining ?? limit
  const percent =
    limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0
  const isNearLimit = remaining <= 15

  return (
    <div className="px-4 py-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-foreground/85">
            AI usage
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/48">
            {formatAiUsageMonth(usage?.month ?? "")} · {remaining} request
            {remaining === 1 ? "" : "s"} left
          </p>
        </div>
        <p className="shrink-0 text-[12px] font-bold text-muted-foreground/62 tabular-nums">
          {count}/{limit}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/55">
        <div
          className="h-full rounded-full transition-[width,background-color]"
          style={{
            width: `${percent}%`,
            backgroundColor: isNearLimit
              ? "var(--status-danger)"
              : "var(--foreground)",
          }}
        />
      </div>
      <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground/45">
        Shared across AI metrics, workout generation, and food photo analysis.
      </p>
    </div>
  )
}

function RevenueCatSubscriptionPanel({
  revenueCat,
}: {
  revenueCat: ReturnType<typeof useRevenueCat>
}) {
  const [action, setAction] = useState<
    "purchase" | "restore" | "refresh" | "cancel" | null
  >(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const active = revenueCat.hasOneRepPro
  const canceling = action === "cancel"
  const opensSubscriptionManagement = revenueCat.cancelOpensManagement
  const loading = revenueCat.status === "loading"
  const unsupported = revenueCat.status === "unsupported"
  const monthlyPrice = revenueCat.monthlyPrice ?? "Monthly"
  const subscriptionDiagnostic = revenueCat.subscriptionDiagnostic
  const disabled = unsupported || loading || action !== null
  const purchaseDisabled = revenueCat.isNative
    ? disabled || !revenueCat.canPurchase
    : action !== null || !revenueCat.canPurchase
  const refreshLabel =
    action === "refresh"
      ? "Checking..."
      : subscriptionDiagnostic.canRetry
        ? "Retry status"
        : "Refresh"

  async function runRevenueCatAction(
    nextAction: Exclude<typeof action, null>,
    task: () => Promise<unknown>,
    successMessage?: string
  ) {
    if (action) return
    hapticMedium()
    setAction(nextAction)
    try {
      const result = await task()
      const customerInfo =
        result && typeof result === "object" && "entitlements" in result
          ? (result as {
              entitlements: { active: Record<string, unknown> }
            })
          : null
      if (
        nextAction !== "cancel" &&
        hasOneRepPro(customerInfo as Parameters<typeof hasOneRepPro>[0])
      ) {
        celebrateSubscription()
        if (successMessage) toast.success(successMessage)
      } else if (nextAction === "restore") {
        toast.message("No active Pro subscription found")
      } else if (successMessage) {
        toast.success(successMessage)
      }
    } catch (error) {
      const message = revenueCatErrorMessage(
        error,
        "Subscription action failed"
      )
      if (message !== "Purchase canceled") {
        toast.error(message)
      }
    } finally {
      setAction(null)
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="rounded-[18px] border border-border/45 bg-card p-4 shadow-[0_10px_30px_color-mix(in_srgb,var(--foreground)_5%,transparent)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-[0.16em] text-muted-foreground/45 uppercase">
              Subscription
            </p>
            <p className="mt-1 text-[18px] leading-tight font-black tracking-tight text-foreground">
              OneRep Pro
            </p>
            <p className="mt-1 max-w-[34rem] text-[12.5px] leading-relaxed text-muted-foreground/58">
              {active
                ? "AI meal analysis, workout generation, and progress insights are unlocked."
                : "Optional AI features for food photo analysis, workout generation, and progress insights."}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black tracking-wide uppercase",
              active
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground ring-1 ring-border/35"
            )}
          >
            {active ? "Active" : "Free"}
          </span>
        </div>

        {!active && (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {[
              "Analyze meals from photos",
              "Generate workouts with AI",
              "Ask for progress insights",
            ].map((benefit) => (
              <div
                key={benefit}
                className="rounded-[12px] border border-border/35 bg-background/45 px-3 py-2.5"
              >
                <p className="text-[11.5px] leading-snug font-bold text-foreground/78">
                  {benefit}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-[14px] bg-muted/25 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-bold text-foreground/86">
              Monthly plan
            </p>
            <p className="shrink-0 text-[15px] font-black tracking-tight whitespace-nowrap text-foreground tabular-nums">
              {monthlyPrice}
            </p>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground/58">
            {active
              ? "Active on this account. Manage renewal through the original purchase store."
              : "Upgrade only if you want AI features. Core tracking stays free."}
          </p>
        </div>

        <div
          role="status"
          aria-live={
            subscriptionDiagnostic.tone === "attention" ? "assertive" : "polite"
          }
          className={cn(
            "mt-2 flex min-h-8 items-center gap-2 rounded-[10px] px-2.5 py-2 text-[10.5px] font-medium",
            subscriptionDiagnostic.tone === "attention"
              ? "border border-destructive/20 bg-destructive/8 text-destructive"
              : "bg-background text-muted-foreground/60"
          )}
        >
          {subscriptionDiagnostic.tone === "attention" ? (
            <Warning size={13} weight="bold" className="shrink-0" />
          ) : subscriptionDiagnostic.tone === "success" ? (
            <CheckCircle size={13} weight="bold" className="shrink-0" />
          ) : subscriptionDiagnostic.tone === "pending" ? (
            <ArrowsClockwise
              size={13}
              weight="bold"
              className="shrink-0 animate-spin"
            />
          ) : (
            <CloudArrowUp size={13} weight="bold" className="shrink-0" />
          )}
          <span className="min-w-0 truncate">
            <span className="font-bold">{subscriptionDiagnostic.title}</span>
            <span className="text-muted-foreground/55">
              {" · "}
              {subscriptionDiagnostic.detail}
            </span>
          </span>
        </div>

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            disabled={active ? disabled : purchaseDisabled}
            aria-busy={active ? action === "cancel" : action === "purchase"}
            onClick={() =>
              active
                ? setConfirmCancel(true)
                : void runRevenueCatAction(
                    "purchase",
                    revenueCat.purchaseMonthly
                  )
            }
            className="min-h-10 rounded-xl bg-foreground px-3 text-[12.5px] font-bold text-background transition-opacity active:opacity-75 disabled:opacity-50"
          >
            {action === "purchase"
              ? "Starting checkout..."
              : active
                ? action === "cancel"
                  ? "Canceling..."
                  : opensSubscriptionManagement
                    ? "Manage subscription"
                    : "Cancel renewal"
                : revenueCat.canPurchase
                  ? "Upgrade to Pro"
                  : "Products unavailable"}
          </button>

          <div
            className={cn("grid gap-2", active ? "grid-cols-1" : "grid-cols-2")}
          >
            {!active && (
              <button
                type="button"
                disabled={disabled}
                aria-busy={action === "restore"}
                onClick={() =>
                  void runRevenueCatAction(
                    "restore",
                    revenueCat.restorePurchases,
                    "Purchases restored"
                  )
                }
                className="min-h-9 rounded-xl bg-background px-2 text-[10.5px] font-bold text-foreground/78 ring-1 ring-border/45 transition-opacity active:opacity-75 disabled:opacity-45"
              >
                {action === "restore" ? "..." : "Restore"}
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              aria-busy={action === "refresh"}
              aria-label={
                subscriptionDiagnostic.canRetry
                  ? "Retry subscription status"
                  : "Refresh subscription status"
              }
              onClick={() =>
                void runRevenueCatAction(
                  "refresh",
                  revenueCat.refresh,
                  "Subscription refreshed"
                )
              }
              className="min-h-9 rounded-xl bg-background px-2 text-[10.5px] font-bold text-foreground/78 ring-1 ring-border/45 transition-opacity active:opacity-75 disabled:opacity-45"
            >
              {refreshLabel}
            </button>
          </div>
        </div>
      </div>

      {confirmCancel && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/75 px-4 backdrop-blur-xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cancel-subscription-title"
          onClick={() => setConfirmCancel(false)}
        >
          <div
            className="w-full max-w-sm rounded-[20px] border border-border/55 bg-card p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="cancel-subscription-title"
              className="text-[18px] font-black tracking-tight text-foreground"
            >
              Cancel OneRep Pro?
            </h3>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground/65">
              {opensSubscriptionManagement
                ? "We’ll open the secure subscription page for the store where you purchased OneRep Pro."
                : "Your subscription will stop renewing. Pro access usually remains available until the end of your current billing period."}
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={canceling}
                aria-busy={canceling}
                onClick={() =>
                  void runRevenueCatAction(
                    "cancel",
                    async () => {
                      const result = await revenueCat.cancelSubscription()
                      setConfirmCancel(false)
                      return result
                    },
                    opensSubscriptionManagement
                      ? undefined
                      : "Subscription canceled"
                  )
                }
                className="text-destructive-foreground min-h-10 rounded-xl bg-destructive px-3 text-[12.5px] font-bold transition-opacity active:opacity-80 disabled:opacity-50"
              >
                {canceling
                  ? "Canceling..."
                  : opensSubscriptionManagement
                    ? "Continue to manage"
                    : "Confirm cancellation"}
              </button>
              <button
                type="button"
                disabled={canceling}
                onClick={() => setConfirmCancel(false)}
                className="min-h-10 rounded-xl bg-muted px-3 text-[12.5px] font-bold text-foreground/75 transition-opacity active:opacity-75"
              >
                Keep OneRep Pro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionSaveButton({
  label,
  saving,
  onClick,
}: {
  label: string
  saving: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="app-button app-button-primary mt-3 min-h-11 w-full text-[14px] disabled:opacity-50"
    >
      {saving ? "Saving..." : label}
    </button>
  )
}

function NumberStepper({
  value,
  onChange,
  suffix,
  min,
  max,
  step,
  label,
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
  min: number
  max: number
  step: number
  label?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  function decrement() {
    const n = Math.max(min, value - step)
    hapticTap()
    onChange(n)
  }

  function increment() {
    const n = Math.min(max, value + step)
    hapticTap()
    onChange(n)
  }

  function commit() {
    // Validate the entire string is a plain integer (no partial matches, no scientific notation)
    const isValidInteger = /^[+-]?\d+$/.test(draft.trim())
    if (isValidInteger) {
      const parsed = Number(draft.trim())
      onChange(Math.max(min, Math.min(max, parsed)))
    } else {
      setDraft(String(value))
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-1">
      {/* Decrement */}
      <button
        onClick={decrement}
        disabled={value <= min}
        aria-label={label ? `Decrease ${label}` : "Decrease"}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-[10px]",
          "bg-muted/60 text-foreground/70 transition-all",
          "active:scale-[0.985] active:bg-muted",
          "disabled:pointer-events-none disabled:opacity-25"
        )}
      >
        <Minus size={13} weight="bold" />
      </button>

      {/* Value display / inline edit */}
      <button
        onClick={() => {
          setEditing(true)
          setDraft(String(value))
          setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
          }, 0)
        }}
        aria-label={
          label
            ? `Edit ${label}, current value ${value}`
            : `Edit value ${value}`
        }
        className={cn(
          "relative flex min-h-10 min-w-[62px] flex-col items-center justify-center rounded-[10px] px-2",
          "bg-muted/60 transition-colors",
          editing && "hidden"
        )}
      >
        <span className="text-[14px] leading-none font-semibold tabular-nums">
          {value}
        </span>
        {suffix && (
          <span className="mt-0.5 text-[9px] font-medium text-muted-foreground/45 uppercase">
            {suffix}
          </span>
        )}
      </button>

      {editing && (
        <div className="flex min-h-10 min-w-[62px] flex-col items-center justify-center rounded-[10px] bg-muted/80 px-2 ring-1 ring-foreground/20">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit()
            }}
            aria-label={label || "Value"}
            className="w-12 bg-transparent text-center text-[14px] leading-none font-semibold tabular-nums focus:outline-none"
            style={
              {
                WebkitAppearance: "none",
                MozAppearance: "textfield",
              } as React.CSSProperties
            }
          />
          {suffix && (
            <span className="mt-0.5 text-[9px] font-medium text-muted-foreground/45 uppercase">
              {suffix}
            </span>
          )}
        </div>
      )}

      {/* Increment */}
      <button
        onClick={increment}
        disabled={value >= max}
        aria-label={label ? `Increase ${label}` : "Increase"}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-[10px]",
          "bg-muted/60 text-foreground/70 transition-all",
          "active:scale-[0.985] active:bg-muted",
          "disabled:pointer-events-none disabled:opacity-25"
        )}
      >
        <Plus size={13} weight="bold" />
      </button>
    </div>
  )
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex gap-0.5 rounded-[10px] bg-muted/60 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => {
            hapticSelection()
            onChange(opt.value)
          }}
          className={cn(
            "min-h-10 rounded-[9px] px-3 text-[12px] font-semibold transition-all duration-150",
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground/45 active:text-foreground/60"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
