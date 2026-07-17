import { useRef, useState } from "react"
import { CaretRight, Check, PencilSimple } from "@phosphor-icons/react"
import { APP_ACCENT_COLORS, tint } from "@repo/ui"

export function SwipeToStart({
  onComplete,
  label = "Start workout",
  variant = "default",
  onHaptic,
}: {
  onComplete?: () => void
  label?: string
  variant?: "default" | "completed" | "danger"
  onHaptic?: (kind: "start" | "step" | "complete") => void
}) {
  const [x, setX] = useState(0)
  const [releasing, setReleasing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const originX = useRef(0)
  const lastHapticStep = useRef(0)

  function maxX() {
    return (trackRef.current?.offsetWidth ?? 260) - 46 - 10
  }

  function onPointerDown(e: React.PointerEvent) {
    if (completing) return
    dragging.current = true
    onHaptic?.("start")
    lastHapticStep.current = 0
    setReleasing(false)
    originX.current = e.clientX - x
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const nextX = Math.max(0, Math.min(e.clientX - originX.current, maxX()))
    const step = Math.min(3, Math.floor((nextX / Math.max(1, maxX())) * 4))
    if (step > lastHapticStep.current) {
      lastHapticStep.current = step
      onHaptic?.("step")
    }
    setX(nextX)
  }

  function onRelease() {
    if (!dragging.current) return
    dragging.current = false
    const threshold = maxX() * 0.85
    if (x >= threshold) {
      setCompleting(true)
      setReleasing(true)
      setX(maxX())
      onHaptic?.("complete")
      window.setTimeout(() => onComplete?.(), 420)
      return
    }
    setReleasing(true)
    setX(0)
  }

  const progress = x / Math.max(1, maxX())

  const isCompleted = variant === "completed"
  const isDanger = variant === "danger"

  const completeColor = isDanger
    ? "var(--destructive)"
    : APP_ACCENT_COLORS.complete
  const thumbColor = isCompleted
    ? `color-mix(in srgb, ${completeColor} ${Math.round(68 + progress * 32)}%, var(--foreground))`
    : `color-mix(in srgb, ${completeColor} ${Math.round(progress * 100)}%, var(--foreground))`

  const fillStrength =
    Math.round((isCompleted ? 12 + progress * 16 : progress * 28) * 100) / 100

  return (
    <div
      ref={trackRef}
      data-completing={completing ? "true" : undefined}
      className="swipe-to-start-track relative flex h-14 items-center overflow-hidden rounded-2xl px-[5px] select-none"
      style={{
        backgroundColor: isCompleted
          ? tint(completeColor, 10)
          : isDanger
            ? "color-mix(in srgb, var(--destructive) 9%, transparent)"
            : "color-mix(in srgb, var(--foreground) 7%, transparent)",
      }}
    >
      {/* Fill sweep */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: `linear-gradient(to right, color-mix(in srgb, ${completeColor} ${fillStrength}%, transparent) 0%, transparent 100%)`,
          transition: releasing
            ? "opacity var(--motion-slow) var(--motion-ease-out)"
            : "none",
          opacity: releasing ? 0 : 1,
        }}
      />

      {/* Label */}
      <span
        className="swipe-to-start-label pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[15px] font-semibold"
        style={{
          opacity: Math.max(0, 1 - progress * 3),
          transition: "opacity var(--motion-fast) var(--motion-ease-standard)",
          color: isCompleted
            ? `color-mix(in srgb, ${completeColor} 72%, var(--foreground))`
            : isDanger
              ? "color-mix(in srgb, var(--destructive) 74%, var(--foreground))"
              : "color-mix(in srgb, var(--foreground) 100%, transparent)",
        }}
      >
        {label}
      </span>

      {/* Thumb */}
      <div
        className="swipe-to-start-thumb relative z-10 flex h-[46px] w-[46px] cursor-grab touch-none items-center justify-center rounded-xl text-background shadow-sm active:cursor-grabbing"
        style={{
          transform: `translateX(${x}px)`,
          transition: releasing
            ? "transform var(--motion-slow) var(--motion-ease-emphasized), background-color var(--motion-medium) var(--motion-ease-out)"
            : "none",
          backgroundColor: thumbColor,
          boxShadow: `0 8px 18px rgba(0,0,0,${0.08 + progress * 0.08})`,
        }}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onHaptic?.("complete")
          onComplete?.()
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
      >
        {completing ? (
          <Check size={16} weight="bold" />
        ) : isCompleted ? (
          <PencilSimple size={14} weight="bold" />
        ) : (
          <CaretRight size={14} weight="bold" />
        )}
      </div>
    </div>
  )
}
