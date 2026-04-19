import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { X } from "@phosphor-icons/react"
import { MobileSheet } from "@/components/mobile-sheet"
import { useQuery, useMutation } from "@/lib/convex"
import { api } from "../../convex/_generated/api"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type WorkoutFocus = "strength" | "cardio" | "mobility"
type WeightUnit = "kg" | "lbs"

interface EffectiveGoals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export default function Settings() {
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
  const setProfile = useMutation(api.logs.calories.setProfile)

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
      await setCustomGoals({
        calories: hasCustomGoals ? calories : undefined,
        protein: hasCustomGoals ? protein : undefined,
        carbs: hasCustomGoals ? carbs : undefined,
        fat: hasCustomGoals ? fat : undefined,
      })
      navigate(-1)
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
      onClose={() => navigate(-1)}
      overlayClassName="bg-black/40 backdrop-blur-[4px]"
      panelClassName="mx-auto w-full max-w-sm rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.2)]"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
      showHandle={false}
    >
      <div className="px-4 pt-5 pb-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
          <button
            onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 active:opacity-60"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Profile Section */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
              Profile
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-[15px] font-medium">
                    {session?.name || "User"}
                  </p>
                  {session?.email && (
                    <p className="text-[12px] text-muted-foreground/60">
                      {session.email}
                    </p>
                  )}
                </div>
              </div>
              <div className="h-px bg-border/30" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left text-destructive"
              >
                <span className="text-[15px] font-medium">Sign out</span>
              </button>
            </div>
          </section>

          {/* Goals Section */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
              Goals
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14px]">Calories</span>
                <NumberInput
                  value={calories}
                  onChange={setCalories}
                  suffix="kcal"
                  min={800}
                  max={5000}
                  step={50}
                />
              </div>
              <div className="h-px bg-border/30" />
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14px]">Protein</span>
                <NumberInput
                  value={protein}
                  onChange={setProtein}
                  suffix="g"
                  min={20}
                  max={400}
                  step={5}
                />
              </div>
              <div className="h-px bg-border/30" />
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14px]">Carbs</span>
                <NumberInput
                  value={carbs}
                  onChange={setCarbs}
                  suffix="g"
                  min={10}
                  max={500}
                  step={10}
                />
              </div>
              <div className="h-px bg-border/30" />
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14px]">Fat</span>
                <NumberInput
                  value={fat}
                  onChange={setFat}
                  suffix="g"
                  min={10}
                  max={200}
                  step={5}
                />
              </div>
            </div>
            {effectiveGoals?.health && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground/40">
                Health-based: {effectiveGoals.health.calories} kcal •{" "}
                {effectiveGoals.health.protein}g protein
              </p>
            )}
          </section>

          {/* Water Goal Section */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
              Water
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14px]">Daily goal</span>
                <NumberInput
                  value={waterGoal}
                  onChange={setWaterGoalState}
                  suffix="ml"
                  min={500}
                  max={5000}
                  step={250}
                />
              </div>
            </div>
          </section>

          {/* Workout Section */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
              Workout
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14px]">Focus</span>
                <SegmentedControl
                  value={workoutFocus}
                  onChange={(v) => setWorkoutFocus(v as WorkoutFocus)}
                  options={[
                    { value: "strength", label: "Strength" },
                    { value: "cardio", label: "Cardio" },
                    { value: "mobility", label: "Mobility" },
                  ]}
                />
              </div>
              <div className="h-px bg-border/30" />
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[14px]">Weight unit</span>
                <SegmentedControl
                  value={weightUnit}
                  onChange={(v) => setWeightUnitState(v as WeightUnit)}
                  options={[
                    { value: "kg", label: "kg" },
                    { value: "lbs", label: "lbs" },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* Health Profile Section */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
              Health Profile
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              {onboarding ? (
                <button
                  onClick={handleResetOnboarding}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                >
                  <span className="text-[14px]">Recalculate from profile</span>
                  <CaretRight className="text-muted-foreground/30" size={16} />
                </button>
              ) : (
                <button
                  onClick={() => navigate("/onboarding")}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                >
                  <span className="text-[14px]">Set up health profile</span>
                  <CaretRight className="text-muted-foreground/30" size={16} />
                </button>
              )}
            </div>
          </section>

          {/* Dev Tools Section */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
              Data
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              <button
                onClick={handleResetOnboarding}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left text-destructive"
              >
                <span className="text-[14px]">Reset onboarding</span>
              </button>
            </div>
          </section>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "mt-6 w-full rounded-xl py-3.5 text-[15px] font-semibold",
            "bg-foreground text-background active:opacity-75",
            saving && "opacity-50"
          )}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </MobileSheet>
  )
}

function NumberInput({
  value,
  onChange,
  suffix,
  min,
  max,
  step,
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
  min: number
  max: number
  step: number
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  function commit() {
    const n = Math.max(min, Math.min(max, draft))
    onChange(n)
  }

  return (
    <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
      <button
        onClick={() => {
          const n = Math.max(min, draft - step)
          setDraft(n)
          onChange(n)
        }}
        disabled={draft <= min}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 disabled:opacity-30"
      >
        <span className="text-[15px]">−</span>
      </button>
      <div className="flex min-w-[60px] items-center justify-center gap-1">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(parseInt(e.target.value) || 0)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="w-12 bg-transparent text-center text-[13px] font-semibold tabular-nums focus:outline-none"
        />
        {suffix && (
          <span className="text-[10px] text-muted-foreground/40">{suffix}</span>
        )}
      </div>
      <button
        onClick={() => {
          const n = Math.min(max, draft + step)
          setDraft(n)
          onChange(n)
        }}
        disabled={draft >= max}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 disabled:opacity-30"
      >
        <span className="text-[15px]">+</span>
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
    <div className="flex rounded-lg bg-muted/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 text-[12px] font-medium transition-all",
            value === opt.value
              ? "rounded-md bg-card text-foreground shadow-sm"
              : "text-muted-foreground/50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function CaretRight({ className, size }: { className?: string; size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}