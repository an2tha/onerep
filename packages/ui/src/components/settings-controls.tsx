import { CheckCircle, Circle, Minus, Plus } from "@phosphor-icons/react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "../lib/utils"

export function SettingsRow({
  label,
  detail,
  children,
}: {
  label: string
  detail?: string
  children: ReactNode
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

/**
 * One option in a radiogroup that is too tall to be a segmented control —
 * a title, an optional badge, and a line of explanation, with the whole card
 * as the hit target. Pair with a `role="radiogroup"` wrapper.
 */
export function SettingsChoiceRow({
  selected,
  title,
  detail,
  badge,
  disabled,
  onSelect,
}: {
  selected: boolean
  title: string
  detail: string
  badge?: string
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-[0.8rem] border p-4 text-left transition-colors disabled:opacity-50",
        selected
          ? "border-foreground bg-[var(--surface-raised)]"
          : "border-border hover:border-foreground/40"
      )}
    >
      <span className="mt-0.5 shrink-0 text-foreground">
        {selected ? (
          <CheckCircle size={20} weight="fill" />
        ) : (
          <Circle size={20} weight="regular" className="text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] leading-5 font-semibold text-foreground">
            {title}
          </span>
          {badge && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-[13px] leading-5 break-all text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  )
}

export function CompactSwitch({
  checked,
  onChange,
  onInteract,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange?: (checked: boolean) => void
  onInteract?: () => void
  label?: string
  /** For a toggle that depends on another setting being on first. */
  disabled?: boolean
}) {
  const track = (
    <span
      className={cn(
        "pointer-events-none relative block h-8 w-[3.25rem] rounded-full transition-colors",
        checked ? "bg-foreground" : "bg-muted",
        disabled && "opacity-40"
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
        aria-hidden
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
      disabled={disabled}
      className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-[0.65rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed"
      onClick={() => {
        onInteract?.()
        onChange(!checked)
      }}
    >
      {track}
    </button>
  )
}

export function SectionSaveButton({
  label,
  saving,
  onClick,
}: {
  label: string
  saving: boolean
  onClick: () => void
}) {
  // Settings saves previously reported only through a toast, which lands away
  // from the control you just used. The confirm keeps the answer in place.
  const [confirmed, setConfirmed] = useState(false)
  const wasSaving = useRef(saving)
  useEffect(() => {
    if (wasSaving.current && !saving) {
      setConfirmed(true)
      const timer = window.setTimeout(() => setConfirmed(false), 900)
      wasSaving.current = saving
      return () => window.clearTimeout(timer)
    }
    wasSaving.current = saving
  }, [saving])

  return (
    <div className="px-[var(--app-page-x)] pt-5">
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        aria-busy={saving}
        className={cn(
          "native-primary-button w-full disabled:opacity-50",
          confirmed && "motion-save-confirm"
        )}
      >
        {saving ? "Saving…" : confirmed ? "Saved" : label}
      </button>
    </div>
  )
}

export function NumberStepper({
  value,
  onChange,
  onInteract,
  suffix,
  min,
  max,
  step,
  label,
}: {
  value: number
  onChange: (value: number) => void
  onInteract?: () => void
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
  }, [editing, value])

  function change(next: number) {
    onInteract?.()
    onChange(Math.max(min, Math.min(max, next)))
  }

  function commit() {
    const normalized = draft.trim()
    if (/^[+-]?\d+$/.test(normalized)) change(Number(normalized))
    else setDraft(String(value))
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => change(value - step)}
        disabled={value <= min}
        aria-label={label ? `Decrease ${label}` : "Decrease"}
        className="flex size-11 items-center justify-center rounded-[0.65rem] bg-muted text-foreground transition-colors active:bg-[var(--surface-pressed)] disabled:pointer-events-none disabled:opacity-25"
      >
        <Minus size={13} weight="bold" />
      </button>
      {!editing ? (
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
          className="relative flex min-h-11 min-w-[68px] flex-col items-center justify-center rounded-[0.65rem] bg-muted px-2 transition-colors"
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
      ) : (
        <div className="flex min-h-11 min-w-[68px] flex-col items-center justify-center rounded-[0.65rem] bg-muted px-2 ring-1 ring-foreground/35">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit()
              if (event.key === "Escape") {
                setDraft(String(value))
                setEditing(false)
              }
            }}
            aria-label={label || "Value"}
            className="w-12 bg-transparent text-center text-[14px] leading-none font-semibold tabular-nums focus:outline-none"
          />
          {suffix && (
            <span className="mt-0.5 text-[13px] font-medium text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => change(value + step)}
        disabled={value >= max}
        aria-label={label ? `Increase ${label}` : "Increase"}
        className="flex size-11 items-center justify-center rounded-[0.65rem] bg-muted text-foreground transition-colors active:bg-[var(--surface-pressed)] disabled:pointer-events-none disabled:opacity-25"
      >
        <Plus size={13} weight="bold" />
      </button>
    </div>
  )
}

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  onInteract,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  onInteract?: () => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div
      className="app-segmented auto-cols-fr grid-flow-col"
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          data-active={value === option.value}
          onClick={() => {
            onInteract?.()
            onChange(option.value)
          }}
          className="app-segmented-button whitespace-nowrap"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
