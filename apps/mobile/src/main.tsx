import {
  StrictMode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  createBrowserRouter,
  Link,
  Outlet,
  useLocation,
  useSearchParams,
} from "react-router"
import { RouterProvider } from "react-router/dom"
import posthog from "posthog-js"
import { PostHogProvider } from "@posthog/react"
import { toast } from "sonner"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { convexClient } from "@/lib/convex"
import { cn, safeLocalStorageGet } from "@/lib/utils"
import { providerAuthClient, signOutApp } from "@/lib/auth-client"
import { safeAuthRedirectPath } from "@/lib/auth-session"

import "./index.css"

declare global {
  interface Window {
    __onerepReactRoot?: Root
    __onerepSignOut?: () => void | Promise<void>
  }
}

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
  })
  if (safeLocalStorageGet("onerep:analytics-enabled") === "false") {
    posthog.opt_out_capturing()
  }
}
import { AuthGuard } from "./components/auth-guard.tsx"
import { ErrorBoundary } from "./components/error-boundary.tsx"
import { ThemeProvider, Toaster } from "@repo/ui"
import { hapticMedium, hapticSelection, hapticTap } from "./lib/haptics"
import { OfflineSyncIndicator } from "./components/offline-sync-indicator"
import { BottomBar, BottomBarActionProvider } from "./components/bottom-bar"
import {
  clearRouteMotion,
  getRouteMotion,
  useSmoothNavigate,
} from "./lib/navigation"
import {
  activateWaitingServiceWorker,
  registerAppServiceWorker,
  reloadWhenServiceWorkerControlsPage,
} from "./lib/service-worker"

const App = lazy(() => import("./App.tsx"))
const Exercises = lazy(() => import("./pages/Exercises.tsx"))
const EmailVerified = lazy(() => import("./pages/EmailVerified.tsx"))
const Login = lazy(() => import("./pages/Login.tsx"))
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"))
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"))
const VerifyEmailRequired = lazy(
  () => import("./pages/VerifyEmailRequired.tsx")
)
const Workouts = lazy(() => import("./pages/Workouts.tsx"))
const NewPreset = lazy(() => import("./pages/NewPreset.tsx"))
const ActiveWorkout = lazy(() => import("./pages/ActiveWorkout.tsx"))
const SnapAndLog = lazy(() => import("./pages/SnapAndLog.tsx"))
const SearchFoods = lazy(() => import("./pages/SearchFoods.tsx"))
const FoodReview = lazy(() => import("./pages/FoodReview.tsx"))
const Foods = lazy(() => import("./pages/Foods.tsx"))
const Nutrition = lazy(() => import("./pages/Nutrition.tsx"))
const Water = lazy(() => import("./pages/Water.tsx"))
const Supplements = lazy(() => import("./pages/Supplements.tsx"))
const NewRecipe = lazy(() => import("./pages/NewRecipe.tsx"))
const Progress = lazy(() => import("./pages/Progress.tsx"))
const Settings = lazy(() => import("./pages/Settings.tsx"))

function shouldShowBottomBar(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/foods" ||
    pathname === "/nutrition" ||
    pathname === "/workouts" ||
    pathname === "/water" ||
    pathname === "/supplements" ||
    pathname === "/progress" ||
    pathname === "/exercises" ||
    pathname === "/settings"
  )
}

function RouteFallback() {
  return (
    <main className="flex flex-col justify-center mx-auto px-5 w-full max-w-sm min-h-svh text-center">
      <section className="p-5 app-rail-surface">
        <div className="mx-auto mb-4 border-2 border-foreground/20 border-t-foreground rounded-full w-5 h-5 animate-spin" />
        <h1 className="font-semibold text-[1.25rem] tracking-tight">
          Loading OneRep
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground/70 leading-5">
          Preparing your mobile workspace.
        </p>
      </section>
    </main>
  )
}

