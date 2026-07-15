import { Check, Minus, Plus, type Icon } from "@phosphor-icons/react"

import { cn } from "../lib/utils"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function NumberQuestion({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
  onInteract,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  onInteract?: () => void
}) {
  const inputId = `onboarding-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

  function update(next: number) {
    onInteract?.()
    onChange(clamp(next, min, max))
  }

  return (
    <div className="onboarding-number-row">
      <label className="min-w-0 flex-1" htmlFor={inputId}>
        <span className="native-row-title block font-semibold">{label}</span>
        <span className="native-row-detail mt-0.5 block">
          {min.toLocaleString()}–{max.toLocaleString()}
        </span>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => update(value - step)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="onboarding-stepper-button"
        >
          <Minus size={16} weight="bold" />
        </button>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) update(next)
          }}
          aria-label={label}
          className="onboarding-number-input"
        />
        <button
          type="button"
          onClick={() => update(value + step)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="onboarding-stepper-button"
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>
      <span className="sr-only">Current value: {display}</span>
    </div>
  )
}

export function PillToggle<T extends string>({
  value,
  options,
  onChange,
  onInteract,
}: {
  value: T | null
  options: { value: T; label: string; icon?: Icon }[]
  onChange: (value: T) => void
  onInteract?: () => void
}) {
  return (
    <div className="onboarding-option-list">
      {options.map((option) => {
        const selected = value === option.value
        const OptionIcon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onInteract?.()
              onChange(option.value)
            }}
            data-selected={selected}
            className={cn(
              "onboarding-option flex min-h-14 w-full items-center gap-3 text-left text-[15px] font-semibold",
              selected
                ? "text-foreground"
                : "text-muted-foreground active:bg-muted/45"
            )}
          >
            {OptionIcon && <OptionIcon size={20} weight="regular" />}
            <span className="flex-1">{option.label}</span>
            {selected && <Check size={18} weight="bold" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

export function OptionList<T extends string>({
  value,
  options,
  onChange,
  onInteract,
}: {
  value: T | null
  options: readonly (readonly [T, string, string?, Icon?])[]
  onChange: (value: T) => void
  onInteract?: () => void
}) {
  return (
    <div className="onboarding-option-list">
      {options.map(([id, label, body, icon]) => {
        const selected = value === id
        const OptionIcon = icon
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              onInteract?.()
              onChange(id)
            }}
            aria-pressed={selected}
            data-selected={selected}
            className={cn(
              "onboarding-option min-h-16 w-full text-left",
              selected
                ? "text-foreground"
                : "text-muted-foreground active:bg-muted/45"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3 text-[15px] font-semibold">
                {OptionIcon && <OptionIcon size={20} weight="regular" />}
                {label}
              </span>
              {selected && <Check size={18} weight="bold" />}
            </div>
            {body && (
              <p
                className={cn(
                  "native-row-detail mt-1 pl-8",
                  selected ? "text-foreground/70" : "text-muted-foreground"
                )}
              >
                {body}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function MultiSelectList({
  values,
  options,
  onChange,
  icon: SharedIcon,
  onInteract,
}: {
  values: string[]
  options: readonly (readonly [string, string])[]
  onChange: (values: string[]) => void
  icon?: Icon
  onInteract?: () => void
}) {
  function toggle(id: string) {
    onInteract?.()
    if (id === "none") {
      onChange(values.includes("none") ? [] : ["none"])
      return
    }
    const withoutNone = values.filter((item) => item !== "none")
    onChange(
      withoutNone.includes(id)
        ? withoutNone.filter((item) => item !== id)
        : [...withoutNone, id]
    )
  }

  return (
    <div className="onboarding-multi-list">
      {options.map(([id, label]) => {
        const selected = values.includes(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            aria-pressed={selected}
            data-selected={selected}
            className={cn(
              "onboarding-multi-option min-h-13 w-full text-left text-[14px] font-semibold",
              selected
                ? "text-foreground"
                : "text-muted-foreground active:bg-muted/45"
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {SharedIcon && <SharedIcon size={15} weight="bold" />}
                {label}
              </span>
              {selected && <Check size={14} weight="bold" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
