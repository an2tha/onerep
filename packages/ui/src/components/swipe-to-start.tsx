import { useEffect, useRef, useState } from "react"
import { ArrowRight, Check, PencilSimple } from "@phosphor-icons/react"
import { APP_ACCENT_COLORS, tint } from "@repo/ui"

const THUMB_SIZE = 52
const TRACK_INSET = 5
const COMPLETE_THRESHOLD = 0.78

export function SwipeToStart({
  onComplete,
  label = "Start workout",
  readyLabel = "Release to start",
  completingLabel = "Starting",
  variant = "default",
  onHaptic,
}: {
  onComplete?: () => void
  label?: string
  /** Shown once the thumb is past the completion threshold. */
  readyLabel?: string
  /** Announced to screen readers while the completion animation plays. */
  completingLabel?: string
  variant?: "default" | "completed" | "danger"
  onHaptic?: (kind: "start" | "step" | "complete") => void
}) {
  const [position, setPosition] = useState(0)
  const [settling, setSettling] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [completing, setCompleting] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(0)
  const draggingRef = useRef(false)
  const originRef = useRef(0)
  const lastHapticStep = useRef(0)
  const completionTimer = useRef<number | null>(null)

  const isCompleted = variant === "completed"
  const isDanger = variant === "danger"
  const accent = isDanger ? "var(--destructive)" : APP_ACCENT_COLORS.complete

  function travel() {
    return Math.max(
      0,
      (trackRef.current?.getBoundingClientRect().width ?? 280) -
        THUMB_SIZE -
        TRACK_INSET * 2
    )
  }

  function updatePosition(next: number) {
    const clamped = Math.max(0, Math.min(next, travel()))
    positionRef.current = clamped
    setPosition(clamped)
  }

  function complete() {
    if (completing) return
    draggingRef.current = false
    setDragging(false)
    setCompleting(true)
    setSettling(true)
    updatePosition(travel())
    onHaptic?.("complete")
    completionTimer.current = window.setTimeout(() => onComplete?.(), 560)
  }

  function reset() {
    draggingRef.current = false
    setDragging(false)
    setSettling(true)
    updatePosition(0)
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (completing) return
    draggingRef.current = true
    setDragging(true)
    setSettling(false)
    lastHapticStep.current = 0
    originRef.current = event.clientX - positionRef.current
    event.currentTarget.setPointerCapture(event.pointerId)
    onHaptic?.("start")
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current || completing) return
    const next = event.clientX - originRef.current
    updatePosition(next)

    const progress = next / Math.max(1, travel())
    const step = Math.min(4, Math.max(0, Math.floor(progress * 5)))
    if (step > lastHapticStep.current) {
      lastHapticStep.current = step
      onHaptic?.("step")
    }
  }

  function onRelease() {
    if (!draggingRef.current || completing) return
    const progress = positionRef.current / Math.max(1, travel())
    if (progress >= COMPLETE_THRESHOLD) complete()
    else reset()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (completing) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      complete()
      return
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      setSettling(true)
      updatePosition(positionRef.current + travel() / 4)
      onHaptic?.("step")
      return
    }
    if (event.key === "ArrowLeft" || event.key === "Escape") {
      event.preventDefault()
      reset()
    }
  }

  useEffect(
    () => () => {
      if (completionTimer.current !== null) {
        window.clearTimeout(completionTimer.current)
      }
    },
    []
  )

  const progress = position / Math.max(1, travel())
  const ready = progress >= COMPLETE_THRESHOLD
  const thumbColor = isCompleted
    ? `color-mix(in srgb, ${accent} ${Math.round(72 + progress * 28)}%, var(--foreground))`
    : `color-mix(in srgb, ${accent} ${Math.round(progress * 100)}%, var(--foreground))`

  return (
    <div
      ref={trackRef}
      className="swipe-to-start-track relative flex h-[62px] items-center overflow-hidden rounded-[20px] p-[5px] select-none"
      data-dragging={dragging ? "true" : undefined}
      data-ready={ready ? "true" : undefined}
      data-completing={completing ? "true" : undefined}
      style={{
        backgroundColor: isCompleted
          ? tint(accent, 10)
          : isDanger
            ? "color-mix(in srgb, var(--destructive) 9%, transparent)"
            : "color-mix(in srgb, var(--foreground) 6%, transparent)",
      }}
    >
      <span
        className="swipe-to-start-fill pointer-events-none absolute inset-y-[5px] left-[5px] rounded-[15px]"
        style={{
          width: `${THUMB_SIZE + progress * travel()}px`,
          background: `color-mix(in srgb, ${accent} ${Math.round(10 + progress * 18)}%, transparent)`,
        }}
        aria-hidden="true"
      />

      <span
        className="swipe-to-start-label pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center text-[15px] font-semibold"
        style={{
          color: isDanger
            ? "color-mix(in srgb, var(--destructive) 78%, var(--foreground))"
            : "var(--foreground)",
          opacity: Math.max(0, 1 - progress * 1.75),
          transform: `translateX(${progress * 12}px)`,
        }}
      >
        {label}
      </span>

      <span
        className="swipe-to-start-ready-label pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center text-[14px] font-bold"
        style={{ opacity: ready && !completing ? 1 : 0 }}
        aria-hidden="true"
      >
        {readyLabel}
      </span>

      <span
        className="swipe-to-start-endpoint pointer-events-none absolute right-[17px] grid size-7 place-items-center rounded-full"
        style={{ opacity: Math.max(0.28, 1 - progress * 1.4) }}
        aria-hidden="true"
      >
        <ArrowRight size={13} weight="bold" />
      </span>

      <button
        type="button"
        className="swipe-to-start-thumb relative z-10 grid size-[52px] shrink-0 touch-none place-items-center rounded-[15px] text-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing"
        style={{
          transform: `translate3d(${position}px, 0, 0)`,
          transition: settling
            ? "transform 420ms cubic-bezier(0.22, 0.78, 0.22, 1), background-color 180ms ease-out"
            : "none",
          backgroundColor: thumbColor,
          boxShadow: `0 8px 22px rgb(0 0 0 / ${0.1 + progress * 0.08})`,
        }}
        role="slider"
        aria-label={`${label}. Slide right to confirm.`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={
          completing
            ? completingLabel
            : ready
              ? readyLabel
              : `${Math.round(progress * 100)} percent`
        }
        disabled={completing}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
      >
        {completing ? (
          <Check size={19} weight="bold" />
        ) : isCompleted ? (
          <PencilSimple size={17} weight="bold" />
        ) : (
          <ArrowRight size={18} weight="bold" />
        )}
      </button>
    </div>
  )
}