function NotFound() {
  return (
    <main className="py-[var(--app-safe-bottom-lg)] flex flex-col justify-center bg-background mx-auto px-5 w-full max-w-sm min-h-svh text-foreground">
      <section className="bg-card shadow-[0_24px_70px_rgba(15,23,42,0.07)] dark:shadow-black/30 p-5 border border-border/70 rounded-[24px] text-center">
        <p className="font-bold text-[10px] text-muted-foreground/55 uppercase tracking-[0.16em]">
          Not found
        </p>
        <h1 className="mt-2 font-semibold text-[1.35rem] leading-tight tracking-tight">
          This page is not available
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground/70 leading-5">
          Check the link or return to OneRep.
        </p>
        <Link
          to="/"
          className="flex justify-center items-center bg-foreground active:opacity-85 mt-5 px-4 rounded-[14px] w-full min-h-11 font-semibold text-[14px] text-background"
        >
          Go to OneRep
        </Link>
      </section>
    </main>
  )
}

function NavSync() {
  const navigate = useSmoothNavigate()
  const location = useLocation()
  const [bottomBarAction, setBottomBarActionState] = useState<
    (() => void) | undefined
  >()
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const holdTimer = useRef<number | null>(null)
  const edge = 28
  const threshold = 72
  const showBottomBar = shouldShowBottomBar(location.pathname)
  const routeMotion = getRouteMotion()

  const setBottomBarAction = useCallback((action?: () => void) => {
    setBottomBarActionState(() => action)
  }, [])

  useEffect(() => {
    function clearHold() {
      if (holdTimer.current != null) {
        window.clearTimeout(holdTimer.current)
        holdTimer.current = null
      }
    }

    function isInteractive(target: EventTarget | null) {
      return target instanceof HTMLElement
        ? Boolean(
            target.closest(
              "button, a, [role='button'], input, select, textarea, label"
            )
          )
        : false
    }

    function onPointerDown(event: PointerEvent) {
      if (!isInteractive(event.target)) return
      hapticTap()
      clearHold()
      holdTimer.current = window.setTimeout(() => {
        hapticMedium()
        holdTimer.current = null
      }, 420)
    }

    function onPointerEnd() {
      clearHold()
    }

    document.addEventListener("pointerdown", onPointerDown, {
      passive: true,
    })
    window.addEventListener("pointerup", onPointerEnd, { passive: true })
    window.addEventListener("pointercancel", onPointerEnd, { passive: true })

    return () => {
      clearHold()
      document.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerEnd)
      window.removeEventListener("pointercancel", onPointerEnd)
    }
  }, [])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [location.key])

  useEffect(() => {
    clearRouteMotion()
  }, [location.key])

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current == null || touchStartY.current == null) return

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStartX.current
    const deltaY = touch.clientY - touchStartY.current
    const startedLeftEdge = touchStartX.current <= edge
    const startedRightEdge = touchStartX.current >= window.innerWidth - edge

    touchStartX.current = null
    touchStartY.current = null

    if (Math.abs(deltaY) > 48 || Math.abs(deltaX) < threshold) return

    if (startedLeftEdge && deltaX > 0 && window.history.length > 1) {
      hapticSelection()
      navigate(-1, { motion: "back" })
      return
    }

    if (startedRightEdge && deltaX < 0) {
      hapticSelection()
      navigate(1, { motion: "forward" })
    }
  }

  return (
    <BottomBarActionProvider onActionChange={setBottomBarAction}>
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="app-route-shell"
      >
        <div
          key={location.key}
          className={cn(
            "app-route-frame",
            routeMotion && "app-route-frame-animated"
          )}
          data-route-motion={routeMotion}
        >
          <Outlet />
        </div>
      </div>
      {showBottomBar && <BottomBar onAdd={bottomBarAction} />}
    </BottomBarActionProvider>
  )
}

function AuthCallback() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const rawNext = searchParams.get("next")
  const nextPath =
    rawNext === "onboarding" ? "/onboarding" : safeAuthRedirectPath(rawNext)

  function navigateInApp(destination: string) {
    if (destination.startsWith("http")) {
      window.location.href = destination
      return
    }

    navigate(destination, { replace: true })
  }

  useEffect(() => {
    navigateInApp(nextPath)
  }, [nextPath])

  return (
    <div className="bg-background min-h-svh text-foreground">
      <main className="py-[var(--app-safe-bottom-lg)] flex flex-col justify-center mx-auto px-5 w-full short-phone:max-w-[23rem] max-w-sm min-h-svh">
        <header className="flex flex-col items-center mb-8 short-phone:mb-5">
          <img
            src="/app-icon.svg"
            alt=""
            className="rounded-full w-11 short-phone:w-9 h-11 short-phone:h-9"
          />
          <h1 className="mt-4 short-phone:mt-3 font-semibold text-[1.65rem] short-phone:text-[1.45rem] tracking-tight">
            OneRep
          </h1>
        </header>

        <section className="bg-card shadow-[0_24px_70px_rgba(15,23,42,0.07)] dark:shadow-black/30 p-4 short-phone:p-3.5 border border-border/70 rounded-[28px] short-phone:rounded-[24px] text-center">
          <div className="mx-auto border-2 border-muted-foreground/20 border-t-foreground rounded-full w-8 h-8 animate-spin" />
          <p className="mt-4 font-semibold text-[14px] tracking-tight">
            Finishing sign in...
          </p>
        </section>
      </main>
    </div>
  )
}

