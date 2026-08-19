/**
 * The coach bubble's menu: two ways to ask, so the bubble does not have to
 * guess which one someone meant — film a set, or just talk.
 *
 * The options are not a card any more. They spring out of the button itself,
 * nearest first, and fold back into it farthest first, so the menu reads as
 * the button opening and closing rather than as a panel arriving from
 * somewhere else. The choreography is CSS: this package's motion is all
 * keyframes and one reduced-motion block, and a spring library for two rows
 * would be a runtime dependency doing what a curve already does.
 *
 * The menu outlives its own dismissal by `EXIT_MS` so the way out gets to
 * play; every path out goes through `dismiss`.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { ChatCircleDots, VideoCamera } from "@phosphor-icons/react"

export type WorkoutCoachChoice = "form" | "chat"

/** Matches the exit animation in the shared CSS. */
const EXIT_MS = 220

export function WorkoutCoachMenu({
  formCoachLabel,
  onChoose,
  onClose,
}: {
  /** The exercise Form Coach would film, or null when it cannot help here. */
  formCoachLabel: string | null
  onChoose: (choice: WorkoutCoachChoice) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [closing, setClosing] = useState(false)

  const dismiss = useCallback(
    (then?: () => void) => {
      if (timer.current) return
      setClosing(true)
      timer.current = setTimeout(() => {
        then?.()
        onClose()
      }, EXIT_MS)
    },
    [onClose]
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dismiss])

  useEffect(() => {
    panelRef.current?.querySelector("button")?.focus()
  }, [])

  const options: Array<{
    id: WorkoutCoachChoice
    icon: typeof VideoCamera
    label: string
    disabled?: boolean
  }> = [
    {
      id: "form",
      icon: VideoCamera,
      label: formCoachLabel ? `Film ${formCoachLabel}` : "Form Coach",
      disabled: !formCoachLabel,
    },
    { id: "chat", icon: ChatCircleDots, label: "Ask Coach" },
  ]

  const state = closing ? "closing" : "open"

  return (
    <>
      <button
        type="button"
        aria-label="Close coach menu"
        onClick={() => dismiss()}
        data-state={state}
        className="coach-fab-scrim fixed inset-0 z-40 cursor-default"
      />
      <div
        ref={panelRef}
        role="menu"
        aria-label="Ask your coach"
        data-state={state}
        className="coach-fab-menu fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--app-safe-bottom-lg)+8.5rem)] z-50 flex flex-col items-end gap-2"
      >
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            disabled={option.disabled}
            onClick={() => dismiss(() => onChoose(option.id))}
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
  )
}
