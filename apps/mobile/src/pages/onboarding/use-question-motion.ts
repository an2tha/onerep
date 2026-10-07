import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
} from "react"

/** One departure, one arrival. The lock prevents rapid taps from skipping steps. */
export function useQuestionMotion(
  stage: number,
  commit: (stage: number) => void
) {
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle")
  const [direction, setDirection] = useState(1)
  const [destination, setDestination] = useState<number | null>(null)
  const [drag, setDrag] = useState(0)
  const [departureDrag, setDepartureDrag] = useState(0)
  const locked = useRef(false)
  const timer = useRef(0)
  const gesture = useRef<{
    id: number
    x: number
    y: number
    dx: number
    active: boolean
  } | null>(null)
  const suppressClickUntil = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (phase === "idle")
      document.getElementById("setup-heading")?.focus({ preventScroll: true })
  }, [phase])

  function goTo(next: number) {
    if (locked.current || next === stage) return false
    setDirection(next > stage ? 1 : -1)
    setDepartureDrag(drag)
    setDestination(next)
    setDrag(0)
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit(next)
      return true
    }
    locked.current = true
    setPhase("leaving")
    timer.current = window.setTimeout(() => {
      commit(next)
      setPhase("entering")
      timer.current = window.setTimeout(() => {
        locked.current = false
        setPhase("idle")
      }, 900)
    }, 480)
    return true
  }

  function swipeHandlers(
    back: () => void,
    forward: (() => void) | undefined,
    disabled: boolean
  ) {
    function reset() {
      gesture.current = null
      setDrag(0)
    }
    return {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (
          disabled ||
          locked.current ||
          event.button !== 0 ||
          !event.isPrimary
        )
          return
        if (
          (event.target as Element).closest(
            'input, textarea, select, a, button:not(.onboarding-chat-chip), [role="slider"]'
          )
        )
          return
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          dx: 0,
          active: false,
        }
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const start = gesture.current
        if (!start || start.id !== event.pointerId) return
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y
        if (!start.active && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          reset()
          return
        }
        if (
          !start.active &&
          Math.abs(dx) > 12 &&
          Math.abs(dx) > Math.abs(dy) * 1.4
        ) {
          start.active = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        if (!start.active) return
        start.dx = dx
        const resistance = dx < 0 && !forward ? 0.12 : 0.4
        setDrag(Math.max(-110, Math.min(110, dx * resistance)))
        suppressClickUntil.current = performance.now() + 400
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const start = gesture.current
        if (!start || start.id !== event.pointerId) return
        const threshold = Math.min(100, event.currentTarget.clientWidth * 0.22)
        if (start.active) {
          suppressClickUntil.current = performance.now() + 400
          if (start.dx > threshold) back()
          else if (start.dx < -threshold) forward?.()
        }
        reset()
      },
      onPointerCancel: reset,
      onLostPointerCapture: reset,
      onClickCapture(event: MouseEvent<HTMLDivElement>) {
        if (performance.now() < suppressClickUntil.current || locked.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      },
    }
  }

  return {
    phase,
    direction,
    panStage: phase === "leaving" ? (destination ?? stage) : stage,
    drag,
    departureDrag,
    goTo,
    swipeHandlers,
    locked,
  }
}
