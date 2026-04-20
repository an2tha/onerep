import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { X, CaretRight, Minus, Plus } from "@phosphor-icons/react"
import { MobileSheet } from "@/components/mobile-sheet"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@repo/ui"

type WorkoutFocus = "strength" | "cardio" | "mobility"
type WeightUnit = "kg" | "lbs"

export default function Settings({
  onClose,
}: {
  onClose: () => void
}) {
  const navigate = useNavigate()
  const preferences = useQuery(api.users.users.getPreferences)
  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals)
  const session = useQuery(api.users.users.getCurrentUser)
  const onboarding = useQuery(api.users.onboarding.get)

  const setDashboardSettings = useMutation(api.users.users.setDashboardSettings)
  const setWeightUnit = useMutation(api.users.users.setWeightUnit)
  const setWaterGoal = useMutation(api.users.users.setWaterGoal)
  const setCustomGoals = useMutation(api.users.users.setCustomGoals)
  const clearOnboarding = useMutation(api.users.onboarding.clear)

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
  const [carbs, setCarbs] = useState(
    effectiveGoals?.effective.carbs ?? 200
  )
  const [fat, setFat] = useState(
    effectiveGoals?.effective.fat ?? 65
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (preferences?.dashboardSettings?.workoutFocus) {
      setWorkoutFocus(preferences.dashboardSettings.workoutFocus as WorkoutFocus)
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
    if (effectiveGoals?.effective) {
      setCalories(effectiveGoals.effective.calories)
      setProtein(effectiveGoals.effective.protein)
      setCarbs(effectiveGoals.effective.carbs)
      setFat(effectiveGoals.effective.fat)
    }
  }, [effectiveGoals])

  const hasCustomGoals = preferences?.customGoals != null

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await setDashboardSettings({ workoutFocus })
      await setWeightUnit({ unit: weightUnit })
      await setWaterGoal({ goalMl: waterGoal })

      const hasEdits = hasCustomGoals ||
        (effectiveGoals && (
          calories !== effectiveGoals.effective.calories ||
          protein !== effectiveGoals.effective.protein ||
          carbs !== effectiveGoals.effective.carbs ||
          fat !== effectiveGoals.effective.fat
        ))

      await setCustomGoals({
        calories: hasEdits ? calories : undefined,
        protein: hasEdits ? protein : undefined,
        carbs: hasEdits ? carbs : undefined,
        fat: hasEdits ? fat : undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await authClient.signOut()
    navigate("/login", { replace: true })
  }

  async function handleResetOnboarding() {
    await clearOnboarding({})
    navigate("/onboarding", { replace: true })
  }

  return (
    <MobileSheet
      onClose={() => onClose()}
      maxHeight="85vh"
      minHeight="50vh"
      snapPoints={[350, 450, 600]}
      defaultHeight={450}
      closeOnBackdrop={true}
    >
      <div className="px-4 pt-2 pb-12">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">Settings</h1>
          </div>
          <button
            onClick={() => onClose()}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/70 text-muted-foreground/60 transition-opacity active:opacity-50"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="space-y-2.5">
          <Accordion type="multiple" defaultValue={["goals", "water", "workout"]} className="space-y-2.5">
            {/* Profile Section */}
            <AccordionItem value="profile" className="border-none">
              <AccordionTrigger className="rounded-2xl border border-border/40 bg-card/80 px-4 py-3.5 hover:no-underline">
                <span className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground/50">Profile</span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pt-1">
                <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/80">
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
                  <div className="h-px bg-border/20 mx-4" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center justify-between px-4 py-4 text-left text-destructive transition-opacity active:opacity-60"
                  >
                    <span className="text-[14px] font-medium">Sign out</span>
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Goals Section */}
            <AccordionItem value="goals" className="border-none">
              <AccordionTrigger className="rounded-2xl border border-border/40 bg-card/80 px-4 py-3.5 hover:no-underline">
                <span className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground/50">Goals</span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pt-1">
                <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/80">
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
                    Health-based: {effectiveGoals.health.calories} kcal · {effectiveGoals.health.protein}g protein
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Water Goal Section */}
            <AccordionItem value="water" className="border-none">
              <AccordionTrigger className="rounded-2xl border border-border/40 bg-card/80 px-4 py-3.5 hover:no-underline">
                <span className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground/50">Water</span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pt-1">
                <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/80">
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
              </AccordionContent>
            </AccordionItem>

            {/* Workout Section */}
            <AccordionItem value="workout" className="border-none">
              <AccordionTrigger className="rounded-2xl border border-border/40 bg-card/80 px-4 py-3.5 hover:no-underline">
                <span className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground/50">Workout</span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pt-1">
                <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/80">
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
              </AccordionContent>
            </AccordionItem>

            {/* Health Profile Section */}
            <AccordionItem value="health" className="border-none">
              <AccordionTrigger className="rounded-2xl border border-border/40 bg-card/80 px-4 py-3.5 hover:no-underline">
                <span className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground/50">Health Profile</span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pt-1">
                <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/80">
                  {onboarding ? (
                    <button
                      onClick={handleResetOnboarding}
                      className="flex w-full items-center justify-between px-4 py-4 text-left transition-opacity active:opacity-60"
                    >
                      <span className="text-[14px]">Recalculate from profile</span>
                      <CaretRight className="text-muted-foreground/30" size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate("/onboarding")}
                      className="flex w-full items-center justify-between px-4 py-4 text-left transition-opacity active:opacity-60"
                    >
                      <span className="text-[14px]">Set up health profile</span>
                      <CaretRight className="text-muted-foreground/30" size={16} />
                    </button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Data Section */}
            <AccordionItem value="data" className="border-none">
              <AccordionTrigger className="rounded-2xl border border-border/40 bg-card/80 px-4 py-3.5 hover:no-underline">
                <span className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground/50">Data</span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pt-1">
                <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/80">
                  <button
                    onClick={handleResetOnboarding}
                    className="flex w-full items-center justify-between px-4 py-4 text-left text-destructive transition-opacity active:opacity-60"
                  >
                    <span className="text-[14px] font-medium">Reset onboarding</span>
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "mt-6 w-full rounded-2xl py-4 text-[15px] font-semibold tracking-tight",
            "bg-foreground text-background transition-opacity active:opacity-75",
            saving && "opacity-50"
          )}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </MobileSheet>
  )
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-[14px] text-foreground/80">{label}</span>
      {children}
    </div>
  )
}

