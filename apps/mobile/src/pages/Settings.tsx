import React, { useState, useEffect, useRef } from "react"
import {
  ArrowLeft,
  ArrowsClockwise,
  Barbell,
  BellSimple,
  CaretRight,
  CheckCircle,
  CloudArrowUp,
  Database,
  ForkKnife,
  GearFine,
  Minus,
  Moon,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserCircle,
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
import { toast } from "sonner"
import { useTheme } from "@repo/ui"
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
import {
  DisclosureRow,
  GroupedList,
  ListRow,
  NavigationBar,
  ToolbarButton,
} from "@/components/mobile-ui"

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
  | "data"
  | "developer"

const SHOW_DEV_SETTINGS = import.meta.env.DEV

const SETTINGS_VIEW_TITLES: Record<SettingsView, string> = {
  overview: "Settings",
  appearance: "Appearance",
  account: "Account",
  targets: "Daily targets",
  preferences: "Training & app",
  nutrition: "Nutrition strategy",
  reminders: "Reminders",
  privacy: "Privacy & sync",
  data: "Data & account",
  developer: "Developer",
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
  const { theme, setTheme } = useTheme()
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
  const [activeView, setActiveView] = useState<SettingsView>("overview")
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
    setTheme("system")
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
          title={SETTINGS_VIEW_TITLES[activeView]}
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
                      label={revenueCat.hasOneRepPro ? "Pro" : "Free"}
                      strong={revenueCat.hasOneRepPro}
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
                  <DisclosureRow
                    title="Data & account"
                    detail="Export, reset, or delete your data"
                    leading={<Database size={20} weight="regular" />}
                    onClick={() => showView("data")}
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

            {activeView === "appearance" && (
              <>
                <SettingsSectionIntro>
                  Choose a fixed theme or keep OneRep in step with this device.
                </SettingsSectionIntro>
                <GroupedList label="Appearance options">
                  <SettingsRow label="Theme">
                    <SegmentedControl
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
                    value={revenueCat.hasOneRepPro ? "Pro" : "Free"}
                  />
                </GroupedList>
                <SettingsSectionLabel title="AI usage" />
                <GroupedList label="AI usage">
                  <AiUsageProgress usage={aiUsage} />
                </GroupedList>
                <SettingsSectionLabel title="Subscription" />
                <GroupedList
                  label="OneRep Pro subscription"
                  className="profile-pro-group"
                >
                  <RevenueCatSubscriptionPanel revenueCat={revenueCat} />
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
                  <SettingsRow label="Food search language">
                    <SegmentedControl
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
                      checked={hapticsOn}
                      onChange={handleHapticsChange}
                      label="Haptic feedback"
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
                      checked={workoutAdjustmentEnabled}
                      onChange={setWorkoutAdjustmentEnabled}
                      label="Workout adjustment"
                    />
                  </SettingsRow>
                </GroupedList>

                {macroCyclingEnabled && (
                  <>
                    <SettingsSectionLabel
                      title="Training day"
                      detail="Higher-fuel target"
                    />
                    <GroupedList label="Training day targets">
                      <SettingsRow label="Calories">
                        <NumberStepper
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
                <SectionSaveButton
                  label="Save reminders"
                  saving={saving}
                  onClick={handleSaveNotifications}
                />
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
                    label="Analytics"
                    detail="Share anonymous product usage"
                  >
                    <CompactSwitch
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
                      checked={personalizedInsightsEnabled}
                      onChange={setPersonalizedInsightsEnabled}
                      label="Personalized insights"
                    />
                  </SettingsRow>
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
                    detail="Download a portable JSON copy with a checksum"
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
                    title="Clear local cache"
                    detail="Remove offline changes and device-only preferences"
                    onClick={handleClearLocalData}
                  />
                </GroupedList>

                <SettingsSectionLabel
                  title="Danger zone"
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
                    Permanently removes your logs, settings, offline queue, and
                    OneRep account data.
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

            {activeView === "developer" && SHOW_DEV_SETTINGS && (
              <>
                <SettingsSectionIntro>
                  Internal controls for testing product education and account
                  state.
                </SettingsSectionIntro>
                <GroupedList label="Developer controls">
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
                </GroupedList>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function SettingsSectionIntro({ children }: { children: React.ReactNode }) {
  return (
    <p className="native-supporting px-[var(--app-page-x)] pb-2 md:max-w-xl">
      {children}
    </p>
  )
}

function SettingsSectionLabel({
  title,
  detail,
  danger = false,
}: {
  title: string
  detail?: string
  danger?: boolean
}) {
  return (
    <div className="px-[var(--app-page-x)] pt-7 pb-2">
      <h2
        className={cn(
          "text-[15px] font-semibold tracking-tight",
          danger ? "text-destructive" : "text-foreground"
        )}
      >
        {title}
      </h2>
      {detail && <p className="native-row-detail mt-0.5">{detail}</p>}
    </div>
  )
}

function SettingsLoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading settings"
      className="flex min-h-[45svh] flex-col items-center justify-center px-6 text-center"
    >
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70" />
      <p className="native-section-title mt-4">Loading settings</p>
      <p className="native-row-detail mt-1 max-w-[18rem]">
        Syncing your preferences, goals, and account controls.
      </p>
    </div>
  )
}

function StatusPill({
  label,
  strong = false,
}: {
  label: string
  strong?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-2.5 text-[13px] font-semibold",
        strong
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  )
}

function CompactSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
}) {
  const track = (
    <span
      className={cn(
        "pointer-events-none relative block h-8 w-[3.25rem] rounded-full transition-colors",
        checked ? "bg-foreground" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-1 block size-6 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </span>
  )

  if (!onChange) {
    return (
      <span
        className="inline-flex h-11 w-14 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {track}
      </span>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-[0.65rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      onClick={() => {
        hapticSelection()
        onChange(!checked)
      }}
    >
      {track}
    </button>
  )
}

function SyncStatusIcon({
  status,
  online,
  syncing,
}: {
  status: ReturnType<typeof offlineSyncStatusCopy>["tone"]
  online: boolean
  syncing: boolean
}) {
  if (syncing) {
    return (
      <ArrowsClockwise
        size={18}
        aria-hidden="true"
        className="animate-spin text-muted-foreground"
      />
    )
  }
  if (status === "error") {
    return <Warning size={18} aria-hidden="true" className="text-destructive" />
  }
  if (!online) {
    return (
      <WifiSlash
        size={18}
        aria-hidden="true"
        className="text-muted-foreground"
      />
    )
  }
  return status === "synced" ? (
    <CheckCircle
      size={18}
      aria-hidden="true"
      className="text-muted-foreground"
    />
  ) : (
    <CloudArrowUp
      size={18}
      aria-hidden="true"
      className="text-muted-foreground"
    />
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
          checked={reminder.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={`${label} reminder`}
        />
      </div>
    </div>
  )
}

function SettingsRow({
  label,
  detail,
  children,
}: {
  label: string
  detail?: string
  children: React.ReactNode
}) {
  return (
    <div className="native-list-row flex-wrap">
      <span className="min-w-[8rem] flex-1">
        <span className="native-row-title block">{label}</span>
        {detail && (
          <span className="native-row-detail mt-0.5 block">{detail}</span>
        )}
      </span>
      <div className="ml-auto max-w-full overflow-x-auto">{children}</div>
    </div>
  )
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
    <div className="px-[var(--app-page-x)] py-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="native-row-title">Monthly requests</p>
          <p className="native-row-detail mt-0.5">
            {formatAiUsageMonth(usage?.month ?? "")} · {remaining} request
            {remaining === 1 ? "" : "s"} left
          </p>
        </div>
        <p className="native-row-value shrink-0">
          {count}/{limit}
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Monthly AI usage"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={count}
      >
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
      <p className="native-row-detail mt-2">
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
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
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

  useEffect(() => {
    if (!confirmCancel) return
    cancelButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !canceling) {
        setConfirmCancel(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canceling, confirmCancel])

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
    <>
      <div
        className="profile-pro-card"
        data-subscription-state={active ? "active" : "free"}
      >
        <div className="profile-pro-content">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="profile-pro-title">OneRep Pro</p>
              <p className="profile-pro-description">
                {active
                  ? "AI meal analysis, workout generation, and progress insights are unlocked."
                  : "Unlock AI meal analysis, workout generation, and progress insights. Core tracking stays free."}
              </p>
            </div>
            <span className="profile-pro-status">
              {active && <CheckCircle size={15} weight="fill" aria-hidden />}
              {active ? "Active" : "Free"}
            </span>
          </div>

          <div className="profile-pro-plan">
            <span>
              <span className="profile-pro-plan-label">Plan</span>
              <span className="profile-pro-plan-name">Monthly</span>
            </span>
            <span className="profile-pro-price">{monthlyPrice}</span>
          </div>

          <div
            role="status"
            aria-live={
              subscriptionDiagnostic.tone === "attention"
                ? "assertive"
                : "polite"
            }
            className="profile-pro-diagnostic"
            data-tone={subscriptionDiagnostic.tone}
          >
            {subscriptionDiagnostic.tone === "attention" ? (
              <Warning size={16} weight="bold" className="mt-0.5 shrink-0" />
            ) : subscriptionDiagnostic.tone === "success" ? (
              <CheckCircle
                size={16}
                weight="bold"
                className="mt-0.5 shrink-0"
              />
            ) : subscriptionDiagnostic.tone === "pending" ? (
              <ArrowsClockwise
                size={16}
                weight="bold"
                className="mt-0.5 shrink-0 animate-spin"
              />
            ) : (
              <CloudArrowUp
                size={16}
                weight="bold"
                className="mt-0.5 shrink-0"
              />
            )}
            <span>
              <span className="font-semibold">
                {subscriptionDiagnostic.title}
              </span>
              {" · "}
              {subscriptionDiagnostic.detail}
            </span>
          </div>

          <div className="profile-pro-actions">
            <button
              type="button"
              disabled={active ? disabled : purchaseDisabled}
              aria-busy={active ? action === "cancel" : action === "purchase"}
              onClick={() => {
                if (active) {
                  hapticTap()
                  setConfirmCancel(true)
                  return
                }
                void runRevenueCatAction("purchase", revenueCat.purchaseMonthly)
              }}
              className={cn(
                "profile-pro-primary-action",
                active && "profile-pro-management-action"
              )}
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

            <div className="profile-pro-secondary-actions">
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
                  className="profile-pro-secondary-action"
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
                className="profile-pro-secondary-action"
              >
                <ArrowsClockwise
                  size={15}
                  weight="bold"
                  aria-hidden
                  className={action === "refresh" ? "animate-spin" : undefined}
                />
                {refreshLabel}
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmCancel && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 px-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cancel-subscription-title"
          aria-describedby="cancel-subscription-description"
          onClick={() => {
            if (!canceling) setConfirmCancel(false)
          }}
        >
          <div
            className="w-full max-w-sm rounded-[0.75rem] border border-border bg-card p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="cancel-subscription-title" className="native-section-title">
              Cancel OneRep Pro?
            </h3>
            <p
              id="cancel-subscription-description"
              className="native-row-detail mt-2"
            >
              {opensSubscriptionManagement
                ? "We’ll open the secure subscription page for the store where you purchased OneRep Pro."
                : "Your subscription will stop renewing. Pro access usually remains available until the end of your current billing period."}
            </p>
            <div className="mt-4 grid gap-2">
              <button
                ref={cancelButtonRef}
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
                className="text-destructive-foreground min-h-11 rounded-[0.65rem] bg-destructive px-3 text-[15px] font-semibold disabled:opacity-50"
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
                className="min-h-11 rounded-[0.65rem] bg-muted px-3 text-[15px] font-semibold text-foreground"
              >
                Keep OneRep Pro
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
    <div className="px-[var(--app-page-x)] pt-5">
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        className="native-primary-button w-full disabled:opacity-50"
      >
        {saving ? "Saving..." : label}
      </button>
    </div>
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
        type="button"
        onClick={decrement}
        disabled={value <= min}
        aria-label={label ? `Decrease ${label}` : "Decrease"}
        className={cn(
          "flex size-11 items-center justify-center rounded-[0.65rem]",
          "bg-muted text-foreground transition-colors",
          "active:bg-[var(--surface-pressed)]",
          "disabled:pointer-events-none disabled:opacity-25"
        )}
      >
        <Minus size={13} weight="bold" />
      </button>

      {/* Value display / inline edit */}
      <button
        type="button"
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
          "relative flex min-h-11 min-w-[68px] flex-col items-center justify-center rounded-[0.65rem] px-2",
          "bg-muted transition-colors",
          editing && "hidden"
        )}
      >
        <span className="text-[14px] leading-none font-semibold tabular-nums">
          {value}
        </span>
        {suffix && (
          <span className="mt-0.5 text-[13px] font-medium text-muted-foreground">
            {suffix}
          </span>
        )}
      </button>

      {editing && (
        <div className="flex min-h-11 min-w-[68px] flex-col items-center justify-center rounded-[0.65rem] bg-muted px-2 ring-1 ring-foreground/35">
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
            <span className="mt-0.5 text-[13px] font-medium text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      )}

      {/* Increment */}
      <button
        type="button"
        onClick={increment}
        disabled={value >= max}
        aria-label={label ? `Increase ${label}` : "Increase"}
        className={cn(
          "flex size-11 items-center justify-center rounded-[0.65rem]",
          "bg-muted text-foreground transition-colors",
          "active:bg-[var(--surface-pressed)]",
          "disabled:pointer-events-none disabled:opacity-25"
        )}
      >
        <Plus size={13} weight="bold" />
      </button>
    </div>
  )
}

function SegmentedControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div
      className="app-segmented auto-cols-fr grid-flow-col"
      role="group"
      aria-label={label}
    >
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          aria-pressed={value === opt.value}
          data-active={value === opt.value}
          onClick={() => {
            hapticSelection()
            onChange(opt.value)
          }}
          className="app-segmented-button whitespace-nowrap"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