const router = createBrowserRouter([
  {
    element: <NavSync />,
    children: [
      {
        path: "/",
        element: (
          <AuthGuard>
            <App />
          </AuthGuard>
        ),
      },
      {
        path: "/exercises",
        element: (
          <AuthGuard>
            <Exercises />
          </AuthGuard>
        ),
      },
      {
        path: "/workouts",
        element: (
          <AuthGuard>
            <Workouts />
          </AuthGuard>
        ),
      },
      {
        path: "/workouts/new",
        element: (
          <AuthGuard>
            <NewPreset />
          </AuthGuard>
        ),
      },
      {
        path: "/workouts/edit/:id",
        element: (
          <AuthGuard>
            <NewPreset />
          </AuthGuard>
        ),
      },
      {
        path: "/onboarding",
        element: (
          <AuthGuard>
            <Onboarding />
          </AuthGuard>
        ),
      },
      {
        path: "/workout/active",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Active Workout">
              <ActiveWorkout />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/workout/active/:presetId",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Active Workout">
              <ActiveWorkout />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/camera",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Snap & Log">
              <SnapAndLog />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/foods",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Food">
              <Foods />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/nutrition",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Nutrition">
              <Nutrition />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/water",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Water">
              <Water />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/supplements",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Supplements">
              <Supplements />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/foods/search",
        element: (
          <AuthGuard>
            <SearchFoods />
          </AuthGuard>
        ),
      },
      {
        path: "/search-foods",
        element: (
          <AuthGuard>
            <SearchFoods />
          </AuthGuard>
        ),
      },
      {
        path: "/foods/review/:id",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Food Review">
              <FoodReview />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/foods/recipe/new",
        element: (
          <AuthGuard>
            <NewRecipe />
          </AuthGuard>
        ),
      },
      {
        path: "/foods/recipe/:id",
        element: (
          <AuthGuard>
            <NewRecipe />
          </AuthGuard>
        ),
      },
      {
        path: "/progress",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Progress">
              <Progress />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/login",
        element: <Login />,
      },
      {
        path: "/sso-callback",
        element: <AuthCallback />,
      },
      {
        path: "/reset-password",
        element: <ResetPassword />,
      },
      {
        path: "/email-verified",
        element: <EmailVerified />,
      },
      {
        path: "/verify-email-required",
        element: <VerifyEmailRequired />,
      },
      {
        path: "/settings",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Settings">
              <Settings onClose={() => window.history.back()} />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
])

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Missing root element")
}

const root =
  window.__onerepReactRoot ??
  (window.__onerepReactRoot = createRoot(rootElement))

window.__onerepSignOut = signOutApp

root.render(
  <StrictMode>
    <ConvexBetterAuthProvider client={convexClient} authClient={providerAuthClient}>
      <PostHogProvider client={posthog}>
        <ThemeProvider>
          <ErrorBoundary label="the app">
            <OfflineSyncIndicator />
            <Suspense fallback={<RouteFallback />}>
              <RouterProvider router={router} />
            </Suspense>
            <Toaster position="top-center" richColors />
          </ErrorBoundary>
        </ThemeProvider>
      </PostHogProvider>
    </ConvexBetterAuthProvider>
  </StrictMode>
)

if (import.meta.env.PROD) {
  reloadWhenServiceWorkerControlsPage()
  void registerAppServiceWorker({
    onUpdate(registration) {
      toast("Update ready", {
        description: "Refresh OneRep to use the latest version.",
        action: {
          label: "Refresh",
          onClick: () => activateWaitingServiceWorker(registration),
        },
      })
    },
  })
}
