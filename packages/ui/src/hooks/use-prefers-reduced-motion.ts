import * as React from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

export function prefersReducedMotion() {
  return window.matchMedia?.(QUERY).matches ?? false
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia?.(QUERY)
    if (!mql) return
    const onChange = () => setReduced(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return reduced
}
