import { StrictMode, useEffect, useRef } from "react"
import { createRoot } from "react-dom/client"
import {
  createBrowserRouter,
  Outlet,
  useNavigate,
  useNavigationType,
} from "react-router"
import { RouterProvider } from "react-router/dom"
import posthog from "posthog-js"
import { PostHogProvider } from "@posthog/react"
import { ConvexProvider } from "convex/react"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { convexClient } from "@/lib/convex"
import { authClient } from "@/lib/auth-client"

import "./index.css"

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2026-01-30",
})
import App from "./App.tsx"
import Exercises from "./pages/Exercises.tsx"
import Login from "./pages/Login.tsx"
import Onboarding from "./pages/Onboarding.tsx"
import Workouts from "./pages/Workouts.tsx"
import NewPreset from "./pages/NewPreset.tsx"
import ActiveWorkout from "./pages/ActiveWorkout.tsx"
import SnapAndLog from "./pages/SnapAndLog.tsx"
import SearchFoods from "./pages/SearchFoods.tsx"
import Foods from "./pages/Foods.tsx"
import NewRecipe from "./pages/NewRecipe.tsx"
import Progress from "./pages/Progress.tsx"
import { AuthGuard } from "./components/auth-guard.tsx"
import { ErrorBoundary } from "./components/error-boundary.tsx"
import { ThemeProvider, Toaster } from "@repo/ui"
import { hapticMedium, hapticSelection, hapticTap } from "./lib/haptics"

// Writes the navigation type onto <body data-nav="…"> so CSS can switch
// between the forward and back slide animations without touching every page.
function NavSync() {
  const navType = useNavigationType()
  const navigate = useNavigate()
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const holdTimer = useRef<number | null>(null)
  const edge = 28
  const threshold = 72

  useEffect(() => {
    document.body.dataset.nav = navType
  }, [navType])

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
      void hapticTap()
      clearHold()
      holdTimer.current = window.setTimeout(() => {
        void hapticMedium()
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
    const startedRightEdge =
      touchStartX.current >= window.innerWidth - edge

    touchStartX.current = null
    touchStartY.current = null

    if (Math.abs(deltaY) > 48 || Math.abs(deltaX) < threshold) return

    if (startedLeftEdge && deltaX > 0 && window.history.length > 1) {
      void hapticSelection()
      navigate(-1)
      return
    }

    if (startedRightEdge && deltaX < 0) {
      void hapticSelection()
      navigate(1)
    }
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <Outlet />
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
            <ErrorBoundary label="Foods">
              <Foods />
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
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convexClient}>
      <ConvexBetterAuthProvider client={convexClient} authClient={authClient}>
        <PostHogProvider client={posthog}>
          <ThemeProvider>
            <ErrorBoundary label="the app">
              <RouterProvider router={router} />
              <Toaster position="top-center" richColors />
            </ErrorBoundary>
          </ThemeProvider>
        </PostHogProvider>
      </ConvexBetterAuthProvider>
    </ConvexProvider>
  </StrictMode>
)
