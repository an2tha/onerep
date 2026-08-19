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

export const ROUTE_TRANSITION_MS = 900

/**
 * The horizontal map the tab transition slides along. This has to match the
 * order the tabs are actually drawn in (see `TABS` in `components/bottom-bar`),
 * because the direction is derived from the difference between two indexes — a
 * list in a different order sends the page sliding away from the tab you just
 * pressed.
 */
export const PRIMARY_TAB_ORDER = [
  "/",
  "/nutrition",
  "/workouts",
  "/progress",
  "/health",
  "/coach",
]

/** Modal-style routes that animate up and hide the tab bar. */
export const TASK_ROUTE_PREFIXES = [
  "/workouts/new",
  "/workouts/edit/",
  "/workout/active",
  "/camera",
  "/foods/search",
  "/foods/review/",
  "/foods/recipe/new",
  "/foods/custom",
  "/nutrition/meal-prep",
  "/nutrition/report",
  "/nutrition/fasting",
  "/nutrition/groceries",
  "/shared",
]

export function isTaskRoute(pathname: string) {
  return TASK_ROUTE_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(route)
  )
}

export function shouldShowBottomBar(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/nutrition" ||
    pathname === "/recipes" ||
    pathname === "/workouts" ||
    pathname === "/progress" ||
    pathname === "/health" ||
    // The health detail pages are browsing destinations, not tasks — the
    // chrome stays so the desktop sidebar does not vanish mid-read.
    pathname.startsWith("/health/") ||
    pathname === "/supplements" ||
    pathname === "/coach" ||
    // A single exercise is a browsing destination, not a task. Keeping the
    // chrome means the desktop sidebar does not vanish just because someone
    // wanted to read how a curl works.
    pathname.startsWith("/exercises/") ||
    pathname === "/settings"
  )
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * Puts the page back at the top *before* the route changes.
 *
 * The outgoing screen is taken out of flow for the transition — the router
 * renders it as an absolutely positioned frame — so whatever the window was
 * scrolled to is not its scroll any more, and it re-enters at its own top. If
 * the reset happens after the navigation, you watch a page you had scrolled
 * halfway down snap to its first row and only then start animating away. Doing
 * it first costs nothing you can see and removes the jump entirely.
 */
function resetScrollBeforeNavigation() {
  if (typeof window === "undefined") return
  if (window.scrollY === 0 && window.scrollX === 0) return
  window.scrollTo({ top: 0, left: 0, behavior: "auto" })
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
          setRouteMotion(options?.motion ?? (to < 0 ? "back" : "forward"))
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

      if (!routerOptions.preventScrollReset) {
        resetScrollBeforeNavigation()
      }

      return navigate(to, {
        ...routerOptions,
        viewTransition: false,
      })
    },
    [navigate]
  )

  return smoothNavigate as SmoothNavigateFunction
}
