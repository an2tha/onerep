import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Barbell,
  CheckCircle,
  Fire,
  Heart,
  Medal,
  Minus,
  Plus,
  Ruler,
  Sparkle,
  Target,
  UserFocus,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
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
import { cn } from "@/lib/utils"
import { api } from "../../../../convex/_generated/api"

const AGE_MIN = 13
const AGE_MAX = 100
const HEIGHT_MIN = 100
const HEIGHT_MAX = 250
const WEIGHT_KG_MIN = 35
const WEIGHT_KG_MAX = 250
const WATER_MIN = 1000
const WATER_MAX = 6000

const GOALS = [
  {
    id: "lose",
    label: "Lose weight",
    sub: "A controlled deficit with enough protein to keep training steady.",
    Icon: Fire,
    tone: "bg-orange-500/10 text-orange-500",
  },
  {
    id: "build",
    label: "Build muscle",
    sub: "More fuel for progressive training, recovery, and lean mass.",
    Icon: Barbell,
    tone: "bg-sky-500/10 text-sky-500",
  },
  {
    id: "health",
    label: "Stay healthy",
    sub: "Maintenance targets built around consistency and daily habits.",
    Icon: Heart,
    tone: "bg-rose-500/10 text-rose-500",
  },
  {
    id: "performance",
    label: "Peak performance",
    sub: "Higher output, better sessions, and more aggressive recovery.",
    Icon: Medal,
    tone: "bg-violet-500/10 text-violet-500",
  },
] satisfies {
  id: OnboardingGoal
  label: string
  sub: string
  Icon: typeof Fire
  tone: string
}[]

const ACTIVITIES = [
  {
    id: "sedentary",
    label: "Sedentary",
    sub: "Mostly seated, little planned movement.",
  },
  {
    id: "lightly_active",
    label: "Lightly active",
    sub: "Walks or light training a few days per week.",
  },
  {
    id: "moderately_active",
    label: "Moderately active",
    sub: "Training or active work most weeks.",
  },
  {
    id: "very_active",
    label: "Very active",
    sub: "Hard training or active work most days.",
  },
  {
    id: "extra_active",
    label: "Extra active",
    sub: "Demanding training plus a physical schedule.",
  },
] satisfies {
  id: ActivityLevel
  label: string
  sub: string
}[]

