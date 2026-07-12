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
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <header className="mb-8 flex items-center gap-2.5">
          <img src="/app-icon.svg" alt="" className="size-8" />
          <span className="native-row-title font-semibold">OneRep</span>
        </header>

        <section aria-labelledby="verify-email-title">
          <p className="native-supporting">Account security</p>
          <h1 id="verify-email-title" className="native-large-title mt-2">
            Check your email
          </h1>
          <p className="native-body mt-3 text-muted-foreground">
            {email
              ? `Open the verification message sent to ${email}, then return here to sign in.`
              : "Open the verification message we sent you, then return here to sign in."}
          </p>

          <div className="mt-7">
            <button
              type="button"
              onClick={() =>
                navigate(hasPendingEmail ? "/login?mode=signup" : "/login", {
                  replace: true,
                })
              }
              className="native-primary-button min-h-12 w-full"
            >
              {hasPendingEmail ? "Back to sign up" : "Back to sign in"}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
