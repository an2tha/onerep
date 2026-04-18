import { useRef, useState } from "react"
import { CaretRight, PencilSimple } from "@phosphor-icons/react"

export function SwipeToStart({
  onComplete,
  label = "Start workout",
  variant = "default",
}: {
  onComplete?: () => void
  label?: string
  variant?: "default" | "completed"
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

  // completed variant uses green as the base thumb colour, default keeps foreground→green sweep
  const thumbColor = isCompleted
    ? `color-mix(in srgb, #22c55e ${Math.round(60 + progress * 40)}%, #16a34a)`
    : `color-mix(in srgb, #22c55e ${Math.round(progress * 100)}%, var(--foreground))`

  const fillOpacity = isCompleted ? 0.12 + progress * 0.16 : progress * 0.28
  const fillColor = isCompleted ? "34,197,94" : "34,197,94"

  return (
    <div
      ref={trackRef}
      className="relative flex h-12 items-center overflow-hidden rounded-2xl px-[4px] select-none"
      style={{
        backgroundColor: isCompleted
          ? "rgba(34,197,94,0.10)"
          : "rgba(var(--foreground-rgb,0,0,0),0.07)",
      }}
    >
      {/* Fill sweep */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: `linear-gradient(to right, rgba(${fillColor},${fillOpacity}) 0%, rgba(${fillColor},0) 100%)`,
          transition: releasing ? "opacity 400ms ease" : "none",
          opacity: releasing ? 0 : 1,
        }}
      />

      {/* Label */}
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[12px] font-semibold tracking-wide"
        style={{
          opacity: Math.max(0, 1 - progress * 3),
          color: isCompleted
            ? "rgba(34,197,94,0.70)"
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
            ? "transform 400ms cubic-bezier(0.34, 1.4, 0.64, 1)"
            : "none",
          backgroundColor: thumbColor,
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
