import { useEffect, useRef, useState } from "react"
import { ArrowRight, Pause, Play } from "@phosphor-icons/react"
import { tr } from "@repo/ui/i18n"
import { hapticOnboardingCue } from "@/lib/haptics"
import { GalaxyScene } from "./galaxy-scene"
import "./galaxy-welcome.css"

export function GalaxyWelcome({
  onContinue,
  leaving = false,
}: {
  onContinue: () => void
  leaving?: boolean
}) {
  const greeting = tr("Hi,")
  const invitation = tr("let's customize your experience")
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches
  )
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(0.45)
  const [zoom, setZoom] = useState(1)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const typingFinished = useRef(false)
  const clampZoom = (value: number) => Math.max(0.75, Math.min(2.5, value))
  const [letters, setLetters] = useState(0)
  const still = reduced || paused
  const length = greeting.length + invitation.length
  const release = (pointerId: number) => {
    pointers.current.delete(pointerId)
    if (pointers.current.size === 0) setSpeed(0.45)
  }

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)")
    const change = () => setReduced(query.matches)
    query.addEventListener("change", change)
    return () => query.removeEventListener("change", change)
  }, [])

  useEffect(() => {
    if (still || typingFinished.current) return
    let timer = 0
    let position = 0
    const type = () => {
      if (document.hidden) return
      if (position === 0) hapticOnboardingCue("arrival")
      position++
      setLetters(position)
      if (position === length) typingFinished.current = true
      // Punctuate the greeting and each word without a continuous vibration.
      if (
        position > greeting.length &&
        (position === greeting.length + 1 ||
          invitation[position - greeting.length - 2] === " ")
      )
        hapticOnboardingCue("type")
      if (position < length)
        timer = window.setTimeout(
          type,
          position === greeting.length
            ? 520
            : position < greeting.length
              ? 140
              : 42
        )
    }
    const visibility = () => {
      clearTimeout(timer)
      if (!document.hidden && position < length)
        timer = window.setTimeout(type, 120)
    }
    timer = window.setTimeout(type, 650)
    document.addEventListener("visibilitychange", visibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [greeting, invitation, length, still])

  const shown = still || typingFinished.current ? length : letters
  return (
    <main
      className="galaxy-welcome"
      data-leaving={leaving}
      inert={leaving}
      data-stage="intro"
      data-typing={shown < length}
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return
        if (event.key === "=" || event.key === "+")
          setZoom((current) => clampZoom(current + 0.1))
        else if (event.key === "-")
          setZoom((current) => clampZoom(current - 0.1))
        else if (event.key === "Shift") setSpeed(3)
        else return
        event.preventDefault()
      }}
      onKeyUp={(event) => {
        if (event.key === "Shift") setSpeed(0.45)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSpeed(0.45)
      }}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button, input, label"))
          return
        pointers.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })
        event.currentTarget.setPointerCapture(event.pointerId)
        setSpeed(pointers.current.size === 1 ? 3 : 0.45)
      }}
      onPointerMove={(event) => {
        const previous = pointers.current.get(event.pointerId)
        if (!previous) return
        const other = [...pointers.current.entries()].find(
          ([id]) => id !== event.pointerId
        )?.[1]
        if (other) {
          const before = Math.hypot(previous.x - other.x, previous.y - other.y)
          const after = Math.hypot(
            event.clientX - other.x,
            event.clientY - other.y
          )
          if (before > 0)
            setZoom((current) => clampZoom((current * after) / before))
        } else {
          setLook((current) => ({
            x: Math.max(
              -1,
              Math.min(1, current.x - (event.clientX - previous.x) / 220)
            ),
            y: Math.max(
              -1,
              Math.min(1, current.y + (event.clientY - previous.y) / 220)
            ),
          }))
        }
        pointers.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId)}
      onLostPointerCapture={(event) => release(event.pointerId)}
      onWheel={(event) => {
        if ((event.target as HTMLElement).closest("input")) return
        setZoom((current) => clampZoom(current - event.deltaY * 0.001))
      }}
    >
      <GalaxyScene still={still} speed={speed} zoom={zoom} look={look} />
      <div className="galaxy-vignette" aria-hidden="true" />
      <header className="galaxy-header">
        <span className="galaxy-wordmark">{tr("OneRep")}</span>
        {!reduced && (
          <button
            type="button"
            className="galaxy-motion"
            aria-label={paused ? tr("Resume animation") : tr("Pause animation")}
            onClick={() => {
              typingFinished.current = true
              setPaused(!paused)
            }}
          >
            {paused ? (
              <Play size={17} weight="fill" aria-hidden="true" />
            ) : (
              <Pause size={17} aria-hidden="true" />
            )}
          </button>
        )}
      </header>
      <section className="galaxy-greeting" aria-labelledby="setup-heading">
        <h1
          id="setup-heading"
          tabIndex={-1}
          aria-label={`${greeting} ${invitation}`}
        >
          <span className="galaxy-hello" aria-hidden="true">
            {greeting.slice(0, shown)}
            <span className="galaxy-type-space">{greeting.slice(shown)}</span>
          </span>
          <span className="galaxy-invitation" aria-hidden="true">
            {invitation.slice(0, Math.max(0, shown - greeting.length))}
            <span className="galaxy-type-space">
              {invitation.slice(Math.max(0, shown - greeting.length))}
            </span>
          </span>
        </h1>
      </section>
      <footer className="galaxy-footer">
        <button
          type="button"
          className="galaxy-continue"
          onClick={() => {
            hapticOnboardingCue("continue")
            onContinue()
          }}
        >
          {tr("Continue")}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </footer>
    </main>
  )
}
