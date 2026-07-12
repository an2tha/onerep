import { useRef, useState } from "react"
import { CaretRight, PencilSimple } from "@phosphor-icons/react"
import { APP_ACCENT_COLORS, tint } from "@/lib/design-tokens"

export function SwipeToStart({
  onComplete,
  label = "Start workout",
  variant = "default",
}: {
  onComplete?: () => void
  label?: string
  variant?: "default" | "completed" | "danger"
}) {
  const [x, setX] = useState(0)
  const [releasing, setReleasing] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const originX = useRef(0)

  function maxX() {
    return (trackRef.current?.offsetWidth ?? 260) - 44 - 6
  }

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true
    setReleasing(false)
    originX.current = e.clientX - x
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    setX(Math.max(0, Math.min(e.clientX - originX.current, maxX())))
  }

  function onRelease() {
    if (!dragging.current) return
    dragging.current = false
    const threshold = maxX() * 0.85
    if (x >= threshold) {
      onComplete?.()
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
      className="motion-card relative flex h-12 items-center overflow-hidden rounded-2xl px-[4px] select-none"
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
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[15px] font-semibold"
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
        className="relative z-10 flex h-[42px] w-[42px] cursor-grab touch-none items-center justify-center rounded-xl text-background shadow-sm active:cursor-grabbing"
        style={{
          transform: `translateX(${x}px)`,
          transition: releasing
            ? "transform var(--motion-slow) var(--motion-ease-emphasized), background-color var(--motion-medium) var(--motion-ease-out)"
            : "none",
          backgroundColor: thumbColor,
          boxShadow: `0 8px 18px rgba(0,0,0,${0.08 + progress * 0.08})`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
      >
        {isCompleted ? (
          <PencilSimple size={14} weight="bold" />
        ) : (
          <CaretRight size={14} weight="bold" />
        )}
      </div>
    </div>
  )
}
