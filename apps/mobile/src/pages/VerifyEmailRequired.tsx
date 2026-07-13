import { useEffect, useState } from "react"
import {
  getEmailVerificationCallbackUrl,
  getPendingVerification,
} from "@/lib/auth-redirects"
import { authClient, betterAuthErrorMessage } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

export default function VerifyEmailRequired() {
  const navigate = useSmoothNavigate()
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const hasPendingEmail = email.trim().length > 0

  useEffect(() => {
    const pending = getPendingVerification()
    setEmail(pending.email)
  }, [])

  async function resendVerification() {
    if (!hasPendingEmail || sending) return
    setSending(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const result = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: getEmailVerificationCallbackUrl(),
      })
      if (result.error) {
        setError(
          betterAuthErrorMessage(result.error, "Could not resend the email")
        )
        return
      }
      setMessage("A fresh confirmation link is on its way.")
    } catch (cause) {
      setError(betterAuthErrorMessage(cause, "Could not resend the email"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <header className="mb-8 flex items-center gap-2.5">
          <img src="/app-icon.svg" alt="" className="size-8" />
          <span className="native-row-title font-semibold">OneRep</span>
        </header>

        <section aria-labelledby="verify-email-title">
          <p className="native-supporting">Verify your email first.</p>
          <h1 id="verify-email-title" className="native-large-title mt-2">
            Check your email
          </h1>
          <p className="native-body mt-3 text-muted-foreground">
            {email
              ? `Open the verification message sent to ${email}, then return here to sign in.`
              : "Open the verification message we sent you, then return here to sign in."}
          </p>

          {message && (
            <p role="status" className="native-body mt-5">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="native-body mt-5 text-destructive">
              {error}
            </p>
          )}

          <div className="mt-7 space-y-3">
            {hasPendingEmail && (
              <button
                type="button"
                onClick={resendVerification}
                disabled={sending}
                aria-busy={sending}
                className="native-primary-button min-h-12 w-full disabled:opacity-50"
              >
                {sending ? "Sending…" : "Resend confirmation email"}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                navigate(hasPendingEmail ? "/login?mode=signup" : "/login", {
                  replace: true,
                })
              }
              className="native-secondary-button min-h-12 w-full"
            >
              {hasPendingEmail ? "Back to sign up" : "Back to sign in"}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
