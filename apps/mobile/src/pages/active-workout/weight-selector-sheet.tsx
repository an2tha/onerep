/**
 * The weight entry sheet for a set: bar type, plates per side, or a plain
 * total. Lives in its own module because NewPreset reuses it verbatim.
 */

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Minus, Plus, X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useBackdropDismiss } from "@repo/ui"
import {
  BAR_PROFILES,
  KG_TO_LBS,
  barImageForType,
  barLabelForType,
  defaultBarWeight,
  displayWeightToKg,
  formatKgString,
  formatWeightValue,
  normalizeBarType,
  parseKg,
  plateDisplayFromValues,
  platePerSideKg,
  toDisplay,
  toKg,
} from "@/lib/workout-logging"
import type { BarType, WeightUnit } from "@/lib/workout-logging"

export type WeightSelectorChange = {
  weight?: string
  barWeight?: string
  barType?: BarType
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
  const activeBarImage = barImageForType(selectedBarType)
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
    setPlateInput("")
    onChange({ barWeight: "", barType: selectedBarType })
  }

  function setCustomBarDisplay(value: string) {
    if (selectedBarType !== "custom") {
      setSelectedBarType("custom")
    }
    setBarDisplay(value, true, "custom")
  }

  function ensureBarForPlates() {
    if (barKg != null && barKg > 0) {
      return { kg: barKg, type: selectedBarType }
    }
    const nextType = selectedBarType === "custom" ? "olympic" : selectedBarType
    const nextBarKgString = defaultBarWeight(nextType, unit)
    const nextBarKg = parseKg(nextBarKgString)
    setSelectedBarType(nextType)
    setBarInput(toDisplay(nextBarKgString, unit))
    return { kg: nextBarKg ?? 0, type: nextType }
  }

  function setPlatePerSideDisplay(value: string) {
    setPlateInput(value)
    const nextPlateKg = parseKg(toKg(value, unit))
    const activeBar = ensureBarForPlates()
    if (nextPlateKg == null) return
    commitWeightKg(activeBar.kg + nextPlateKg * 2, activeBar.kg, activeBar.type)
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
    const activeBar = ensureBarForPlates()
    const plateKg = displayWeightToKg(displayPlate, unit)
    setPlateInput(String(displayPlate))
    commitWeightKg(activeBar.kg + plateKg * 2, activeBar.kg, activeBar.type)
  }

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[8px] md:items-center md:p-6",
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
          "flex max-h-[92dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.24)] md:max-h-[calc(100dvh-3rem)] md:max-w-3xl md:rounded-[28px] md:shadow-2xl",
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
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground/60 transition-colors active:bg-muted active:text-foreground"
          >
            <X size={13} weight="bold" />
          </button>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-5 pb-4 md:px-6 md:pb-5",
            hasBar &&
              "md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-start md:gap-3"
          )}
        >
          <div className="rounded-[26px] border border-border/45 bg-background p-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-muted-foreground">
                  Bar setup
                </p>
                <p className="mt-1 truncate text-[13px] font-semibold text-foreground/75">
                  {hasBar
                    ? `${activeBarLabel} · ${barDisplayValue} ${unit}`
                    : "No bar added"}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleBar}
                className={cn(
                  "h-10 shrink-0 rounded-[18px] px-4 text-[13px] font-semibold transition-all",
                  hasBar
                    ? "bg-foreground text-background"
                    : "bg-muted/55 text-muted-foreground/75 active:bg-muted active:text-foreground"
                )}
              >
                {hasBar ? "On" : "Add bar"}
              </button>
            </div>

            <div className="relative mt-3 overflow-hidden rounded-[24px] border border-border/35 bg-muted/25 px-3 py-4">
              <div className="absolute inset-x-5 top-1/2 h-px bg-border/45" />
              <img
                src={activeBarImage}
                alt=""
                className={cn(
                  "relative mx-auto w-full object-contain transition-all duration-200",
                  selectedBarType === "trap" ? "h-24" : "h-14",
                  !hasBar && "opacity-35 grayscale"
                )}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {BAR_PROFILES.map((profile) => {
                const selected = hasBar && selectedBarType === profile.type
                const presetWeight =
                  unit === "lbs" ? `${profile.lbs} lbs` : `${profile.kg} kg`
                return (
                  <button
                    key={profile.type}
                    type="button"
                    onClick={() => selectBarType(profile.type)}
                    className={cn(
                      "min-w-0 overflow-hidden rounded-[20px] border p-2 text-left transition-all",
                      selected
                        ? "border-foreground/20 bg-foreground text-background shadow-sm"
                        : "border-border/40 bg-card/65 active:border-primary/20 active:bg-card"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 items-center rounded-[14px] px-1.5",
                        selected ? "bg-background/10" : "bg-muted/30"
                      )}
                    >
                      <img
                        src={profile.image}
                        alt=""
                        className={cn(
                          "h-full w-full object-contain",
                          profile.type === "trap" && "scale-125"
                        )}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] font-semibold">
                        {profile.shortLabel}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[13px] font-semibold tabular-nums",
                          selected
                            ? "text-background/70"
                            : "text-muted-foreground"
                        )}
                      >
                        {presetWeight}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {hasBar && (
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <label className="relative min-w-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={barInput}
                    onChange={(event) =>
                      setCustomBarDisplay(event.target.value)
                    }
                    className="h-12 w-full [appearance:textfield] rounded-[20px] border border-border/50 bg-card px-3 pr-12 text-center text-[18px] font-semibold tabular-nums transition-all outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label={`Bar weight in ${unit}`}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground">
                    {unit}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setCustomBarDisplay(barInput || "0")}
                  className={cn(
                    "h-12 rounded-[20px] px-3 text-[13px] font-semibold transition-all",
                    selectedBarType === "custom"
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground/70 active:bg-muted active:text-foreground"
                  )}
                >
                  Custom
                </button>
              </div>
            )}
          </div>

          {hasBar && (
            <div className="mt-3 rounded-[24px] border border-border/50 bg-background px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-muted-foreground">
                    Plates per side
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-foreground/75">
                    Total {weightInput || "0"} {unit}
                  </p>
                </div>
                <span className="rounded-full bg-muted/45 px-2.5 py-1 text-[13px] font-semibold text-muted-foreground/65">
                  {activeBarLabel}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyPlateDelta(-(unit === "kg" ? 1.25 : 2.5))}
                  className="flex h-11 items-center justify-center rounded-[18px] bg-muted/55 text-muted-foreground/70 transition-all active:bg-muted"
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
                  className="flex h-11 items-center justify-center rounded-[18px] bg-muted/55 text-muted-foreground/70 transition-all active:bg-muted"
                  aria-label="Increase plates per side"
                >
                  <Plus size={15} weight="bold" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {plateDeltas.map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => applyPlateDelta(delta)}
                    className="h-9 rounded-[15px] bg-muted/40 text-[13px] font-semibold text-muted-foreground/75 tabular-nums transition-all active:bg-muted active:text-foreground"
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
                    className="h-9 rounded-[15px] bg-card/80 text-[13px] font-semibold text-muted-foreground/75 tabular-nums transition-all active:bg-card active:text-foreground"
                  >
                    {plate}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-[24px] border border-border/50 bg-background px-4 py-4 md:mt-0">
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
                className="flex h-12 items-center justify-center rounded-[20px] bg-muted/55 text-muted-foreground/70 transition-all active:bg-muted"
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
                className="flex h-12 items-center justify-center rounded-[20px] bg-muted/55 text-muted-foreground/70 transition-all active:bg-muted"
                aria-label="Increase weight"
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
            {!hasBar && (
              <button
                type="button"
                onClick={toggleBar}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[18px] bg-muted/55 text-[13px] font-semibold text-foreground/80 transition-all active:bg-muted"
              >
                <Plus size={14} weight="bold" />
                Add bar
              </button>
            )}
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {quickDeltas.map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => applyDelta(delta)}
                  className="h-10 rounded-[16px] bg-muted/40 text-[13px] font-semibold text-muted-foreground/75 tabular-nums transition-all active:bg-muted active:text-foreground"
                >
                  +{delta}
                </button>
              ))}
            </div>
          </div>

        </div>

        <div
          className="shrink-0 border-t border-border/40 bg-card px-5 pt-3 md:px-6"
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
