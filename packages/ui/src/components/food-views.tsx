import { useEffect, useState } from "react"

import { MACRO_COLORS } from "../lib/design-tokens"
import { energyDisplay, useEnergyUnitLabel } from "../lib/energy-unit"

const MACROS = [
  {
    key: "protein",
    label: "Protein",
    color: MACRO_COLORS.protein,
    kcalPerG: 4,
  },
  { key: "carbs", label: "Carbs", color: MACRO_COLORS.carbs, kcalPerG: 4 },
  { key: "fat", label: "Fat", color: MACRO_COLORS.fat, kcalPerG: 9 },
] as const

function formatNutrient(value: number, maximumFractionDigits = 1) {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(safe) >= 100 ? 0 : maximumFractionDigits,
  }).format(safe)
}

export function FoodMacroStack({
  protein,
  carbs,
  fat,
}: {
  protein: number
  carbs: number
  fat: number
}) {
  const values = [protein, carbs, fat]
  const calories = values.map((value, index) => value * MACROS[index].kcalPerG)
  const total = calories.reduce((sum, value) => sum + value, 0) || 1
  return (
    <div className="grid grid-cols-3 gap-2">
      {MACROS.map((macro, index) => (
        <div key={macro.key} className="rounded-2xl bg-muted/45 px-3 py-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: macro.color }}
              aria-hidden
            />
            {macro.label}
          </span>
          <strong className="mt-2 block text-[18px] leading-none tabular-nums">
            {formatNutrient(values[index])} g
          </strong>
          <span className="mt-1 block text-[10px] text-muted-foreground tabular-nums">
            {Math.round((calories[index] / total) * 100)}% of energy
          </span>
        </div>
      ))}
    </div>
  )
}

export function FoodNutrientRow({
  label,
  value,
  unit,
  indent,
  bold,
}: {
  label: string
  value: number
  unit: string
  indent?: boolean
  bold?: boolean
}) {
  const tone = indent ? "text-muted-foreground/60" : ""
  return (
    <div
      className="flex items-baseline justify-between gap-3 py-[9px]"
      style={{ paddingLeft: indent ? 16 : 0 }}
    >
      <span
        className={`min-w-0 truncate text-[13px] leading-none ${bold ? "font-semibold" : tone}`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 text-[13px] leading-none tabular-nums ${bold ? "font-semibold" : tone}`}
      >
        {formatNutrient(value, Math.abs(value) < 10 ? 2 : 1)}
        <span className="ml-1 text-[13px] text-muted-foreground">{unit}</span>
      </span>
    </div>
  )
}

export function FoodProductHeader({
  name,
  brand,
  calories,
  portionLabel,
  presentation,
  imageUrl,
  expandedImageUrl,
}: {
  name: string
  brand?: string
  calories: number
  portionLabel: string
  presentation: "sheet" | "page"
  /** Omitted for catalogs that publish no photography, such as USDA. */
  imageUrl?: string
  /** A larger file for the expanded view; falls back to `imageUrl`. */
  expandedImageUrl?: string
}) {
  const energyUnit = useEnergyUnitLabel()
  // Set when the photo is open full-screen. Held here rather than raised to the
  // caller: nothing outside this header needs to know a picture is being looked
  // at, and every screen that shows a food would otherwise have to carry it.
  const [expanded, setExpanded] = useState(false)
  // A broken URL should leave no trace — no empty frame, no dead tap target.
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(imageUrl) && !failed

  return (
    <header
      className={
        presentation === "page"
          ? "px-4 pt-5 pb-4 md:px-8 md:pt-8"
          : "px-4 pb-4 md:px-8 md:pt-8"
      }
    >
      <div className={showImage ? "flex items-center gap-3.5" : undefined}>
        {showImage && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`View photo of ${name}`}
            className="group relative size-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted transition-transform active:scale-[0.97]"
          >
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              onError={() => setFailed(true)}
              className="size-full object-cover"
            />
            <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/8 ring-inset" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {presentation !== "page" && (
            <h2 className="text-[26px] leading-tight font-bold tracking-[-0.035em]">
              {name}
            </h2>
          )}
          <div className="mt-2 flex items-baseline gap-2 text-[13px] text-muted-foreground">
            {brand && <span className="truncate">{brand}</span>}
            {brand && <span aria-hidden>·</span>}
            <span>{portionLabel}</span>
            <span aria-hidden>·</span>
            <strong className="font-semibold text-foreground tabular-nums">
              {formatNutrient(energyDisplay(calories, energyUnit), 0)}{" "}
              {energyUnit}
            </strong>
          </div>
        </div>
      </div>

      {expanded && showImage && (
        <FoodImageLightbox
          name={name}
          src={expandedImageUrl ?? imageUrl!}
          fallbackSrc={imageUrl!}
          onClose={() => setExpanded(false)}
        />
      )}
    </header>
  )
}

/**
 * The photo, full screen, dismissed by tapping anywhere or pressing Escape.
 *
 * Deliberately chrome-free: a product shot is looked at for a second to check
 * it is the right packet, so a toolbar would be more furniture than the picture
 * is worth.
 */
function FoodImageLightbox({
  name,
  src,
  fallbackSrc,
  onClose,
}: {
  name: string
  src: string
  fallbackSrc: string
  onClose: () => void
}) {
  const [source, setSource] = useState(src)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    // The sheet underneath scrolls; freeze it while the photo is up.
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo of ${name}`}
      onClick={onClose}
      // Above the sheet it is opened from, which sits at z-[100].
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/88 p-6 backdrop-blur-sm"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top, 1.5rem))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <img
        src={source}
        alt={name}
        // The larger variant does not exist for every revision; drop back to
        // the one we know loads rather than showing a broken frame.
        onError={() => setSource(fallbackSrc)}
        className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
      />
      {/* Tapping anywhere closes, but that is not discoverable on its own. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-4 grid size-9 place-items-center rounded-full bg-white/12 text-white/90 backdrop-blur-md transition-colors active:bg-white/20"
        style={{ top: "max(1rem, env(safe-area-inset-top, 1rem))" }}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Credit for the catalogs a screen's food data actually came from.
 *
 * Takes the sources it is given rather than assuming one: the datasource serves
 * several, and a search can return results from more than one at once. Renders
 * nothing when the source is unknown, which is better than crediting the wrong
 * database.
 */
export function FoodAttribution({
  sources,
  className = "",
}: {
  sources: {
    id: string
    name: string
    url: string
    license?: { name: string; url: string }
  }[]
  className?: string
}) {
  if (sources.length === 0) return null

  return (
    <p className={`text-center text-[11px] text-muted-foreground ${className}`}>
      Food data from{" "}
      {sources.map((source, index) => (
        <span key={source.id}>
          {index > 0 && (index === sources.length - 1 ? " and " : ", ")}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {source.name}
          </a>
          {source.license && (
            <>
              {" "}
              <a
                href={source.license.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 opacity-70"
              >
                ({source.license.name})
              </a>
            </>
          )}
        </span>
      ))}
    </p>
  )
}
