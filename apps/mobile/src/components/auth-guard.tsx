import { useEffect } from "react"
import { useConvexAuth } from "convex/react"
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
  const convexAuth = useConvexAuth()
  const signOut = signOutApp
  const navigate = useSmoothNavigate()

  useEffect(() => {
    if (!isLoaded) return
    if (!authServiceConfigured || authLoadTimedOut) return

    if (!isSignedIn || (!convexAuth.isLoading && !convexAuth.isAuthenticated)) {
      void handleUnauthenticatedSession({ navigate, signOut })
    }
  }, [
    authLoadTimedOut,
    authServiceConfigured,
    convexAuth.isAuthenticated,
    convexAuth.isLoading,
    isLoaded,
    isSignedIn,
    navigate,
    signOut,
  ])

  if (!isLoaded || (isSignedIn && convexAuth.isLoading)) {
    return null
  }

  if (!isSignedIn || !convexAuth.isAuthenticated) {
    if (!authServiceConfigured || authLoadTimedOut) {
      return (
        <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
          <section aria-labelledby="auth-service-heading">
            <p className="native-supporting">OneRep account</p>
            <h1 id="auth-service-heading" className="native-large-title mt-2">
              Sign-in service unavailable
            </h1>
            <p className="native-body mt-3 text-muted-foreground">
              {authServiceError ??
                "OneRep could not reach the sign-in service. Your local data is still safe."}
            </p>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="native-primary-button w-full"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleUnauthenticatedSession({ navigate, signOut })
                }
                className="native-toolbar-button w-full border border-border"
              >
                Go to sign in
              </button>
            </div>
          </section>
        </main>
      )
    }

    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <section aria-labelledby="auth-handoff-heading">
          <div className="mb-5 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
          <p className="native-supporting">OneRep account</p>
          <h1 id="auth-handoff-heading" className="native-large-title mt-2">
            Taking you to sign in
          </h1>
          <p className="native-body mt-3 text-muted-foreground">
            Your destination is saved so you can continue after signing in.
          </p>
          <button
            type="button"
            onClick={() =>
              void handleUnauthenticatedSession({ navigate, signOut })
            }
            className="native-primary-button mt-6 w-full"
          >
            Continue to sign in
          </button>
        </section>
      </main>
    )
  }

  return <>{children}</>
}
