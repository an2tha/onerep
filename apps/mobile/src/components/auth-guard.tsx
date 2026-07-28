import { useEffect, useState } from "react"
import { useConvexAuth } from "convex/react"
import { handleUnauthenticatedSession } from "@/lib/auth-session"
import { signOutApp, useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

const CONVEX_AUTH_HANDOFF_TIMEOUT_MS = 10_000

function AuthHandoff() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
      <section aria-labelledby="auth-handoff-heading" aria-live="polite">
        <div className="mb-5 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        <p className="native-supporting">OneRep account</p>
        <h1 id="auth-handoff-heading" className="native-large-title mt-2">
          Finishing sign in
        </h1>
        <p className="native-body mt-3 text-muted-foreground">
          Your account is verified. OneRep is securely connecting your data.
        </p>
      </section>
    </main>
  )
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const {
    authLoadTimedOut,
    authServiceConfigured,
    authServiceError,
    isLoaded,
    isSignedIn,
  } = useAppAuth()
  const convexAuth = useConvexAuth()
  const navigate = useSmoothNavigate()
  const [handoffTimedOut, setHandoffTimedOut] = useState(false)

  useEffect(() => {
    if (
      !isLoaded ||
      !isSignedIn ||
      convexAuth.isAuthenticated ||
      !authServiceConfigured
    ) {
      setHandoffTimedOut(false)
      return
    }

    const timeout = window.setTimeout(
      () => setHandoffTimedOut(true),
      CONVEX_AUTH_HANDOFF_TIMEOUT_MS
    )
    return () => window.clearTimeout(timeout)
  }, [
    authServiceConfigured,
    convexAuth.isAuthenticated,
    isLoaded,
    isSignedIn,
  ])

  useEffect(() => {
    if (!isLoaded || convexAuth.isLoading || convexAuth.isAuthenticated) return
    if (!authServiceConfigured || authLoadTimedOut || isSignedIn) return

    // Only clear the auth client after both Better Auth and Convex agree that
    // the user is signed out. A temporary handoff mismatch after sign-in must
    // never destroy the newly created session.
    void handleUnauthenticatedSession({ navigate, signOut: signOutApp })
  }, [
    authLoadTimedOut,
    authServiceConfigured,
    convexAuth.isAuthenticated,
    convexAuth.isLoading,
    isLoaded,
    isSignedIn,
    navigate,
  ])

  // Convex authentication is the source of truth for protected routes. This
  // guarantees child queries cannot run before Convex validates the token.
  if (convexAuth.isAuthenticated) return <>{children}</>

  if (
    !isLoaded ||
    convexAuth.isLoading ||
    (isSignedIn && !handoffTimedOut && authServiceConfigured)
  ) {
    return <AuthHandoff />
  }

  if (!authServiceConfigured || authLoadTimedOut || handoffTimedOut) {
    const handoffError = handoffTimedOut
      ? "Your account signed in, but the secure data connection did not finish. Retry before signing in again."
      : authServiceError

    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <section aria-labelledby="auth-service-heading">
          <p className="native-supporting">OneRep account</p>
          <h1 id="auth-service-heading" className="native-large-title mt-2">
            Sign-in service unavailable
          </h1>
          <p className="native-body mt-3 text-muted-foreground">
            {handoffError ??
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
            {isSignedIn ? (
              <button
                type="button"
                onClick={() =>
                  void handleUnauthenticatedSession({
                    navigate,
                    signOut: signOutApp,
                  })
                }
                className="native-toolbar-button w-full border border-border"
              >
                Sign out and start again
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  void handleUnauthenticatedSession({
                    navigate,
                    signOut: signOutApp,
                  })
                }
                className="native-toolbar-button w-full border border-border"
              >
                Go to sign in
              </button>
            )}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
      <section aria-labelledby="signed-out-heading">
        <p className="native-supporting">OneRep account</p>
        <h1 id="signed-out-heading" className="native-large-title mt-2">
          Taking you to sign in
        </h1>
        <p className="native-body mt-3 text-muted-foreground">
          Your destination is saved so you can continue after signing in.
        </p>
        <button
          type="button"
          onClick={() =>
            void handleUnauthenticatedSession({
              navigate,
              signOut: signOutApp,
            })
          }
          className="native-primary-button mt-6 w-full"
        >
          Continue to sign in
        </button>
      </section>
    </main>
  )
}
