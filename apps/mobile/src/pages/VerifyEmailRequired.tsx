import { useEffect, useState } from "react"
import { getPendingVerification } from "@/lib/auth-redirects"
import { useSmoothNavigate } from "@/lib/navigation"

export default function VerifyEmailRequired() {
  const navigate = useSmoothNavigate()
  const [email, setEmail] = useState("")
  const hasPendingEmail = email.trim().length > 0

  useEffect(() => {
    const pending = getPendingVerification()
    setEmail(pending.email)
  }, [])

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
              Verify email
            </p>
            <h2 className="app-display mt-3 text-[1.9rem] short-phone:text-[1.55rem]">
              Verify your email first.
            </h2>
            <p className="mx-auto mt-3 max-w-[268px] text-[14px] leading-6 font-medium text-muted-foreground/70 short-phone:text-[13px] short-phone:leading-5">
              OneRep needs a verified email before you can sign in.
              {email
                ? ` Return to sign up and check the verification email sent to ${email}.`
                : " Return to sign up and check your verification email."}
            </p>
          </div>

          <div className="mt-3 space-y-2.5">
            <button
              type="button"
              onClick={() =>
                navigate(hasPendingEmail ? "/login?mode=signup" : "/login", {
                  replace: true,
                })
              }
              className="h-[52px] w-full rounded-[10px] bg-foreground text-[15px] font-semibold text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:h-12"
            >
              {hasPendingEmail ? "Back to sign up" : "Back to sign in"}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
