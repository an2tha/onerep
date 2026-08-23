/**
 * The dashboard's quick-add button: the same round black bubble the active
 * workout page carries, opened into a fan of destinations instead of a
 * coach menu.
 *
 * The choreography is borrowed wholesale from `WorkoutCoachMenu` — the
 * options spring out of the button itself, nearest first, and fold back
 * into it farthest first, so the menu reads as the button opening and
 * closing rather than as a panel arriving from somewhere else. All of the
 * animation lives in the shared `coach-fab-*` CSS; this component only
 * supplies the markup and the stagger indexes.
 *
 * Like the coach menu, this outlives its own dismissal by `exitMs` so the
 * way out gets to play; every path out goes through `dismiss`.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { ComponentType, CSSProperties } from "react"
import { Plus, X } from "@phosphor-icons/react"
import { hapticSelection, hapticTap } from "@/lib/haptics"
import type { QuickActionId } from "@/dashboard/quick-action-drawers"

export type QuickAddOption = {
  /** Which quick-action drawer the option opens. */
  action: QuickActionId
  label: string
  icon: ComponentType<{ size?: number; weight?: "bold"; className?: string }>
}

/** Longest exit animation plus its stagger — keeps 220ms true for two items
 * and lets bigger menus finish folding before they unmount. */
function exitMsFor(options: number): number {
  return Math.max(220, 200 + (options - 1) * 40)
}

export function QuickAddFab({
  options,
  onChoose,
}: {
  options: QuickAddOption[]
  onChoose: (action: QuickActionId) => void
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitMs = exitMsFor(options.length)

  const dismiss = useCallback(
    (then?: () => void) => {
      if (timer.current) return
      setClosing(true)
      timer.current = setTimeout(() => {
        timer.current = null
        then?.()
        setOpen(false)
        setClosing(false)
      }, exitMs)
    },
    [exitMs]
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, dismiss])

  useEffect(() => {
    if (open) panelRef.current?.querySelector("button")?.focus()
  }, [open])

  const state = closing ? "closing" : "open"

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close quick add" : "Quick add"}
        aria-expanded={open}
        aria-busy={closing}
        data-open={open ? "true" : "false"}
        onClick={() => {
          hapticSelection()
          if (open) dismiss()
          else setOpen(true)
        }}
        className="coach-fab-trigger motion-tactile fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--app-safe-bottom-lg)+4.75rem)] z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-[0_8px_22px_rgba(0,0,0,0.26)]"
      >
        {open ? <X size={17} weight="bold" /> : <Plus size={19} weight="bold" />}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close quick add"
            onClick={() => dismiss()}
            data-state={state}
            className="coach-fab-scrim fixed inset-0 z-40 cursor-default"
          />
          <div
            ref={panelRef}
            role="menu"
            aria-label="Quick add"
            data-state={state}
            className="coach-fab-menu fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--app-safe-bottom-lg)+8.5rem)] z-50 flex flex-col items-end gap-2"
          >
            {options.map((option, index) => (
              <button
                key={option.action + option.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  hapticTap()
                  dismiss(() => onChoose(option.action))
                }}
                // Out nearest-first, back in farthest-first: the stack unrolls
                // away from the button and folds back toward it.
                style={
                  {
                    "--fab-index": options.length - 1 - index,
                    "--fab-index-out": index,
                  } as CSSProperties
                }
                className="coach-fab-item motion-tactile flex items-center gap-2 disabled:opacity-45"
              >
                <span className="coach-fab-label rounded-full border border-border bg-card px-3 py-1.5 text-[13px] leading-none font-medium whitespace-nowrap shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
                  {option.label}
                </span>
                <span className="coach-fab-icon flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
                  <option.icon
                    size={16}
                    weight="bold"
                    className="text-foreground"
                    aria-hidden="true"
                  />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
