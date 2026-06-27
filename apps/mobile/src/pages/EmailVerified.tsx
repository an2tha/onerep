import { useSearchParams } from "react-router"
import { useAuth } from "@clerk/react"
import { clearPendingVerification } from "@/lib/auth-redirects"
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
  const { isLoaded, isSignedIn } = useAuth()
  const hasError = Boolean(searchParams.get("error"))
  const next = searchParams.get("next")
  const copy = hasError ? STATUS_COPY.error : STATUS_COPY.success
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
      <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 py-[var(--app-safe-bottom-lg)] short-phone:max-w-[23rem]">
        <header className="mb-8 flex flex-col items-center short-phone:mb-5">
          <img
            src="/app-icon.svg"
            alt=""
            className="h-11 w-11 rounded-full short-phone:h-9 short-phone:w-9"
          />
          <h1 className="app-display mt-4 text-[1.8rem] short-phone:mt-3 short-phone:text-[1.45rem]">
            OneRep
          </h1>
        </header>

        <section className="app-rail-surface p-4 short-phone:p-3.5">
          <div className="rounded-[10px] border border-border/60 bg-background px-4 py-5 text-center short-phone:py-4">
            <p className="app-eyebrow text-muted-foreground/60">
              {copy.eyebrow}
            </p>
            <h2 className="app-display mt-3 text-[1.9rem] short-phone:text-[1.55rem]">
              {copy.title}
            </h2>
            <p className="mx-auto mt-3 max-w-[260px] text-[14px] leading-6 font-medium text-muted-foreground/70 short-phone:text-[13px] short-phone:leading-5">
              {copy.body}
            </p>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!hasError && !isLoaded}
            className="mt-3 h-[52px] w-full rounded-[10px] bg-foreground text-[15px] font-semibold text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:h-12"
          >
            {!hasError && !isLoaded ? "Checking..." : buttonLabel}
          </button>
        </section>
      </main>
    </div>
  )
}
