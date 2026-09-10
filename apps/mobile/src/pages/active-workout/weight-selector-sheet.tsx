/**
 * The weight entry sheet for a set: bar type, plates per side, or a plain
 * total. Lives in its own module because NewPreset reuses it verbatim.
 */

import { useEffect, useId, useRef, useState } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { CaretDown, Minus, Plus, X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { pushDismissHandler, useBackdropDismiss } from "@repo/ui"
import {
  BAR_PROFILES,
  KG_TO_LBS,
  barLabelForType,
  defaultBarWeight,
  displayWeightToKg,
  formatKgString,
  formatWeightValue,
  normalizeBarType,
  parseKg,
  toDisplay,
  toKg,
} from "@/lib/workout-logging"
import type { BarType, WeightUnit } from "@/lib/workout-logging"

export type WeightSelectorChange = {
  weight?: string
  barWeight?: string
  barType?: BarType
}

// Plate entry also works for equipment whose bar weight is not included.
function platePerSideKg(totalKg: number | null, barKg: number | null) {
  return totalKg == null
    ? null
    : Math.max(0, (totalKg - Math.max(0, barKg ?? 0)) / 2)
}

function plateDisplayFromValues(
  totalWeight: string,
  barWeight: string,
  unit: WeightUnit
) {
  const plates = platePerSideKg(parseKg(totalWeight), parseKg(barWeight))
  return plates == null ? "" : formatWeightValue(plates, unit)
}

function SlidingSection({
  summary,
  children,
  className,
}: {
  summary: ReactNode
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const contentId = useId()

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg text-left text-[13px]"
      >
        {summary}
        <CaretDown
          size={14}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        id={contentId}
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          open
            ? "grid-rows-[1fr] opacity-100 duration-240"
            : "grid-rows-[0fr] opacity-0 duration-180"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="p-0.5">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function WeightSelectorSheet({
  currentWeight,
  barWeight,
  barType,
  unit,
  lastSet,
  onChange,
  onClose,
}: {
  currentWeight: string
  barWeight: string
  barType: BarType
  unit: WeightUnit
  lastSet?: { weight: number; reps: number } | null
  onChange: (change: WeightSelectorChange) => void
  onClose: () => void
}) {
  const [isClosing, setIsClosing] = useState(false)
  const [weightInput, setWeightInput] = useState(() =>
    toDisplay(currentWeight, unit)
  )
  const [barInput, setBarInput] = useState(() => toDisplay(barWeight, unit))
  const [selectedBarType, setSelectedBarType] = useState<BarType>(() =>
    normalizeBarType(barType, barWeight)
  )
  const [plateInput, setPlateInput] = useState(() =>
    plateDisplayFromValues(currentWeight, barWeight, unit)
  )

  useEffect(() => {
    setWeightInput(toDisplay(currentWeight, unit))
    setBarInput(toDisplay(barWeight, unit))
    setPlateInput(plateDisplayFromValues(currentWeight, barWeight, unit))
  }, [barWeight, currentWeight, unit])

  useEffect(() => {
    setSelectedBarType(normalizeBarType(barType, barWeight))
  }, [barType, barWeight])

  const totalKg = parseKg(toKg(weightInput, unit))
  const barKg = parseKg(toKg(barInput, unit))
  const hasBar = !!barKg && barKg > 0
  const activeBarLabel = barLabelForType(selectedBarType)
  const currentPlateKg = platePerSideKg(totalKg, barKg)
  const lastWeightLabel =
    lastSet?.weight && lastSet.weight > 0
      ? `${toDisplay(String(lastSet.weight), unit)} ${unit}`
      : null
  const barDisplayValue =
    hasBar && barKg != null ? formatWeightValue(barKg, unit) : ""
  const plateDisplayValue =
    currentPlateKg != null ? formatWeightValue(currentPlateKg, unit) : ""
  const quickDeltas = unit === "kg" ? [1.25, 2.5, 5, 10] : [2.5, 5, 10, 25]
  const plateDeltas = unit === "kg" ? [1.25, 2.5, 5] : [2.5, 5, 10]
  const platePresets =
    unit === "kg" ? [1.25, 2.5, 5, 10, 15, 20, 25] : [2.5, 5, 10, 25, 35, 45]

  function dismiss() {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(onClose, 190)
  }

  const backdropDismiss = useBackdropDismiss(dismiss)

  // Android back closes this sheet before it leaves the workout.
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss
  useEffect(() => pushDismissHandler(() => dismissRef.current()), [])

  function emitChange(change: WeightSelectorChange) {
    onChange({
      barType: selectedBarType,
      barWeight: barKg != null && barKg > 0 ? formatKgString(barKg) : "",
      ...change,
    })
  }

  function updatePlateInput(nextTotalKg: number | null, nextBarKg = barKg) {
    const nextPlateKg = platePerSideKg(nextTotalKg, nextBarKg)
    setPlateInput(
      nextPlateKg == null ? "" : formatWeightValue(nextPlateKg, unit)
    )
  }

  function commitWeightKg(
    nextTotalKg: number,
    nextBarKg = barKg,
    nextBarType = selectedBarType
  ) {
    const nextWeightKg = formatKgString(nextTotalKg)
    setWeightInput(formatWeightValue(nextTotalKg, unit))
    updatePlateInput(nextTotalKg, nextBarKg)
    onChange({
      weight: nextWeightKg,
      barWeight:
        nextBarKg != null && nextBarKg > 0 ? formatKgString(nextBarKg) : "",
      barType: nextBarType,
    })
  }

  function setWeightDisplay(value: string) {
    setWeightInput(value)
    const nextWeightKg = toKg(value, unit)
    updatePlateInput(parseKg(nextWeightKg))
    emitChange({ weight: nextWeightKg })
  }

  function setBarDisplay(
    value: string,
    recalculateTotal = true,
    nextBarType = selectedBarType
  ) {
    const previousPlateKg =
      currentPlateKg ?? parseKg(toKg(plateInput, unit)) ?? 0
    const nextBarKgString = toKg(value, unit)
    const nextBarKg = parseKg(nextBarKgString)
    setBarInput(value)
    if (recalculateTotal && nextBarKg != null && nextBarKg > 0) {
      commitWeightKg(nextBarKg + previousPlateKg * 2, nextBarKg, nextBarType)
      return
    }
    if (nextBarKg == null || nextBarKg <= 0) {
      setPlateInput("")
    }
    onChange({
      barWeight: nextBarKgString,
      barType: nextBarType,
    })
  }

  function setWeightFromDisplayNumber(value: number) {
    const safeValue = Math.max(0, value)
    setWeightDisplay(
      String(Number.isInteger(safeValue) ? safeValue : +safeValue.toFixed(1))
    )
  }

  function applyDelta(delta: number) {
    const currentDisplay =
      totalKg != null ? (unit === "lbs" ? totalKg * KG_TO_LBS : totalKg) : 0
    setWeightFromDisplayNumber(currentDisplay + delta)
  }

  function selectBarType(type: BarType) {
    const previousPlateKg =
      currentPlateKg ?? parseKg(toKg(plateInput, unit)) ?? 0
    const nextBarKgString = defaultBarWeight(type, unit)
    const nextBarKg = parseKg(nextBarKgString)
    setSelectedBarType(type)
    setBarInput(toDisplay(nextBarKgString, unit))
    if (nextBarKg != null) {
      commitWeightKg(nextBarKg + previousPlateKg * 2, nextBarKg, type)
      return
    }
    onChange({ barWeight: nextBarKgString, barType: type })
  }

  function toggleBar() {
    if (!hasBar) {
      selectBarType(selectedBarType === "custom" ? "olympic" : selectedBarType)
      return
    }
    setBarInput("")
    updatePlateInput(totalKg, 0)
    onChange({ barWeight: "", barType: selectedBarType })
  }

  function setCustomBarDisplay(value: string) {
    if (selectedBarType !== "custom") {
      setSelectedBarType("custom")
    }
    setBarDisplay(value, true, "custom")
  }

  function setPlatePerSideDisplay(value: string) {
    setPlateInput(value)
    const nextPlateKg = parseKg(toKg(value, unit))
    if (nextPlateKg == null) return
    commitWeightKg(Math.max(0, barKg ?? 0) + nextPlateKg * 2)
  }

  function setPlateFromDisplayNumber(value: number) {
    const safeValue = Math.max(0, value)
    setPlatePerSideDisplay(
      String(Number.isInteger(safeValue) ? safeValue : +safeValue.toFixed(1))
    )
  }

  function applyPlateDelta(delta: number) {
    const currentDisplay =
      currentPlateKg != null
        ? unit === "lbs"
          ? currentPlateKg * KG_TO_LBS
          : currentPlateKg
        : 0
    setPlateFromDisplayNumber(currentDisplay + delta)
  }

  function selectPlatePerSide(displayPlate: number) {
    const plateKg = displayWeightToKg(displayPlate, unit)
    setPlateInput(String(displayPlate))
    commitWeightKg(Math.max(0, barKg ?? 0) + plateKg * 2)
  }

  return createPortal(
    <div
      className={cn(
        "mobile-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[8px] md:items-center md:p-6",
        isClosing
          ? "weight-selector-overlay-exit"
          : "weight-selector-overlay-enter"
      )}
      // Picking a bar changes what this sheet renders, so the button under the
      // finger can be gone before the tap completes and the click lands here
      // instead. See `useBackdropDismiss`.
      {...backdropDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Weight selector"
        className={cn(
          "mobile-modal-surface flex max-h-[92dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.24)] md:max-h-[calc(100dvh-3rem)] md:max-w-md md:rounded-[28px] md:shadow-2xl [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-foreground [&_summary]:focus-visible:outline-2 [&_summary]:focus-visible:outline-foreground",
          isClosing
            ? "weight-selector-panel-exit"
            : "weight-selector-panel-enter"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="flex shrink-0 items-center justify-between px-5 py-3 md:pt-5">
          <div>
            <p className="text-[15px] font-semibold tracking-tight">Weight</p>
            <p className="text-[13px] text-muted-foreground">
              {lastWeightLabel
                ? `Last set ${lastWeightLabel}`
                : hasBar
                  ? `${activeBarLabel} + plates`
                  : `Total load in ${unit}`}
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Close weight selector"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-colors active:bg-muted active:text-foreground"
          >
            <X size={13} weight="bold" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="pb-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-muted-foreground">
                  Total weight
                </p>
                <p className="mt-1 text-[13px] font-semibold text-foreground/75">
                  {hasBar
                    ? `${barDisplayValue} ${unit} bar + ${plateDisplayValue || "0"} ${unit}/side`
                    : `Direct entry in ${unit}`}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] items-center gap-2">
              <button
                type="button"
                onClick={() => applyDelta(-(unit === "kg" ? 2.5 : 5))}
                className="flex h-12 items-center justify-center rounded-[20px] bg-muted/55 text-muted-foreground transition-all active:bg-muted"
                aria-label="Decrease weight"
              >
                <Minus size={16} weight="bold" />
              </button>
              <label className="relative min-w-0">
                <input
                  type="number"
                  inputMode="decimal"
                  value={weightInput}
                  onChange={(event) => setWeightDisplay(event.target.value)}
                  placeholder="0"
                  className="h-[58px] w-full [appearance:textfield] rounded-[22px] border border-border/55 bg-card px-4 pr-14 text-center text-[28px] leading-none font-semibold tracking-tight tabular-nums transition-all outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label={`Total weight in ${unit}`}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground">
                  {unit}
                </span>
              </label>
              <button
                type="button"
                onClick={() => applyDelta(unit === "kg" ? 2.5 : 5)}
                className="flex h-12 items-center justify-center rounded-[20px] bg-muted/55 text-muted-foreground transition-all active:bg-muted"
                aria-label="Increase weight"
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {quickDeltas.map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => applyDelta(delta)}
                  className="h-11 rounded-xl bg-muted/40 text-[13px] font-semibold text-muted-foreground tabular-nums transition-all active:bg-muted active:text-foreground"
                >
                  +{delta}
                </button>
              ))}
            </div>
          </div>

          <SlidingSection
            className="border-t border-border/50 py-2"
            summary={
              <>
                <span className="font-semibold">Bar</span>
                <span className="ml-auto text-muted-foreground">
                  {hasBar
                    ? `${activeBarLabel} · ${barDisplayValue} ${unit}`
                    : "None"}
                </span>
              </>
            }
          >
            <div
              className="grid grid-cols-2 gap-2 pb-3 pt-1"
              role="group"
              aria-label="Bar type"
            >
              <button
                type="button"
                aria-pressed={!hasBar}
                onClick={() => {
                  if (hasBar) toggleBar()
                }}
                className={cn(
                  "min-h-11 rounded-xl px-3 text-left text-[13px] font-semibold transition-colors",
                  !hasBar
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-foreground hover:bg-muted"
                )}
              >
                No bar
              </button>
              {BAR_PROFILES.map((profile) => (
                <button
                  key={profile.type}
                  type="button"
                  aria-pressed={hasBar && selectedBarType === profile.type}
                  onClick={() => selectBarType(profile.type)}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-left text-[13px] font-semibold transition-colors",
                    hasBar && selectedBarType === profile.type
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-foreground hover:bg-muted"
                  )}
                >
                  <span>{profile.shortLabel}</span>
                  <span className="font-normal tabular-nums">
                    {unit === "lbs" ? profile.lbs : profile.kg} {unit}
                  </span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={hasBar && selectedBarType === "custom"}
                onClick={() =>
                  setCustomBarDisplay(
                    barInput ||
                      toDisplay(defaultBarWeight("olympic", unit), unit)
                  )
                }
                className={cn(
                  "min-h-11 rounded-xl px-3 text-left text-[13px] font-semibold transition-colors",
                  selectedBarType === "custom" && hasBar
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-foreground hover:bg-muted"
                )}
              >
                Custom
              </button>
            </div>
            {selectedBarType === "custom" && (
              <label className="mb-3 flex min-h-12 items-center gap-3 text-[13px] text-muted-foreground">
                Bar weight ({unit})
                <input
                  type="number"
                  inputMode="decimal"
                  value={barInput}
                  onChange={(event) => setCustomBarDisplay(event.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base font-semibold text-foreground tabular-nums"
                />
              </label>
            )}
          </SlidingSection>

          <SlidingSection
            className="border-t border-border/50 py-2"
            summary={
              <>
                <span className="font-semibold">Plates per side</span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {plateDisplayValue || "0"} {unit}
                </span>
              </>
            }
          >
            <div className="mt-3 grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2">
              <button
                type="button"
                onClick={() => applyPlateDelta(-(unit === "kg" ? 1.25 : 2.5))}
                className="flex h-11 items-center justify-center rounded-[18px] bg-muted/55 text-muted-foreground transition-all active:bg-muted"
                aria-label="Decrease plates per side"
              >
                <Minus size={15} weight="bold" />
              </button>
              <label className="relative min-w-0">
                <input
                  type="number"
                  inputMode="decimal"
                  value={plateInput}
                  onChange={(event) =>
                    setPlatePerSideDisplay(event.target.value)
                  }
                  placeholder="0"
                  className="h-12 w-full [appearance:textfield] rounded-[20px] border border-border/55 bg-card px-4 pr-14 text-center text-[22px] leading-none font-semibold tracking-tight tabular-nums transition-all outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label={`Plates per side in ${unit}`}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground">
                  {unit}
                </span>
              </label>
              <button
                type="button"
                onClick={() => applyPlateDelta(unit === "kg" ? 1.25 : 2.5)}
                className="flex h-11 items-center justify-center rounded-[18px] bg-muted/55 text-muted-foreground transition-all active:bg-muted"
                aria-label="Increase plates per side"
              >
                <Plus size={15} weight="bold" />
              </button>
            </div>
            <SlidingSection
              className="mt-3"
              summary={
                <span className="text-muted-foreground">Plate shortcuts</span>
              }
            >
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {plateDeltas.map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => applyPlateDelta(delta)}
                    className="h-11 rounded-xl bg-muted/40 text-[13px] font-semibold text-muted-foreground tabular-nums transition-all active:bg-muted active:text-foreground"
                  >
                    +{delta}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {platePresets.map((plate) => (
                  <button
                    key={plate}
                    type="button"
                    onClick={() => selectPlatePerSide(plate)}
                    className="h-11 rounded-xl bg-card/80 text-[13px] font-semibold text-muted-foreground tabular-nums transition-all active:bg-card active:text-foreground"
                  >
                    {plate}
                  </button>
                ))}
              </div>
            </SlidingSection>
          </SlidingSection>
        </div>

        <div
          className="shrink-0 border-t border-border/40 bg-card px-5 pt-3 "
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))",
          }}
        >
          <button
            type="button"
            onClick={dismiss}
            className="h-12 w-full rounded-[20px] bg-foreground text-[14px] font-semibold tracking-tight text-background transition-opacity active:opacity-85"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