const STEPS = [
  {
    label: "Goal",
    title: "Choose your target",
    body: "This sets the calorie direction before OneRep calculates the numbers.",
    Icon: Target,
  },
  {
    label: "Body",
    title: "Add body basics",
    body: "Sex, age, height, and weight keep BMR and macros grounded in reality.",
    Icon: UserFocus,
  },
  {
    label: "Activity",
    title: "Set your baseline activity",
    body: "Training and movement change TDEE. Pick the closest normal week.",
    Icon: Barbell,
  },
  {
    label: "Defaults",
    title: "Choose units and water",
    body: "These defaults shape daily logging without making you dig through settings.",
    Icon: Ruler,
  },
  {
    label: "Review",
    title: "Review your starting targets",
    body: "These are estimates you can change any time from food goals or settings.",
    Icon: Sparkle,
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function kgToLbs(kg: number) {
  return Math.round(kg * 2.20462)
}

function lbsToKg(lbs: number) {
  return Math.round((lbs / 2.20462) * 10) / 10
}

function cmToFtIn(cm: number): string {
  const totalInches = cm / 2.54
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches % 12)
  return `${feet}' ${inches}"`
}

function formatHeight(cm: number, unit: "cm" | "ft") {
  return unit === "cm" ? `${cm} cm` : cmToFtIn(cm)
}

function formatWeight(weightKg: number, unit: WeightUnit) {
  return unit === "kg"
    ? `${Math.round(weightKg)} kg`
    : `${kgToLbs(weightKg)} lbs`
}

function formatLiters(ml: number) {
  return `${(ml / 1000).toFixed(1)} L`
}

function selectedGoalLabel(goal: OnboardingGoal | null) {
  return GOALS.find((item) => item.id === goal)?.label ?? "Not selected"
}

function selectedActivityLabel(activity: ActivityLevel) {
  return ACTIVITIES.find((item) => item.id === activity)?.label ?? "Moderate"
}

function healthGoalToOnboardingGoal(goal: CalorieGoal): OnboardingGoal {
  if (goal === "lose") return "lose"
  if (goal === "gain") return "build"
  return "health"
}

function isActivityLevel(value: unknown): value is ActivityLevel {
  return ACTIVITY_LEVELS.includes(value as ActivityLevel)
}

function StepProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" aria-label="Onboarding progress">
      {STEPS.map((item, index) => {
        const complete = index < step
        const active = index === step
        return (
          <div
            key={item.label}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold",
                complete
                  ? "border-foreground bg-foreground text-background"
                  : active
                    ? "border-foreground text-foreground"
                    : "border-border bg-muted/40 text-muted-foreground"
              )}
            >
              {complete ? <CheckCircle size={15} weight="fill" /> : index + 1}
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1",
                  index < step ? "bg-foreground" : "bg-border"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepHeader({ step }: { step: number }) {
  const meta = STEPS[step]
  const Icon = meta.Icon

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
          <Icon size={15} weight="bold" />
        </span>
        <span>{meta.label}</span>
      </div>
      <h1 className="text-[2rem] leading-tight font-semibold md:text-[2.35rem]">
        {meta.title}
      </h1>
      <p className="mt-3 max-w-md text-[14px] leading-6 text-muted-foreground">
        {meta.body}
      </p>
    </div>
  )
}

function NumberControl({
  label,
  value,
  displayValue,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  displayValue: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  function applyStep(delta: number) {
    onChange(clamp(value + delta, min, max))
  }

  return (
    <div className="rounded-[20px] border border-border/70 bg-card px-4 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:shadow-black/25">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-muted-foreground">
          {label}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {min}-{max}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => applyStep(-step)}
          disabled={value <= min}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors active:bg-muted disabled:opacity-30"
          aria-label={`Decrease ${label}`}
        >
          <Minus size={16} weight="bold" />
        </button>

        <div className="min-w-0 text-center">
          <p className="text-[2.6rem] leading-none font-semibold tabular-nums md:text-[3rem]">
            {displayValue}
          </p>
        </div>

        <button
          type="button"
          onClick={() => applyStep(step)}
          disabled={value >= max}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors active:bg-muted disabled:opacity-30"
          aria-label={`Increase ${label}`}
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-6 h-2 w-full cursor-pointer accent-foreground"
        aria-label={label}
      />
    </div>
  )
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
        {label}
      </p>
      <div
        className="grid rounded-[16px] bg-muted/70 p-1"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "min-h-11 rounded-[12px] px-2 text-[13px] font-semibold transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm shadow-black/[0.05]"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GoalStep({
  draft,
  setGoal,
}: {
  draft: OnboardingDraft
  setGoal: (goal: OnboardingGoal) => void
}) {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      {GOALS.map(({ id, label, sub, Icon, tone }) => {
        const selected = draft.goal === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setGoal(id)}
            aria-pressed={selected}
            className={cn(
              "min-h-[112px] rounded-[20px] border p-4 text-left transition-colors active:bg-muted",
              selected
                ? "border-foreground bg-foreground text-background shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
                : "border-border/70 bg-card text-foreground hover:border-foreground/30"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]",
                  selected ? "bg-background/12 text-background" : tone
                )}
              >
                <Icon size={20} weight="duotone" />
              </span>
              {selected && (
                <CheckCircle size={18} weight="fill" className="shrink-0" />
              )}
            </div>
            <p className="mt-4 text-[15px] font-semibold">{label}</p>
            <p
              className={cn(
                "mt-1 text-[12.5px] leading-5",
                selected ? "text-background/70" : "text-muted-foreground"
              )}
            >
              {sub}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function BodyBasicsStep({
  profile,
  heightUnit,
  weightUnit,
  setSex,
  setAge,
  setHeightCm,
  setWeightKg,
  setHeightUnit,
}: {
  profile: HealthProfileDraft
  heightUnit: "cm" | "ft"
  weightUnit: WeightUnit
  setSex: (sex: Sex) => void
  setAge: (age: number) => void
  setHeightCm: (heightCm: number) => void
  setWeightKg: (weightKg: number) => void
  setHeightUnit: (unit: "cm" | "ft") => void
}) {
  const weightValue =
    weightUnit === "kg"
      ? Math.round(profile.weightKg)
      : kgToLbs(profile.weightKg)
  const weightMin = weightUnit === "kg" ? WEIGHT_KG_MIN : kgToLbs(WEIGHT_KG_MIN)
  const weightMax = weightUnit === "kg" ? WEIGHT_KG_MAX : kgToLbs(WEIGHT_KG_MAX)

  return (
    <div className="mt-8 space-y-4">
      <div>
        <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
          Sex for calorie calculation
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["female", "male"] as const).map((sex) => {
            const selected = profile.sex === sex
            return (
              <button
                key={sex}
                type="button"
                onClick={() => setSex(sex)}
                aria-pressed={selected}
                className={cn(
                  "min-h-12 rounded-[16px] border px-4 text-[14px] font-semibold capitalize transition-colors",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/70 bg-card text-foreground active:bg-muted"
                )}
              >
                {sex}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <NumberControl
          label="Age"
          value={profile.age}
          displayValue={String(profile.age)}
          min={AGE_MIN}
          max={AGE_MAX}
          onChange={setAge}
        />

        <NumberControl
          label="Height"
          value={profile.heightCm}
          displayValue={formatHeight(profile.heightCm, heightUnit)}
          min={HEIGHT_MIN}
          max={HEIGHT_MAX}
          onChange={setHeightCm}
        />
      </div>

      <SegmentedControl
        label="Height display"
        value={heightUnit}
        options={[
          { value: "cm", label: "Centimeters" },
          { value: "ft", label: "Feet / inches" },
        ]}
        onChange={setHeightUnit}
      />

      <NumberControl
        label="Weight"
        value={weightValue}
        displayValue={`${weightValue} ${weightUnit}`}
        min={weightMin}
        max={weightMax}
        onChange={(value) =>
          setWeightKg(weightUnit === "kg" ? value : lbsToKg(value))
        }
      />
    </div>
  )
}

function ActivityStep({
  value,
  onChange,
}: {
  value: ActivityLevel
  onChange: (value: ActivityLevel) => void
}) {
  return (
    <div className="mt-8 grid gap-3">
      {ACTIVITIES.map((activity) => {
        const selected = value === activity.id
        return (
          <button
            key={activity.id}
            type="button"
            onClick={() => onChange(activity.id)}
            aria-pressed={selected}
            className={cn(
              "min-h-[72px] rounded-[18px] border px-4 py-3 text-left transition-colors",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border/70 bg-card text-foreground active:bg-muted"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold">{activity.label}</p>
                <p
                  className={cn(
                    "mt-1 text-[12.5px] leading-5",
                    selected ? "text-background/70" : "text-muted-foreground"
                  )}
                >
                  {activity.sub}
                </p>
              </div>
              {selected && <CheckCircle size={18} weight="fill" />}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function DefaultsStep({
  weightUnit,
  waterGoalMl,
  setWeightUnit,
  setWaterGoalMl,
}: {
  weightUnit: WeightUnit
  waterGoalMl: number
  setWeightUnit: (unit: WeightUnit) => void
  setWaterGoalMl: (goalMl: number) => void
}) {
  return (
    <div className="mt-8 space-y-4">
      <SegmentedControl
        label="Weight unit"
        value={weightUnit}
        options={[
          { value: "kg", label: "Kilograms" },
          { value: "lbs", label: "Pounds" },
        ]}
        onChange={setWeightUnit}
      />

      <NumberControl
        label="Daily water goal"
        value={waterGoalMl}
        displayValue={formatLiters(waterGoalMl)}
        min={WATER_MIN}
        max={WATER_MAX}
        step={250}
        onChange={setWaterGoalMl}
      />

      <div className="rounded-[18px] border border-border/70 bg-muted/35 px-4 py-3">
        <p className="text-[13px] font-semibold">
          Defaults are editable later.
        </p>
        <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
          OneRep will save these as persistent preferences, not just setup
          notes.
        </p>
      </div>
    </div>
  )
}

function ReviewStep({
  draft,
  profile,
  weightUnit,
  waterGoalMl,
  preview,
}: {
  draft: OnboardingDraft
  profile: HealthProfileDraft
  weightUnit: WeightUnit
  waterGoalMl: number
  preview:
    | {
        bmr: number
        tdee: number
        targetCalories: number
        protein: number
        carbs: number
        fat: number
      }
    | undefined
}) {
  const items = [
    { label: "Calories", value: preview?.targetCalories ?? "..." },
    { label: "Protein", value: preview ? `${preview.protein} g` : "..." },
    { label: "Carbs", value: preview ? `${preview.carbs} g` : "..." },
    { label: "Fat", value: preview ? `${preview.fat} g` : "..." },
  ]

  return (
    <div className="mt-8 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-[18px] border border-border/70 bg-card px-4 py-4"
          >
            <p className="text-[12px] font-semibold text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-2 text-[1.7rem] leading-none font-semibold tabular-nums">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-[20px] border border-border/70 bg-card px-4 py-4">
        <p className="text-[13px] font-semibold">Calculation basis</p>
        <div className="mt-3 grid gap-2 text-[12.5px] text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>Goal</span>
            <span className="font-semibold text-foreground">
              {selectedGoalLabel(draft.goal)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Body</span>
            <span className="font-semibold text-foreground">
              {profile.age} yrs, {formatHeight(profile.heightCm, "cm")},{" "}
              {formatWeight(profile.weightKg, weightUnit)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Activity</span>
            <span className="font-semibold text-foreground">
              {selectedActivityLabel(profile.activityLevel)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>BMR / TDEE</span>
            <span className="font-semibold text-foreground">
              {preview ? `${preview.bmr} / ${preview.tdee}` : "Calculating"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Water</span>
            <span className="font-semibold text-foreground">
              {formatLiters(waterGoalMl)}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[12.5px] leading-5 text-muted-foreground">
        These are estimates, not medical advice. Custom food goals can override
        the effective daily targets while keeping this BMR/TDEE baseline.
      </p>
    </div>
  )
}

function SummaryRail({
  draft,
  profile,
  heightUnit,
  weightUnit,
  waterGoalMl,
}: {
  draft: OnboardingDraft
  profile: HealthProfileDraft
  heightUnit: "cm" | "ft"
  weightUnit: WeightUnit
  waterGoalMl: number
}) {
  const items = [
    { label: "Focus", value: selectedGoalLabel(draft.goal) },
    {
      label: "Body",
      value: `${profile.sex ?? "Sex"}, ${profile.age} yrs`,
    },
    { label: "Height", value: formatHeight(profile.heightCm, heightUnit) },
    { label: "Weight", value: formatWeight(profile.weightKg, weightUnit) },
    { label: "Activity", value: selectedActivityLabel(profile.activityLevel) },
    { label: "Water", value: formatLiters(waterGoalMl) },
  ]

  return (
    <aside className="hidden md:block">
      <div className="flex items-center gap-3">
        <img src="/app-icon.svg" alt="" className="h-11 w-11 rounded-full" />
        <div>
          <p className="text-[13px] font-semibold">OneRep</p>
          <p className="text-[12px] text-muted-foreground">Initial setup</p>
        </div>
      </div>

      <div className="mt-8 rounded-[24px] bg-foreground p-6 text-background shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:shadow-black/30">
        <Sparkle size={22} weight="duotone" />
        <p className="mt-4 text-[1.65rem] leading-tight font-semibold">
          Useful numbers need useful inputs.
        </p>
        <p className="mt-3 text-[13px] leading-6 text-background/65">
          This profile creates a real BMR/TDEE baseline before OneRep starts
          showing calorie and macro targets.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-[16px] border border-border/60 bg-card px-4 py-3"
          >
            <span className="text-[12px] text-muted-foreground">
              {item.label}
            </span>
            <span className="min-w-0 truncate text-right text-[13px] font-semibold capitalize">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}

export default function Onboarding() {
  const navigate = useSmoothNavigate()
  const saveOnboarding = useMutation(api.users.onboarding.save)
  const saveHealthProfile = useMutation(api.logs.calories.setProfile)
  const saveWeightUnit = useMutation(api.users.users.setWeightUnit)
  const saveWaterGoal = useMutation(api.users.users.setWaterGoal)
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
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm")
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg")
  const [waterGoalMl, setWaterGoalMl] = useState(2500)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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

    setDraft({
      age: nextAge,
      heightCm: nextHeight,
      goal: nextGoal,
    })
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
    setProfile((current) => ({
      ...current,
      goal: calorieGoal,
    }))
  }, [calorieGoal])

  const stepReady = useMemo(() => {
    if (step === 0) return draft.goal !== null
    if (step === 1) return profile.sex !== null
    if (step === 4) return draft.goal !== null && profile.sex !== null
    return true
  }, [draft.goal, profile.sex, step])

  async function goNext() {
    setSaveError(null)

    if (!stepReady) {
      setSaveError(
        step === 1
          ? "Select sex before calculating your targets."
          : "Complete this step before continuing."
      )
      return
    }

    if (step < STEPS.length - 1) {
      setStep((current) => Math.min(current + 1, STEPS.length - 1))
      return
    }

    if (!draft.goal || !profile.sex || saving) return

    setSaving(true)
    try {
      await Promise.all([
        saveOnboarding({
          age: profile.age,
          heightCm: profile.heightCm,
          goal: draft.goal,
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
      ])
      navigate("/", { replace: true })
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not save onboarding. Try again."
      )
      setSaving(false)
    }
  }

  function goBack() {
    setSaveError(null)
    setStep((current) => Math.max(current - 1, 0))
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto grid min-h-svh w-full max-w-6xl grid-cols-1 px-5 md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-12 md:px-8 md:py-8">
        <SummaryRail
          draft={draft}
          profile={profile}
          heightUnit={heightUnit}
          weightUnit={weightUnit}
          waterGoalMl={waterGoalMl}
        />

        <section className="mx-auto flex min-h-svh w-full max-w-xl flex-col md:min-h-0">
          <header className="pt-[var(--app-safe-top)] md:pt-0">
            <div className="mb-8 flex items-center justify-between md:hidden">
              <div className="flex items-center gap-2.5">
                <img
                  src="/app-icon.svg"
                  alt=""
                  className="h-8 w-8 rounded-full"
                />
                <span className="text-[13px] font-semibold">OneRep</span>
              </div>
              <span className="text-[12px] font-semibold text-muted-foreground">
                {step + 1} of {STEPS.length}
              </span>
            </div>

            <StepProgress step={step} />
          </header>

          <div className="flex flex-1 flex-col justify-center py-8 md:flex-none md:py-9">
            <StepHeader step={step} />

            {step === 0 && (
              <GoalStep
                draft={draft}
                setGoal={(goal) =>
                  setDraft((current) => ({ ...current, goal }))
                }
              />
            )}
            {step === 1 && (
              <BodyBasicsStep
                profile={profile}
                heightUnit={heightUnit}
                weightUnit={weightUnit}
                setSex={(sex) => setProfile((current) => ({ ...current, sex }))}
                setAge={(age) => setProfile((current) => ({ ...current, age }))}
                setHeightCm={(heightCm) =>
                  setProfile((current) => ({ ...current, heightCm }))
                }
                setWeightKg={(weightKg) =>
                  setProfile((current) => ({ ...current, weightKg }))
                }
                setHeightUnit={setHeightUnit}
              />
            )}
            {step === 2 && (
              <ActivityStep
                value={profile.activityLevel}
                onChange={(activityLevel) =>
                  setProfile((current) => ({ ...current, activityLevel }))
                }
              />
            )}
            {step === 3 && (
              <DefaultsStep
                weightUnit={weightUnit}
                waterGoalMl={waterGoalMl}
                setWeightUnit={setWeightUnit}
                setWaterGoalMl={setWaterGoalMl}
              />
            )}
            {step === 4 && (
              <ReviewStep
                draft={draft}
                profile={profile}
                weightUnit={weightUnit}
                waterGoalMl={waterGoalMl}
                preview={preview}
              />
            )}

            {saveError && (
              <p
                role="alert"
                className="mt-5 rounded-[16px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive"
              >
                {saveError}
              </p>
            )}
          </div>

          <footer className="grid gap-3 pb-[var(--app-safe-bottom)] sm:grid-cols-[auto_1fr] md:pb-0">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || saving}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-border px-5 text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted disabled:opacity-35"
            >
              <ArrowLeft size={16} weight="bold" />
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={saving || !stepReady}
              className="min-h-12 rounded-full bg-foreground px-6 text-[14px] font-semibold text-background shadow-[0_18px_45px_rgba(15,23,42,0.16)] transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : step === STEPS.length - 1
                  ? "Finish setup"
                  : "Continue"}
            </button>
          </footer>
        </section>
      </main>
    </div>
  )
}
