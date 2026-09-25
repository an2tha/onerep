import { tr } from "@repo/ui/i18n"
import { useId, useRef, useState } from "react"
import { hapticTap } from "@/lib/haptics"

const modes = ["snap", "repeat", "search"] as const
type Mode = (typeof modes)[number]
const labels = [tr("Snap"), tr("Repeat"), tr("Search")]

export function FoodModeDial({
  value,
  onChange,
}: {
  value: Mode
  onChange: (mode: Mode) => void
}) {
  return (
    <AnalogModeDial
      value={value}
      onChange={onChange}
      modes={modes}
      labels={labels}
      ariaLabel={tr("Food logging method")}
      hint
    />
  )
}

export function AnalogModeDial<T extends string>({
  value,
  onChange,
  modes,
  labels,
  ariaLabel,
  hint = false,
}: {
  value: T
  onChange: (mode: T) => void
  modes: readonly T[]
  labels: readonly string[]
  ariaLabel: string
  hint?: boolean
}) {
  const gradientId = useId()
  const index = modes.indexOf(value)
  const [dragAngle, setDragAngle] = useState<number | null>(null)
  const drag = useRef<{
    x: number
    angle: number
    index: number
    moved: boolean
  } | null>(null)
  const angle = dragAngle ?? -index * 32

  function select(next: number) {
    const bounded = Math.max(0, Math.min(modes.length - 1, next))
    if (bounded !== (drag.current?.index ?? index)) {
      hapticTap()
      onChange(modes[bounded]!)
      if (drag.current) drag.current.index = bounded
    }
  }

  return (
    <div className="food-mode-dial">
      <div className="food-mode-dial__pointer" aria-hidden="true" />
      <div
        className="food-mode-dial__control"
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={modes.length - 1}
        aria-valuenow={index}
        aria-valuetext={labels[index]}
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? index + 1
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? index - 1
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? modes.length - 1
                    : null
          if (next === null) return
          event.preventDefault()
          select(next)
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            x: event.clientX,
            angle: -index * 32,
            index,
            moved: false,
          }
          setDragAngle(-index * 32)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          if (Math.abs(event.clientX - drag.current.x) > 4)
            drag.current.moved = true
          const next = Math.max(
            -(modes.length - 1) * 32 - 5,
            Math.min(
              5,
              drag.current.angle + (event.clientX - drag.current.x) * 0.35
            )
          )
          setDragAngle(next)
          select(Math.round(-next / 32))
        }}
        onPointerUp={(event) => {
          if (drag.current && !drag.current.moved) {
            const bounds = event.currentTarget.getBoundingClientRect()
            const scale = Math.min(bounds.width / 360, bounds.height / 130)
            const x = (event.clientX - bounds.left - bounds.width / 2) / scale
            const y =
              (event.clientY - bounds.top - (bounds.height - 130 * scale) / 2) /
              scale
            const degrees = (Math.atan2(x, 265 - y) * 180) / Math.PI
            select(Math.round((degrees - angle) / 32))
          }
          drag.current = null
          setDragAngle(null)
        }}
        onPointerCancel={() => {
          drag.current = null
          setDragAngle(null)
        }}
        onLostPointerCapture={() => {
          drag.current = null
          setDragAngle(null)
        }}
      >
        <svg viewBox="0 0 360 130" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity=".13" />
              <stop offset="1" stopColor="currentColor" stopOpacity=".02" />
            </linearGradient>
          </defs>
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: "180px 265px",
              transition:
                dragAngle === null
                  ? "transform 420ms cubic-bezier(.2,.9,.2,1.12)"
                  : "none",
            }}
          >
            <circle
              cx="180"
              cy="265"
              r="240"
              fill={`url(#${gradientId})`}
              stroke="currentColor"
              strokeOpacity=".2"
            />
            {Array.from({ length: (modes.length + 1) * 16 + 1 }, (_, tick) => {
              const degrees = (tick - 16) * 2
              const major = tick % 16 === 0
              return (
                <path
                  key={tick}
                  d={`M180 30v${major ? 16 : tick % 4 === 0 ? 10 : 5}`}
                  transform={`rotate(${degrees} 180 265)`}
                  stroke="currentColor"
                  strokeOpacity={major ? 0.85 : 0.28}
                  strokeWidth={major ? 2 : 1}
                />
              )
            })}
            {labels.map((label, i) => (
              <text
                key={label}
                x="180"
                y="76"
                textAnchor="middle"
                transform={`rotate(${i * 32} 180 265)`}
                fill="currentColor"
                opacity={index === i ? 1 : 0.55}
                fontSize="17"
                fontWeight={index === i ? 650 : 450}
              >
                {label}
              </text>
            ))}
          </g>
        </svg>
      </div>
      {hint && (
        <p className="food-mode-dial__hint">
          {tr("Slide to turn · tap to select")}
        </p>
      )}
    </div>
  )
}
