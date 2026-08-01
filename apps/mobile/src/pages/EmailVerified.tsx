import { Navigate, useSearchParams } from "react-router"
import { useConvexAuth } from "convex/react"
import {
  clearPendingVerification,
  getPendingVerification,
} from "@/lib/auth-redirects"
import { safeAuthRedirectPath } from "@/lib/auth-session"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

const STATUS_COPY = {
  success: {
    title: "You're set.",
    body: "Your email is verified. Continue into OneRep and keep logging.",
  },
  error: {
    title: "This link did not work.",
    body: "The verification link may have expired. Sign in again and we will send a fresh one.",
  },
}

export default function EmailVerified() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const { isLoaded, isSignedIn } = useAppAuth()
  const convexAuth = useConvexAuth()
  const hasError = Boolean(searchParams.get("error"))
  const isVerificationLinkReturn = searchParams.get("source") === "email"
  const next = searchParams.get("next")
  const checkingAuth =
    !hasError && (!isLoaded || (isSignedIn && !convexAuth.isAuthenticated))
  const copy = hasError ? STATUS_COPY.error : STATUS_COPY.success
  const body = checkingAuth
    ? "Checking your sign-in state so we can send you to the right place."
    : copy.body
  const buttonLabel = hasError
    ? "Back to sign in"
    : isSignedIn && next === "onboarding"
      ? "Continue"
      : isSignedIn
        ? "Open OneRep"
        : "Sign in"

  function handleContinue() {
    if (hasError) {
      navigate("/login", { replace: true })
      return
    }

    const pendingNext = safeAuthRedirectPath(getPendingVerification().next)
    clearPendingVerification()
    if (!isSignedIn || !convexAuth.isAuthenticated) {
      navigate("/login", { replace: true })
      return
    }

    navigate(next === "onboarding" ? "/onboarding" : pendingNext, {
      replace: true,
    })
  }

  if (!isVerificationLinkReturn) {
    const pendingNext = safeAuthRedirectPath(getPendingVerification().next)
    return (
      <Navigate
        to={isLoaded && convexAuth.isAuthenticated ? pendingNext : "/login"}
        replace
      />
    )
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <header className="mb-8 flex items-center gap-2.5">
          <img src="/app-icon.svg" alt="" className="size-8" />
          <span className="native-row-title font-semibold">OneRep</span>
        </header>

        <section
          aria-labelledby="verification-result-title"
          className="motion-content-in"
        >
          <h1 id="verification-result-title" className="native-large-title">
            {copy.title}
          </h1>
          <p className="native-body mt-3 text-muted-foreground">{body}</p>

          <button
            type="button"
            onClick={handleContinue}
            disabled={checkingAuth}
            aria-busy={checkingAuth}
            className="native-primary-button mt-7 min-h-12 w-full disabled:opacity-50"
          >
            {checkingAuth ? "Checking..." : buttonLabel}
          </button>
        </section>
      </main>
    </div>
  )
}
