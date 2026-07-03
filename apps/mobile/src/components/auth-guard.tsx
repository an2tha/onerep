import { useEffect } from "react"
import { handleUnauthenticatedSession } from "@/lib/auth-session"
import { signOutApp, useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const {
    authLoadTimedOut,
    authServiceConfigured,
    authServiceError,
    isLoaded,
    isSignedIn,
  } = useAppAuth()
  const signOut = signOutApp
  const navigate = useSmoothNavigate()

  useEffect(() => {
    if (!isLoaded) return
    if (!authServiceConfigured || authLoadTimedOut) return

    if (!isSignedIn) {
      void handleUnauthenticatedSession({ navigate, signOut })
    }
  }, [
    authLoadTimedOut,
    authServiceConfigured,
    isLoaded,
    isSignedIn,
    navigate,
    signOut,
  ])

  if (!isLoaded) {
    return null
  }

  if (!isSignedIn) {
    if (!authServiceConfigured || authLoadTimedOut) {
      return (
        <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 text-center">
          <section className="app-rail-surface p-5">
            <h1 className="text-[1.25rem] font-semibold tracking-tight">
              Sign-in service unavailable
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground/70">
              {authServiceError ??
                "OneRep could not reach the sign-in service. Your local data is still safe."}
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-11 w-full rounded-[10px] bg-foreground text-[14px] font-semibold text-background transition-opacity active:opacity-75"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleUnauthenticatedSession({ navigate, signOut })
                }
                className="h-11 w-full rounded-[10px] bg-muted text-[14px] font-semibold text-foreground transition-opacity active:opacity-75"
              >
                Go to sign in
              </button>
            </div>
          </section>
        </main>
      )
    }

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

  return <>{children}</>
}
