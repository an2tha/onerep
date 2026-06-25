import React, { useState, useEffect, useRef } from "react"
import { X, CaretRight, Minus, Plus, Sun, Moon } from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { hapticTap, hapticSelection, hapticMedium } from "@/lib/haptics"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@repo/ui"
import { toast } from "sonner"
import posthog from "posthog-js"
import { convexClient } from "@/lib/convex"
import {
  clearOfflineQueue,
  flushOfflineQueue,
  getOfflineQueueSummary,
} from "@/lib/offline-queue"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import {
  formatReminderLabel,
  mergeReminderSettings,
  syncPushReminders,
  type ReminderSettings,
} from "@/lib/reminders"

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
    (localStorage.getItem("theme") as Theme) ||
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
  localStorage.setItem("theme", theme)
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

const SETTINGS_SECTION_TRIGGER_CLASS =
  "rounded-[20px] border border-border/50 bg-card/85 px-4 py-3 text-left hover:no-underline data-[state=open]:bg-card short-phone:rounded-[18px] short-phone:py-2.5"
const SETTINGS_PANEL_CLASS =
  "overflow-hidden rounded-[20px] border border-border/50 bg-card/85 short-phone:rounded-[18px]"

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
  const preferences = useQuery(api.users.users.getPreferences)
  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {})
  const session = useQuery(api.users.users.getCurrentUser)
  const onboarding = useQuery(api.users.onboarding.get)

  const setDashboardSettings = useOfflineMutation(
    api.users.users.setDashboardSettings,
    "users.users.setDashboardSettings"
  )
  const setWeightUnit = useOfflineMutation(
    api.users.users.setWeightUnit,
    "users.users.setWeightUnit"
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
  const deleteMyDataBatch = useMutation(api.users.users.deleteMyDataBatch)

  const [workoutFocus, setWorkoutFocus] = useState<WorkoutFocus>(
    (preferences?.dashboardSettings?.workoutFocus as WorkoutFocus) || "strength"
  )
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>(
    (preferences?.weightUnit as WeightUnit) || "kg"
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
    return localStorage.getItem("onerep:analytics-enabled") !== "false"
  })
  const [personalizedInsightsEnabled, setPersonalizedInsightsEnabled] =
    useState(true)
  const [offlineQueueTotal, setOfflineQueueTotal] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deletePassword, setDeletePassword] = useState("")

  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [theme, setThemeState] = useState<Theme>("light")

  // Initialize theme
  useEffect(() => {
    setThemeState(getStoredTheme())
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
    const refresh = () => setOfflineQueueTotal(getOfflineQueueSummary().total)
    refresh()
    window.addEventListener("online", refresh)
    window.addEventListener("offline", refresh)
    window.addEventListener("onerep:offline-queue-changed", refresh)
    return () => {
      window.removeEventListener("online", refresh)
      window.removeEventListener("offline", refresh)
      window.removeEventListener("onerep:offline-queue-changed", refresh)
    }
  }, [])

  function handleThemeToggle() {
    hapticMedium()
    const nextTheme = toggleTheme()
    setThemeState(nextTheme)
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

  async function handleSaveGoals() {
    await runSectionSave(async () => {
      await setCustomGoals({
        calories,
        protein,
        carbs,
        fat,
      })
    }, "Goals saved")
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
    }, "Workout settings saved")
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

      localStorage.setItem("onerep:analytics-enabled", String(analyticsEnabled))
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
      await authClient.signOut()
      localStorage.removeItem(PRELOGIN_SEEN_KEY)
      posthog.reset()
      navigate("/login", { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Log out failed")
    } finally {
      setLoggingOut(false)
    }
  }

  async function handleResetOnboarding() {
    hapticTap()
    await clearOnboarding({})
    navigate("/onboarding", { replace: true })
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
    hapticTap()
    const result = await flushOfflineQueue()
    setOfflineQueueTotal(result.remaining)
    if (result.remaining === 0) toast.success("Offline changes synced")
    else
      toast.message(
        `${result.remaining} change${result.remaining === 1 ? "" : "s"} still waiting`
      )
  }

  function handleClearLocalData() {
    hapticMedium()
    clearOfflineQueue()
    localStorage.removeItem("onerep:analytics-enabled")
    localStorage.removeItem("theme")
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
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `onerep-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success("Export downloaded")
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
      const payload = deletePassword ? { ["password"]: deletePassword } : {}
      const { error } = await authClient.deleteUser(payload)
      if (error) throw new Error(error.message ?? "Account deletion failed")

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
    <div className="desktop-canvas min-h-svh bg-background text-foreground md:pr-8 md:pl-72">
      <main className="mx-auto min-h-svh w-full max-w-3xl px-4 pt-[var(--app-safe-top)] pb-[calc(var(--app-safe-bottom-lg)+5rem)] md:px-6 md:pt-10 md:pb-12">
        {/* Header */}
        <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between border-b border-border/50 bg-background/90 px-4 py-3 backdrop-blur-xl md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none short-phone:mb-3 short-phone:py-2.5">
          <div>
            <h1 className="text-[21px] font-bold tracking-tight short-phone:text-[19px]">
              Settings
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleThemeToggle}
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/70 text-muted-foreground/60 transition-all active:scale-90"
            >
              {theme === "dark" ? (
                <Sun size={16} weight="bold" />
              ) : (
                <Moon size={16} weight="bold" />
              )}
            </button>
            <button
              onClick={() => {
                hapticTap()
                onClose()
              }}
              aria-label="Close settings"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/70 text-muted-foreground/60 transition-opacity active:opacity-50"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {settingsContentReady ? (
          <>
            <div className="space-y-2.5 short-phone:space-y-2">
              <Accordion
                type="multiple"
                defaultValue={["goals", "water", "workout"]}
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
                  <div className="flex items-center justify-between px-4 py-4">
                    <div>
                      <p className="text-[15px] font-semibold">
                        {session?.name || "User"}
                      </p>
                      {session?.email && (
                        <p className="mt-0.5 text-[12px] text-muted-foreground/50">
                          {session.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mx-4 h-px bg-border/20" />
                  <button
                    onClick={() => {
                      hapticTap()
                      handleLogout()
                    }}
                    className="flex w-full items-center justify-between px-4 py-4 text-left text-destructive transition-opacity active:opacity-60"
                  >
                    <span className="text-[14px] font-medium">Sign out</span>
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Goals Section */}
            <AccordionItem value="goals" className="border-none">
              <AccordionTrigger className={SETTINGS_SECTION_TRIGGER_CLASS}>
                <span className="text-[13px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
                  Goals
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
                </div>
                {effectiveGoals?.health && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground/35">
                    Health-based: {effectiveGoals.health.calories} kcal ·{" "}
                    {effectiveGoals.health.protein}g protein
                  </p>
                )}
                <SectionSaveButton
                  label="Save goals"
                  saving={saving}
                  onClick={handleSaveGoals}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Water Goal Section */}
            <AccordionItem value="water" className="border-none">
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
            <AccordionItem value="workout" className="border-none">
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
                </div>
                <SectionSaveButton
                  label="Save workout settings"
                  saving={saving}
                  onClick={handleSaveWorkout}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Health Profile Section */}
            <AccordionItem value="health" className="border-none">
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
                      <span className="text-[14px]">Set up health profile</span>
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
                      onChange={(v) => setWorkoutAdjustmentEnabled(v === "on")}
                      options={[
                        { value: "off", label: "Off" },
                        { value: "on", label: "On" },
                      ]}
                    />
                  </SettingsRow>
                </div>
                <p className="mt-2 px-4 text-[11px] leading-tight text-muted-foreground/60">
                  Macro cycling adjusts targets on days you log a workout.
                  Workout adjust adds estimated burned calories to your daily
                  budget.
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
                </div>
                <p className="mt-2 px-4 text-[11px] leading-tight text-muted-foreground/60">
                  Native local notifications are scheduled on installed iOS or
                  Android builds after saving.
                </p>
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
                    onClick={handleFlushOfflineQueue}
                    className="flex w-full items-center justify-between px-4 py-4 text-left transition-opacity active:opacity-60"
                  >
                    <span>
                      <span className="block text-[14px] font-medium">
                        Sync offline queue
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/45">
                        {offlineQueueTotal} pending change
                        {offlineQueueTotal === 1 ? "" : "s"}
                      </span>
                    </span>
                    <CaretRight
                      className="text-muted-foreground/30"
                      size={16}
                    />
                  </button>
                  <RowDivider />
                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={exporting}
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
                    onClick={handleResetOnboarding}
                    className="flex w-full items-center justify-between px-4 py-4 text-left text-destructive transition-opacity active:opacity-60"
                  >
                    <span className="text-[14px] font-medium">
                      Reset onboarding
                    </span>
                  </button>
                  <RowDivider />
                  <div className="space-y-3 px-4 py-4">
                    <div>
                      <p className="text-[14px] font-semibold text-destructive">
                        Delete account
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground/55">
                        Permanently removes your OneRep logs, settings, local
                        offline queue, and Better Auth account.
                      </p>
                    </div>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Password, if required"
                      className="w-full rounded-xl border border-border/40 bg-muted/40 px-3 py-2.5 text-[13px] outline-none focus:border-foreground/30"
                    />
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
                      className="text-destructive-foreground w-full rounded-xl bg-destructive px-3 py-3 text-[13px] font-bold transition-opacity active:opacity-75 disabled:opacity-35"
                    >
                      {deleting ? "Deleting…" : "Permanently delete account"}
                    </button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
              </Accordion>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut || saving}
              className="mt-3 w-full rounded-[20px] border border-border/60 bg-card py-3.5 text-[15px] font-semibold tracking-tight text-muted-foreground transition-colors active:bg-muted/50 active:text-foreground disabled:opacity-50 short-phone:rounded-[18px]"
            >
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </>
        ) : (
          <div
            role="status"
            aria-label="Loading settings"
            className="flex min-h-[45svh] items-center justify-center"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
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
          className="h-10 rounded-xl bg-muted/60 px-2 text-[12px] font-semibold outline-none"
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
      className="mt-3 min-h-11 w-full rounded-[20px] bg-foreground px-4 text-[14px] font-semibold text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:rounded-[18px]"
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
          "flex h-10 w-10 items-center justify-center rounded-xl",
          "bg-muted/60 text-foreground/70 transition-all",
          "active:scale-95 active:bg-muted",
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
          "relative flex min-h-10 min-w-[62px] flex-col items-center justify-center rounded-xl px-2",
          "bg-muted/60 transition-colors",
          editing && "hidden"
        )}
      >
        <span className="text-[14px] leading-none font-semibold tabular-nums">
          {value}
        </span>
        {suffix && (
          <span className="mt-0.5 text-[9px] font-medium tracking-wider text-muted-foreground/45 uppercase">
            {suffix}
          </span>
        )}
      </button>

      {editing && (
        <div className="flex min-h-10 min-w-[62px] flex-col items-center justify-center rounded-xl bg-muted/80 px-2 ring-1 ring-foreground/20">
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
            <span className="mt-0.5 text-[9px] font-medium tracking-wider text-muted-foreground/45 uppercase">
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
          "flex h-10 w-10 items-center justify-center rounded-xl",
          "bg-muted/60 text-foreground/70 transition-all",
          "active:scale-95 active:bg-muted",
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
    <div className="flex gap-0.5 rounded-xl bg-muted/60 p-0.5">
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
