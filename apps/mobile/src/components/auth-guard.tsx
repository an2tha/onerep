import { useEffect, useState } from "react"
import { useAuth, useClerk } from "@clerk/react"
import { handleUnauthenticatedSession } from "@/lib/auth-session"
import { useSmoothNavigate } from "@/lib/navigation"
import { useConvexAuth } from "convex/react"

const AUTH_BRIDGE_GRACE_MS = 10_000

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { signOut } = useClerk()
  const convexAuth = useConvexAuth()
  const navigate = useSmoothNavigate()
  const [authBridgeTimedOut, setAuthBridgeTimedOut] = useState(false)
  const [retryAttempt, setRetryAttempt] = useState(0)

  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn) {
      void handleUnauthenticatedSession({ navigate, signOut })
      return
    }

    if (convexAuth.isLoading || convexAuth.isAuthenticated) {
      setAuthBridgeTimedOut(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setAuthBridgeTimedOut(true)
    }, AUTH_BRIDGE_GRACE_MS)

    return () => window.clearTimeout(timeout)
  }, [
    convexAuth.isAuthenticated,
    convexAuth.isLoading,
    isLoaded,
    isSignedIn,
    navigate,
    retryAttempt,
    signOut,
  ])

  if (
    !isLoaded ||
    (isSignedIn && !convexAuth.isAuthenticated && !authBridgeTimedOut)
  ) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 text-center">
        <section className="app-rail-surface p-5">
          <div className="mx-auto mb-4 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
          <h1 className="text-[1.25rem] font-semibold tracking-tight">
            Checking sign in
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground/70">
            We are connecting your saved session.
          </p>
        </section>
      </main>
    )
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 text-center">
        <section className="app-rail-surface p-5">
          <div className="mx-auto mb-4 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
          <h1 className="text-[1.25rem] font-semibold tracking-tight">
            Taking you to sign in
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground/70">
            Your destination is saved so you can continue after signing in.
          </p>
          <button
            type="button"
            onClick={() =>
              void handleUnauthenticatedSession({ navigate, signOut })
            }
            className="mt-5 h-11 w-full rounded-[10px] bg-foreground text-[14px] font-semibold text-background transition-opacity active:opacity-75"
          >
            Continue to sign in
          </button>
        </section>
      </main>
    )
  }

  if (!convexAuth.isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 text-center">
        <section className="app-rail-surface p-5">
          <div className="mx-auto mb-4 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
          <h1 className="text-[1.25rem] font-semibold tracking-tight">
            Still connecting to your account
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground/70">
            Your sign-in is saved. Check your connection, then try again.
          </p>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setAuthBridgeTimedOut(false)
                setRetryAttempt((current) => current + 1)
              }}
              className="h-11 rounded-[10px] bg-foreground text-[14px] font-semibold text-background transition-opacity active:opacity-75"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() =>
                void handleUnauthenticatedSession({ navigate, signOut })
              }
              className="h-11 rounded-[10px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/50 active:text-foreground"
            >
              Sign out
            </button>
          </div>
        </section>
      </main>
    )
  }

  return <>{children}</>
}
