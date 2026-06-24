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

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
}

function canUseViewTransitions() {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    !prefersReducedMotion()
  )
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
        setRouteMotion(options?.motion ?? (to < 0 ? "back" : "forward"))
        return navigate(to)
      }

      const { motion, ...routerOptions } = (options ??
        {}) as SmoothNavigateOptions
      const viewTransition =
        routerOptions.viewTransition ?? canUseViewTransitions()

      setRouteMotion(
        motion ?? (routerOptions.replace ? "replace" : "forward"),
        viewTransition
      )

      return navigate(to, {
        ...routerOptions,
        viewTransition,
      })
    },
    [navigate]
  )

  return smoothNavigate as SmoothNavigateFunction
}
