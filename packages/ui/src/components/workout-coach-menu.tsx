/**
 * The coach bubble's menu. Three ways to ask, so the bubble does not have to
 * guess which one someone meant: film a set, change the session, or just talk.
 */

import { useEffect, useRef } from "react"
import { ChatCircleDots, VideoCamera } from "@phosphor-icons/react"

export type WorkoutCoachChoice = "form" | "chat"

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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    panelRef.current?.querySelector("button")?.focus()
  }, [])

  const options: Array<{
    id: WorkoutCoachChoice
    icon: typeof VideoCamera
    label: string
    detail: string
    disabled?: boolean
  }> = [
    {
      id: "form",
      icon: VideoCamera,
      label: "Form Coach",
      detail: formCoachLabel
        ? `Film a set of ${formCoachLabel}`
        : "Not available for this exercise",
      disabled: !formCoachLabel,
    },
    {
      id: "chat",
      icon: ChatCircleDots,
      label: "Ask Coach",
      detail: "Talk it through, or change this session",
    },
  ]

  return (
    <>
      <button
        type="button"
        aria-label="Close coach menu"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
      />
      <div
        ref={panelRef}
        role="menu"
        aria-label="Ask your coach"
        className="motion-content-in fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--app-safe-bottom-lg)+9.5rem)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_44px_rgba(0,0,0,0.34)]"
      >
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            disabled={option.disabled}
            onClick={() => onChoose(option.id)}
            className={[
              "motion-tactile flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-muted disabled:opacity-45",
              index > 0 ? "border-t border-border/60" : "",
            ].join(" ")}
          >
            <option.icon
              size={19}
              weight="bold"
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">
                {option.label}
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                {option.detail}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
