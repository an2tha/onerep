import { ArrowDown, ArrowUp, ArrowsDownUp } from "@phosphor-icons/react"
import * as React from "react"

import { cn } from "../lib/utils"

export function moveArrayItemByStep<T>(
  items: readonly T[],
  from: number,
  direction: -1 | 1
): T[] {
  const to = from + direction
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return [...items]
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function useFlipReorderAnimation(
  keys: string[],
  elements: React.RefObject<Map<string, HTMLElement>>
) {
  const previousRects = React.useRef<Map<string, DOMRect>>(new Map())
  const keysRef = React.useRef(keys)

  const capturePositions = React.useCallback(() => {
    previousRects.current = new Map(
      keysRef.current.flatMap((key) => {
        const element = elements.current.get(key)
        return element ? [[key, element.getBoundingClientRect()] as const] : []
      })
    )
  }, [elements])

  React.useLayoutEffect(() => {
    if (
      previousRects.current.size === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      previousRects.current.clear()
      keysRef.current = keys
      return
    }

    for (const key of keysRef.current) {
      const element = elements.current.get(key)
      const previous = previousRects.current.get(key)
      if (!element || !previous) continue
      const next = element.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue
      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: 220,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      )
    }
    previousRects.current.clear()
    keysRef.current = keys
  }, [elements, keys])

  return capturePositions
}

export function ExerciseReorderToolbar({
  active,
  count,
  onToggle,
  className,
}: {
  active: boolean
  count: number
  onToggle: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 border-y border-border py-2",
        className
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">
          Exercise order
        </p>
        <p className="text-[13px] text-muted-foreground">
          {active
            ? "Use the arrow buttons or drag handles."
            : `${count} exercise${count === 1 ? "" : "s"}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        className={cn(
          "app-button min-h-10 shrink-0 px-3 text-[13px]",
          active ? "app-button-primary" : "app-button-secondary"
        )}
      >
        <ArrowsDownUp size={16} weight="bold" />
        {active ? "Done" : "Reorder"}
      </button>
    </div>
  )
}

export function ExerciseMoveControls({
  label,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  className,
}: {
  label: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center overflow-hidden rounded-md border border-border bg-background",
        className
      )}
      role="group"
      aria-label={`Reorder ${label}`}
    >
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-25"
        aria-label={`Move ${label} up`}
      >
        <ArrowUp size={13} weight="bold" />
      </button>
      <div className="h-4 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-25"
        aria-label={`Move ${label} down`}
      >
        <ArrowDown size={13} weight="bold" />
      </button>
    </div>
  )
}

export function ExerciseDropIndicator({
  position,
}: {
  position: "before" | "after"
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-2 left-2 z-30 flex items-center",
        position === "before" ? "top-0" : "bottom-0"
      )}
      role="presentation"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-background bg-primary shadow-sm" />
      <span className="h-[3px] flex-1 rounded-full bg-primary shadow-[0_0_0_1px_color-mix(in_srgb,var(--background)_65%,transparent)]" />
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-background bg-primary shadow-sm" />
    </div>
  )
}
