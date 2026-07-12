import { useSearchParams } from "react-router"
import { clearPendingVerification } from "@/lib/auth-redirects"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

const STATUS_COPY = {
  success: {
    eyebrow: "Email verified",
    title: "You're set.",
    body: "Your email is verified. Continue into OneRep and keep logging.",
  },
  error: {
    eyebrow: "Verification failed",
    title: "This link did not work.",
    body: "The verification link may have expired. Sign in again and we will send a fresh one.",
  },
}

export default function EmailVerified() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const { isLoaded, isSignedIn } = useAppAuth()
  const hasError = Boolean(searchParams.get("error"))
  const next = searchParams.get("next")
  const checkingAuth = !hasError && !isLoaded
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

    clearPendingVerification()
    if (!isSignedIn) {
      navigate("/login", { replace: true })
      return
    }

    navigate(next === "onboarding" ? "/onboarding" : "/", { replace: true })
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <header className="mb-8 flex items-center gap-2.5">
          <img src="/app-icon.svg" alt="" className="size-8" />
          <span className="native-row-title font-semibold">OneRep</span>
        </header>

        <section aria-labelledby="verification-result-title">
          <p className="native-supporting">{copy.eyebrow}</p>
          <h1
            id="verification-result-title"
            className="native-large-title mt-2"
          >
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
