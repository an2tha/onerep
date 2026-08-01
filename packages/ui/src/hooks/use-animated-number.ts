import * as React from "react"
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion"

type Options = {
  duration?: number
  /** Deltas smaller than this snap instead of animating. */
  minDelta?: number
  round?: (value: number) => number
  disabled?: boolean
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/**
 * Eases a displayed number toward `value`.
 *
 * Deliberately snaps on the first render — otherwise every number on every
 * screen counts up on load, which reads as decoration rather than feedback.
 * Also snaps under reduced motion, and re-targets mid-flight from whatever is
 * currently on screen instead of restarting from the previous target.
 */
export function useAnimatedNumber(value: number, options: Options = {}) {
  const {
    duration = 520,
    minDelta = 1,
    round = Math.round,
    disabled = false,
  } = options
  const reducedMotion = usePrefersReducedMotion()
  const snap = disabled || reducedMotion

  const [displayed, setDisplayed] = React.useState(value)
  // Mirrors `displayed`, but written only from inside the effect so the ref is
  // never touched during render. Lets a new target pick up mid-flight.
  const displayedRef = React.useRef(value)
  const mounted = React.useRef(false)

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      displayedRef.current = value
      return
    }

    const from = displayedRef.current
    const delta = value - from

    const settle = (next: number) => {
      displayedRef.current = next
      setDisplayed(next)
    }

    if (snap || Math.abs(delta) < minDelta || duration <= 0) {
      settle(value)
      return
    }

    let frame = 0
    const start = performance.now()

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      if (progress >= 1) {
        settle(value)
        return
      }
      settle(from + delta * easeOutCubic(progress))
      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, snap, minDelta, duration])

  return round(displayed)
}
