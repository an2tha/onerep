import { useEffect, useRef, useState } from "react"
import { Pause, Play } from "@phosphor-icons/react"
import { tr } from "@repo/ui/i18n"
import type { mountLoginGlass } from "../lib/login-glass-scene"

/** Load the decorative renderer independently so authentication never waits for it. */
export function LoginGlass() {
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<ReturnType<typeof mountLoginGlass> | undefined>(
    undefined
  )
  const [paused, setPaused] = useState(false)
  const [ready, setReady] = useState(false)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const element = host.current
    if (!element) return
    let cancelled = false
    const preference = matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => setReduced(preference.matches)
    updatePreference()
    preference.addEventListener("change", updatePreference)
    import("../lib/login-glass-scene")
      .then(({ mountLoginGlass }) => {
        if (cancelled) return
        controller.current = mountLoginGlass(element)
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) element.dataset.state = "unavailable"
      })
    return () => {
      cancelled = true
      preference.removeEventListener("change", updatePreference)
      controller.current?.dispose()
      controller.current = undefined
    }
  }, [])
  return (
    <>
      <div ref={host} className="login-glass" aria-hidden="true" />
      {ready && !reduced && (
        <button
          className="login-glass-control"
          type="button"
          aria-label={paused ? tr("Resume animation") : tr("Pause animation")}
          title={paused ? tr("Resume animation") : tr("Pause animation")}
          onClick={() => {
            const next = !paused
            setPaused(next)
            controller.current?.setPaused(next)
          }}
        >
          {paused ? (
            <Play size={16} weight="fill" aria-hidden="true" />
          ) : (
            <Pause size={16} weight="fill" aria-hidden="true" />
          )}
        </button>
      )}
    </>
  )
}
