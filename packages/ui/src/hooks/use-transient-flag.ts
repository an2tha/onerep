import * as React from "react"

/**
 * Tracks "which row did I just act on" so a one-shot class can be applied to
 * it. Replaces the ad-hoc `useState<string | null>` + `setTimeout` pairs that
 * each list page was inventing for itself.
 */
export function useTransientFlag(durationMs = 460) {
  const [keys, setKeys] = React.useState<readonly string[]>([])
  const timers = React.useRef(new Map<string, number>())

  React.useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const flag = React.useCallback(
    (key: string) => {
      setKeys((current) =>
        current.includes(key) ? current : [...current, key]
      )
      window.clearTimeout(timers.current.get(key))
      timers.current.set(
        key,
        window.setTimeout(() => {
          timers.current.delete(key)
          setKeys((current) => current.filter((entry) => entry !== key))
        }, durationMs)
      )
    },
    [durationMs]
  )

  const flagged = React.useCallback((key: string) => keys.includes(key), [keys])

  return { flagged, flag }
}
