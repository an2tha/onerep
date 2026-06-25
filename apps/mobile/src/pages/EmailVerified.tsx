import { useSearchParams } from "react-router"
import { authClient } from "@/lib/auth-client"
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
  const { data: session, isPending } = authClient.useSession()
  const hasError = Boolean(searchParams.get("error"))
  const next = searchParams.get("next")
  const copy = hasError ? STATUS_COPY.error : STATUS_COPY.success
  const buttonLabel = hasError
    ? "Back to sign in"
    : session && next === "onboarding"
      ? "Continue"
      : session
        ? "Open OneRep"
        : "Sign in"

  function handleContinue() {
    if (hasError) {
      navigate("/login", { replace: true })
      return
    }

    clearPendingVerification()
    if (!session) {
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
          <h1 className="mt-4 text-[1.65rem] font-semibold tracking-tight short-phone:mt-3 short-phone:text-[1.45rem]">
            OneRep
          </h1>
        </header>

        <section className="rounded-[28px] border border-border/70 bg-card p-4 shadow-[0_24px_70px_rgba(15,23,42,0.07)] dark:shadow-black/30 short-phone:rounded-[24px] short-phone:p-3.5">
          <div className="rounded-[24px] border border-border/60 bg-background px-4 py-5 text-center short-phone:rounded-[20px] short-phone:py-4">
            <p className="text-[10px] font-semibold tracking-[0.22em] text-muted-foreground/60 uppercase">
              {copy.eyebrow}
            </p>
            <h2 className="mt-3 text-[1.75rem] leading-tight font-semibold tracking-tight short-phone:text-[1.55rem]">
              {copy.title}
            </h2>
            <p className="mx-auto mt-3 max-w-[260px] text-[14px] leading-6 font-medium text-muted-foreground/70 short-phone:text-[13px] short-phone:leading-5">
              {copy.body}
            </p>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!hasError && isPending}
            className="mt-3 h-[52px] w-full rounded-[22px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:h-12 short-phone:rounded-[20px]"
          >
            {!hasError && isPending ? "Checking..." : buttonLabel}
          </button>
        </section>
      </main>
    </div>
  )
}
