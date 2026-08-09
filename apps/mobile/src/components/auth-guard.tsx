import { useEffect, useState } from "react"
import { useConvexAuth } from "convex/react"
import { handleUnauthenticatedSession } from "@/lib/auth-session"
import { signOutApp, useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

const CONVEX_AUTH_HANDOFF_TIMEOUT_MS = 10_000

/**
 * `navigator.onLine` is a hint, not a promise — a WKWebView will happily claim
 * it is online while every request dies in the dark. The guard therefore pairs
 * it with a stall timeout instead of trusting either signal on its own.
 */
function useIsOnline() {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false
  )

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine !== false)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  return isOnline
}

function AuthHandoff() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
      <section aria-labelledby="auth-handoff-heading" aria-live="polite">
        <div className="mb-5 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        <h1 id="auth-handoff-heading" className="native-large-title">
          Finishing sign in
        </h1>
        <p className="native-body mt-3 text-muted-foreground">
          Your account is verified. Securely connecting your OneRep data.
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
  const isOnline = useIsOnline()
  const [handoffTimedOut, setHandoffTimedOut] = useState(false)

  // Everything below the Convex handoff is a waiting room, so the guard needs
  // to know when it is waiting. Better Auth can leave `isPending` set forever
  // on a request that never settles, and Convex reports `isLoading` until the
  // server confirms a token — neither resolves on a dead network.
  const waitingForConvexAuth =
    authServiceConfigured &&
    !convexAuth.isAuthenticated &&
    (!isLoaded || convexAuth.isLoading || isSignedIn)

  useEffect(() => {
    if (!waitingForConvexAuth) {
      setHandoffTimedOut(false)
      return
    }

    const timeout = window.setTimeout(
      () => setHandoffTimedOut(true),
      CONVEX_AUTH_HANDOFF_TIMEOUT_MS
    )
    return () => window.clearTimeout(timeout)
  }, [waitingForConvexAuth])

  // Coming back online restarts the wait: Better Auth refetches the session on
  // the `online` event, so the stalled screen must give the handoff a fresh
  // chance instead of staying wedged on its own timeout.
  useEffect(() => {
    if (isOnline) setHandoffTimedOut(false)
  }, [isOnline])

  useEffect(() => {
    if (!isLoaded || convexAuth.isLoading || convexAuth.isAuthenticated) return
    if (!authServiceConfigured || authLoadTimedOut || isSignedIn) return
    // A failed session request looks exactly like a signed-out one. Signing the
    // user out here would clear the local cache and strand them on a login
    // screen they cannot use until the network returns.
    if (!isOnline) return

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
    isOnline,
    isSignedIn,
    navigate,
  ])

  // Convex authentication is the source of truth for protected routes. This
  // guarantees child queries cannot run before Convex validates the token.
  if (convexAuth.isAuthenticated) return <>{children}</>

  // Offline is a dead end for the handoff — every screen past this point needs
  // a Convex token that only the server can issue. Say so immediately rather
  // than spinning for ten seconds on a spinner that cannot finish.
  const stalled = handoffTimedOut || (!isOnline && waitingForConvexAuth)

  if (waitingForConvexAuth && !stalled) return <AuthHandoff />

  if (!isOnline && authServiceConfigured) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <section aria-labelledby="auth-offline-heading" aria-live="polite">
          <h1 id="auth-offline-heading" className="native-large-title">
            You’re offline
          </h1>
          <p className="native-body mt-3 text-muted-foreground">
            OneRep needs a connection to unlock your account. Nothing on this
            device has been touched, and anything waiting to sync still is.
          </p>
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="native-primary-button w-full"
            >
              Retry
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (!authServiceConfigured || authLoadTimedOut || handoffTimedOut) {
    const handoffError = handoffTimedOut
      ? "You’re signed in, but OneRep couldn’t finish loading your account. Check your connection, then retry before signing in again."
      : authServiceError

    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <section aria-labelledby="auth-service-heading">
          <h1 id="auth-service-heading" className="native-large-title">
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
              {isSignedIn ? "Sign out and start again" : "Go to sign in"}
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
      <section aria-labelledby="signed-out-heading">
        <h1 id="signed-out-heading" className="native-large-title">
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