function RowDivider() {
  return <div className="mx-4 h-px bg-border/20" />
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
    onChange(n)
  }

  function increment() {
    const n = Math.min(max, value + step)
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
          "flex h-8 w-8 items-center justify-center rounded-xl",
          "bg-muted/60 text-foreground/70 transition-all",
          "active:scale-95 active:bg-muted",
          "disabled:opacity-25 disabled:pointer-events-none"
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
        aria-label={label ? `Edit ${label}, current value ${value}` : `Edit value ${value}`}
        className={cn(
          "relative flex min-w-[62px] flex-col items-center justify-center rounded-xl px-2 py-1.5",
          "bg-muted/60 transition-colors",
          editing && "hidden"
        )}
      >
        <span className="text-[14px] font-semibold tabular-nums leading-none">{value}</span>
        {suffix && (
          <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/45">{suffix}</span>
        )}
      </button>

      {editing && (
        <div className="flex min-w-[62px] flex-col items-center justify-center rounded-xl bg-muted/80 px-2 py-1.5 ring-1 ring-foreground/20">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit() }}
            aria-label={label || "Value"}
            className="w-12 bg-transparent text-center text-[14px] font-semibold tabular-nums leading-none focus:outline-none"
            style={{ WebkitAppearance: "none", MozAppearance: "textfield" } as React.CSSProperties}
          />
          {suffix && (
            <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/45">{suffix}</span>
          )}
        </div>
      )}

      {/* Increment */}
      <button
        onClick={increment}
        disabled={value >= max}
        aria-label={label ? `Increase ${label}` : "Increase"}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-xl",
          "bg-muted/60 text-foreground/70 transition-all",
          "active:scale-95 active:bg-muted",
          "disabled:opacity-25 disabled:pointer-events-none"
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
    <div className="flex rounded-xl bg-muted/60 p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 rounded-[9px]",
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