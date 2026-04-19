import { useState, useRef, useEffect } from "react"
import { Barbell, Fire, Heart, Medal, Minus, Plus } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { convexClient } from "@/lib/convex"
import { cn } from "@/lib/utils"
import { api } from "../../../../convex/_generated/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_H = 58

type GoalId = "lose" | "build" | "health" | "performance"

const GOALS = [
  {
    id: "lose" as GoalId,
    label: "Lose weight",
    sub: "Burn fat & lean out",
    Icon: Fire,
  },
  {
    id: "build" as GoalId,
    label: "Build muscle",
    sub: "Get stronger",
    Icon: Barbell,
  },
  {
    id: "health" as GoalId,
    label: "Stay healthy",
    sub: "Feel your best",
    Icon: Heart,
  },
  {
    id: "performance" as GoalId,
    label: "Peak performance",
    sub: "Push your limits",
    Icon: Medal,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cmToFtIn(cm: number): string {
  const totalInches = cm / 2.54
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches % 12)
  return `${feet}′ ${inches}″`
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

// ─── DrumPicker ───────────────────────────────────────────────────────────────

function DrumPicker({
  items,
  value,
  onChange,
  suffix,
}: {
  items: { value: number; label: string }[]
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isProgrammatic = useRef(false)

  useEffect(() => {
    const idx = items.findIndex((i) => i.value === value)
    if (ref.current && idx >= 0) {
      isProgrammatic.current = true
      ref.current.scrollTop = idx * ITEM_H
      setTimeout(() => {
        isProgrammatic.current = false
      }, 100)
    }
  }, []) // scroll to value on mount only

  function onScroll() {
    if (isProgrammatic.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (!ref.current) return
      const idx = Math.round(ref.current.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(idx, items.length - 1))
      onChange(items[clamped].value)
    }, 80)
  }

  function step(dir: 1 | -1) {
    if (!ref.current) return
    const idx = Math.round(ref.current.scrollTop / ITEM_H)
    const next = Math.max(0, Math.min(idx + dir, items.length - 1))
    isProgrammatic.current = true
    ref.current.scrollTo({ top: next * ITEM_H, behavior: "smooth" })
    onChange(items[next].value)
    setTimeout(() => {
      isProgrammatic.current = false
    }, 300)
  }

  const sideBtn =
    "[@media(hover:hover)]:flex hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground active:scale-95"

  return (
    <div className="flex w-full items-center gap-2">
      {/* − button — desktop only */}
      <button
        onClick={() => step(-1)}
        className={sideBtn}
        aria-label="Decrease"
      >
        <Minus size={14} weight="bold" />
      </button>

      <div className="relative flex-1" style={{ height: ITEM_H * 3 }}>
        {/* Center selection band */}
        <div
          className="pointer-events-none absolute inset-x-6 rounded-2xl bg-foreground/[0.05]"
          style={{ top: ITEM_H, height: ITEM_H }}
        />

        {/* Scrollable drum */}
        <div
          ref={ref}
          onScroll={onScroll}
          className="h-full w-full overflow-y-scroll [&::-webkit-scrollbar]:hidden"
          style={
            {
              scrollSnapType: "y mandatory",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            } as React.CSSProperties
          }
        >
          {/* Top spacer — lets first item center */}
          <div style={{ height: ITEM_H, flexShrink: 0 }} />

          {items.map((item) => (
            <div
              key={item.value}
              className="flex items-center justify-center gap-1.5 select-none"
              style={{ height: ITEM_H, scrollSnapAlign: "center" }}
            >
              <span className="text-[2.1rem] font-semibold tracking-tight tabular-nums">
                {item.label}
              </span>
              {suffix && (
                <span className="mb-0.5 self-end pb-[0.35rem] text-base font-medium text-muted-foreground">
                  {suffix}
                </span>
              )}
            </div>
          ))}

          {/* Bottom spacer */}
          <div style={{ height: ITEM_H, flexShrink: 0 }} />
        </div>

        {/* Top fade */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10"
          style={{
            height: ITEM_H * 1.1,
            background:
              "linear-gradient(to bottom, var(--background) 30%, transparent 100%)",
          }}
        />
        {/* Bottom fade */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
          style={{
            height: ITEM_H * 1.1,
            background:
              "linear-gradient(to top, var(--background) 30%, transparent 100%)",
          }}
        />
      </div>

      {/* + button — desktop only */}
      <button onClick={() => step(1)} className={sideBtn} aria-label="Increase">
        <Plus size={14} weight="bold" />
      </button>
    </div>
  )
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function AgeStep({
  age,
  setAge,
}: {
  age: number
  setAge: (a: number) => void
}) {
  const items = range(13, 100).map((n) => ({ value: n, label: String(n) }))
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Step 1 of 3
        </p>
        <h1 className="mt-3 text-[1.75rem] leading-tight font-semibold tracking-tight">
          How old are you?
        </h1>
      </div>
      <DrumPicker items={items} value={age} onChange={setAge} suffix="yrs" />
    </div>
  )
}

function HeightStep({
  heightCm,
  setHeightCm,
  unit,
  setUnit,
}: {
  heightCm: number
  setHeightCm: (h: number) => void
  unit: "cm" | "ft"
  setUnit: (u: "cm" | "ft") => void
}) {
  const items = range(100, 250).map((n) => ({
    value: n,
    label: unit === "cm" ? String(n) : cmToFtIn(n),
  }))

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Step 2 of 3
        </p>
        <h1 className="mt-3 text-[1.75rem] leading-tight font-semibold tracking-tight">
          How tall are you?
        </h1>
      </div>

      <div className="flex flex-col items-center gap-5">
        <DrumPicker
          items={items}
          value={heightCm}
          onChange={setHeightCm}
          suffix={unit === "cm" ? "cm" : undefined}
        />

        {/* Unit toggle */}
        <div className="flex rounded-full border border-border p-0.5">
          {(["cm", "ft"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={cn(
                "rounded-full px-5 py-1.5 text-xs font-medium transition-all duration-200",
                unit === u
                  ? "bg-foreground text-background"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              {u === "ft" ? "ft / in" : "cm"}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function GoalsStep({
  goal,
  setGoal,
}: {
  goal: GoalId | null
  setGoal: (g: GoalId) => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Step 3 of 3
        </p>
        <h1 className="mt-3 text-[1.75rem] leading-tight font-semibold tracking-tight">
          What's your main goal?
        </h1>
      </div>

      <div className="flex flex-col gap-2.5">
        {GOALS.map(({ id, label, sub, Icon }) => {
          const selected = goal === id
          return (
            <button
              key={id}
              onClick={() => setGoal(id)}
              className={cn(
                "flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-200 active:scale-[0.98]",
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border"
              )}
            >
              <Icon
                size={20}
                weight="duotone"
                className={
                  selected ? "text-background/70" : "text-muted-foreground"
                }
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm leading-none font-medium">
                  {label}
                </span>
                <span
                  className={cn(
                    "text-xs leading-none",
                    selected ? "text-background/55" : "text-muted-foreground"
                  )}
                >
                  {sub}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(true)

  const profile = useQuery(api.users.onboarding.get, {})
  const [age, setAge] = useState(25)
  const [heightCm, setHeightCm] = useState(170)
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm")
  const [goal, setGoal] = useState<GoalId | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setAge(profile.age)
      setHeightCm(profile.heightCm)
      setGoal(profile.goal as GoalId)
    }
  }, [profile])


  function transition(fn: () => void) {
    setVisible(false)
    setTimeout(() => {
      fn()
      setVisible(true)
    }, 150)
  }

  function goNext() {
    if (step < 2) {
      transition(() => setStep((s) => s + 1))
    } else {
      if (!goal || saving) return
      setSaving(true)
      void convexClient.mutation(api.users.onboarding.save, { age, heightCm, goal: goal! })
        .catch(() => setSaving(false))
    }
  }

  function goBack() {
    if (step > 0) transition(() => setStep((s) => s - 1))
  }

  const canContinue = step === 2 ? goal !== null : true

  return (
    <div className="page-enter flex min-h-svh flex-col bg-background">
      {/* Progress segments */}
      <div className="flex gap-1.5 px-6 pt-14">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-[2px] flex-1 rounded-full transition-colors duration-500",
              i <= step ? "bg-foreground" : "bg-foreground/10"
            )}
          />
        ))}
      </div>

      {/* Step content */}
      <div
        className={cn(
          "flex-1 px-6 pt-10 transition-all duration-150 ease-out",
          visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        {step === 0 && <AgeStep age={age} setAge={setAge} />}
        {step === 1 && (
          <HeightStep
            heightCm={heightCm}
            setHeightCm={setHeightCm}
            unit={heightUnit}
            setUnit={setHeightUnit}
          />
        )}
        {step === 2 && <GoalsStep goal={goal} setGoal={setGoal} />}
      </div>

      {/* Actions */}
      <div
        className="flex flex-col gap-3 px-6 pt-6"
        style={{
          paddingBottom: "max(3rem, env(safe-area-inset-bottom, 3rem))",
        }}
      >
        <button
          onClick={goNext}
          disabled={!canContinue || saving}
          className={cn(
            "h-12 w-full rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98]",
            canContinue && !saving
              ? "bg-foreground text-background"
              : "cursor-not-allowed bg-foreground/10 text-foreground/25"
          )}
        >
          {step === 2 ? (saving ? "Saving..." : "Get Started") : "Continue"}
        </button>

        {step > 0 && (
          <button
            onClick={goBack}
            className="h-10 text-center text-sm text-muted-foreground transition-colors active:text-foreground"
          >
            Back
          </button>
        )}
      </div>
    </div>
  )
}
