import * as React from "react"

/**
 * Generalizes the burst-replay trick used for water logging: bump a counter,
 * use it as a React `key` so the animated element remounts and replays.
 *
 * `active` is the part the hand-rolled versions were missing — without it the
 * burst element stays mounted forever after the first replay.
 */
export function useReplayKey(activeMs = 900) {
  const [key, setKey] = React.useState(0)
  const [active, setActive] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    return () => window.clearTimeout(timer.current)
  }, [])

  const replay = React.useCallback(() => {
    setKey((value) => value + 1)
    setActive(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setActive(false), activeMs)
  }, [activeMs])

  return { key, active, replay }
}
