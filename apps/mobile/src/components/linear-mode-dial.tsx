import { useEffect, useRef, useState } from "react"
import { hapticTap } from "@/lib/haptics"

/** A horizontal slice of a dial: the scale moves beneath a fixed index. */
export function LinearModeDial<T extends string>({ value, onChange, modes, labels, ariaLabel, curved = false, onShiftingChange, arcRadius = 1400, step = 96 }: {
  value: T
  onChange: (value: T) => void
  modes: readonly T[]
  labels: readonly string[]
  ariaLabel: string
  curved?: boolean
  arcRadius?: number
  step?: number
  onShiftingChange?: (shifting: boolean) => void
}) {
  const [preview, setPreview] = useState(value)
  const index = modes.indexOf(preview)
  const selected = useRef(index)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ onChange, modes, onShiftingChange })
  latest.current = { onChange, modes, onShiftingChange }
  function cancelSettle() {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current)
    settleTimer.current = null
  }
  useEffect(() => () => cancelSettle(), [])
  useEffect(() => {
    cancelSettle()
    setPreview(value)
    selected.current = modes.indexOf(value)
    // Synchronize externally committed values, not newly allocated options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const [offset, setOffset] = useState<number | null>(null)
  const drag = useRef<{ x: number; start: number; selected: number; moved: boolean } | null>(null)
  const control = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const node = control.current
    if (!node) return
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    setWidth(node.clientWidth)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  function select(next: number) {
    const bounded = Math.max(0, Math.min(modes.length - 1, next))
    if (bounded === selected.current) return
    onShiftingChange?.(true)
    selected.current = bounded
    if (drag.current) drag.current.selected = bounded
    hapticTap()
    setPreview(modes[bounded]!)
  }
  function settle() {
    cancelSettle()
    // Match the 320ms scale snap, then start the content transition.
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null
      latest.current.onChange(latest.current.modes[selected.current]!)
      latest.current.onShiftingChange?.(false)
    }, 340)
  }
  function release() {
    if (!drag.current) return
    drag.current = null
    setOffset(null)
    settle()
  }
  return (
    <div
      ref={control}
      className={`linear-mode-dial${curved ? " linear-mode-dial--curved" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={modes.length - 1}
      aria-valuenow={index}
      aria-valuetext={labels[index]}
      onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? modes.length - 1 : null
        if (next === null) return
        event.preventDefault()
        select(next)
        settle()
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return
        cancelSettle()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, start: -index * step, selected: index, moved: false }
        setOffset(-index * step)
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        const delta = event.clientX - drag.current.x
        if (Math.abs(delta) > 4) {
          drag.current.moved = true
          onShiftingChange?.(true)
        }
        const next = Math.max(-(modes.length - 1) * step - 12, Math.min(12, drag.current.start + delta))
        setOffset(next)
        select(Math.round(-next / step))
      }}
      onPointerUp={(event) => {
        if (drag.current && !drag.current.moved) {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = event.clientX - rect.left - rect.width / 2
          const y = event.clientY - rect.top
          const distance = curved ? Math.atan2(x, arcRadius + 8 - y) * arcRadius : x
          select(index + Math.round(distance / step))
        }
        release()
      }}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span className="linear-mode-dial__index" aria-hidden="true" />
      <div className="linear-mode-dial__window" aria-hidden="true">
        {curved ? (
          <svg className="linear-mode-dial__arc" viewBox={`${-width / 2} 0 ${width} 110`} preserveAspectRatio="xMidYMin meet">
            <g className="linear-mode-dial__rotor" style={{
              transformOrigin: `0px ${arcRadius + 8}px`,
              transform: `rotate(${(offset ?? -index * step) / arcRadius * 180 / Math.PI}deg)`,
              transition: offset === null ? undefined : "none",
            }}>
              <circle cx="0" cy={arcRadius + 8} r={arcRadius} fill="none" stroke="currentColor" strokeOpacity=".12" />
              {Array.from({ length: Math.ceil(((modes.length - 1) * step + width * 2) / 12) + 1 }, (_, tick) => {
                const distance = tick * 12 - width
                return <path key={tick} d={`M0 9v${tick % 4 === 0 ? 9 : 4}`} transform={`rotate(${distance / arcRadius * 180 / Math.PI} 0 ${arcRadius + 8})`} stroke="currentColor" strokeOpacity={tick % 4 === 0 ? .55 : .28} />
              })}
              {labels.map((label, i) => <g key={modes[i]} transform={`rotate(${i * step / arcRadius * 180 / Math.PI} 0 ${arcRadius + 8})`}>
                <path d="M0 9v12" stroke="currentColor" strokeOpacity=".7" />
                <text x="0" y="43" textAnchor="middle" fill="currentColor" opacity={i === index ? 1 : .6} fontWeight={i === index ? 650 : 450}>{label}</text>
              </g>)}
            </g>
          </svg>
        ) : (
        <div className="linear-mode-dial__track" style={{ transform: `translateX(${offset ?? -index * step}px)`, transition: offset === null ? undefined : "none" }}>
          {labels.map((label, i) => {
            const distance = i * step + (offset ?? -index * step)
            return (
            <span className="linear-mode-dial__stop" data-selected={i === index} key={modes[i]}
              style={curved ? {
                transform: `translateY(${distance * distance / (2 * arcRadius)}px) rotate(${Math.atan(distance / arcRadius) * 180 / Math.PI}deg)`,
                transition: offset === null ? undefined : "none",
              } : undefined}
            >
              <span className="linear-mode-dial__ticks">{Array.from({ length: 8 }, (_, n) => <i key={n} />)}</span>
              {label}
            </span>
          )})}
        </div>
        )}
      </div>
    </div>
  )
}
