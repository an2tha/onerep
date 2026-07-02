import { useCallback } from "react"
import { useNavigate, type NavigateOptions, type To } from "react-router"

export type RouteMotion = "forward" | "back" | "replace" | "switch"

type SmoothNavigateOptions = NavigateOptions & {
  motion?: RouteMotion
}

type SmoothDeltaNavigateOptions = {
  motion?: RouteMotion
}

type SmoothNavigateFunction = {
  (to: To, options?: SmoothNavigateOptions): void | Promise<void>
  (delta: number, options?: SmoothDeltaNavigateOptions): void | Promise<void>
}

const ROUTE_MOTIONS = new Set<RouteMotion>([
  "forward",
  "back",
  "replace",
  "switch",
])

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
}

function resetScrollAfterNavigation() {
  if (typeof window === "undefined") return

  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  })
}

export function setRouteMotion(motion: RouteMotion, native = false) {
  if (typeof document === "undefined") return

  document.documentElement.dataset.routeMotion = motion
  if (native) {
    document.documentElement.dataset.routeNative = "true"
  } else {
    delete document.documentElement.dataset.routeNative
  }
}

export function getRouteMotion(): RouteMotion | undefined {
  if (typeof document === "undefined") return undefined

  const motion = document.documentElement.dataset.routeMotion
  return ROUTE_MOTIONS.has(motion as RouteMotion)
    ? (motion as RouteMotion)
    : undefined
}

export function hasNativeRouteTransition() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.routeNative === "true"
  )
}

export function clearRouteMotion() {
  if (typeof document === "undefined") return

  delete document.documentElement.dataset.routeMotion
  delete document.documentElement.dataset.routeNative
}

export function useSmoothNavigate(): SmoothNavigateFunction {
  const navigate = useNavigate()

  const smoothNavigate = useCallback(
    (
      to: To | number,
      options?: SmoothNavigateOptions | SmoothDeltaNavigateOptions
    ) => {
      if (typeof to === "number") {
        if (!prefersReducedMotion()) {
          setRouteMotion(
            options?.motion ?? (to < 0 ? "back" : "forward")
          )
        } else {
          clearRouteMotion()
        }
        return navigate(to)
      }

      const routerOptions = { ...((options ?? {}) as SmoothNavigateOptions) }
      const routeMotion =
        routerOptions.motion ?? (routerOptions.replace ? "replace" : "forward")
      delete routerOptions.motion
      delete routerOptions.viewTransition

      if (!prefersReducedMotion()) {
        setRouteMotion(routeMotion)
      } else {
        clearRouteMotion()
      }

      const result = navigate(to, {
        ...routerOptions,
        viewTransition: false,
      })

      if (!routerOptions.preventScrollReset) {
        resetScrollAfterNavigation()
      }

      return result
    },
    [navigate]
  )

  return smoothNavigate as SmoothNavigateFunction
}
