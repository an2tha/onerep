import { useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
import { useSignIn } from "@clerk/react"
import { useSmoothNavigate } from "@/lib/navigation"

const FIELD_CLASS =
  "block rounded-[10px] border border-border/60 bg-background px-4 py-3 transition-colors focus-within:border-foreground/25 focus-within:bg-card short-phone:py-2.5"
const LABEL_CLASS =
  "block text-[9.5px] font-semibold tracking-[0.18em] text-muted-foreground/60 uppercase"
const INPUT_CLASS =
  "mt-1.5 min-h-10 w-full bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-muted-foreground/35 disabled:opacity-60"

function clerkErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      longMessage?: unknown
      message?: unknown
      errors?: { longMessage?: unknown; message?: unknown }[]
    }
    const nested = maybeError.errors?.[0]
    const message =
      nested?.longMessage ??
      nested?.message ??
      maybeError.longMessage ??
      maybeError.message
    if (typeof message === "string" && message.length > 0) return message
  }
  return fallback
}

export default function ResetPassword() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const { signIn } = useSignIn()
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setError(undefined)
    setMessage(undefined)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Enter your email")
      return
    }
    setLoading(true)
    try {
      const created = await signIn.create({ identifier: trimmedEmail })
      if (created.error) {
        setError(clerkErrorMessage(created.error, "Could not start reset"))
        return
      }

      const sent = await signIn.resetPasswordEmailCode.sendCode()
      if (sent.error) {
        setError(clerkErrorMessage(sent.error, "Could not send reset code"))
        return
      }

      setCodeSent(true)
      setMessage("Reset code sent. Check your email.")
    } finally {
      setLoading(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setMessage(undefined)

    if (!code.trim()) {
      setError("Enter the reset code from your email.")
      return
    }
    if (newPassword.length < 8) {
      setError("Use at least 8 characters for your new password.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const verified = await signIn.resetPasswordEmailCode.verifyCode({
        code: code.trim(),
      })
      if (verified.error) {
        setError(clerkErrorMessage(verified.error, "Invalid reset code"))
        return
      }

      const submitted = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      })
      if (submitted.error) {
        setError(clerkErrorMessage(submitted.error, "Could not reset password"))
        return
      }

      if (signIn.status === "complete") {
        await signIn.finalize()
      }

      setCode("")
      setNewPassword("")
      setConfirmPassword("")
      setMessage("Password changed. Sign in with the new password.")
    } finally {
      setLoading(false)
    }
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

        <section className="app-rail-surface p-3.5 short-phone:p-3">
          <div className="mb-3 px-1.5 py-1 short-phone:mb-2">
            <p className="app-eyebrow text-muted-foreground/60">
              Reset password
            </p>
            <h2 className="app-display mt-2 text-[1.9rem] short-phone:text-[1.55rem]">
              {codeSent ? "Enter the code." : "Get a reset code."}
            </h2>
            <p className="mt-2 text-[13.5px] leading-5 font-medium text-muted-foreground/70">
              {codeSent
                ? "Use the code Clerk sent to your email, then choose a new password."
                : "Enter your account email and Clerk will send a password reset code."}
            </p>
          </div>

          <form
            onSubmit={codeSent ? changePassword : sendCode}
            className="space-y-2.5 short-phone:space-y-2"
          >
            {!codeSent && (
              <label className={FIELD_CLASS}>
                <span className={LABEL_CLASS}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  disabled={loading || Boolean(message)}
                  className={INPUT_CLASS}
                />
              </label>
            )}

            {codeSent && !message && (
              <>
                <label className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>Code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="123456"
                    required
                    autoComplete="one-time-code"
                    disabled={loading}
                    className={INPUT_CLASS}
                  />
                </label>

                <label className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    disabled={loading}
                    className={INPUT_CLASS}
                  />
                </label>

                <label className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>Confirm password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    disabled={loading}
                    className={INPUT_CLASS}
                  />
                </label>
              </>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-[10px] border border-destructive/20 bg-destructive/8 px-3.5 py-2.5 text-[12.5px] font-medium text-destructive"
              >
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-[10px] border border-foreground/10 bg-muted/55 px-3.5 py-2.5 text-[12.5px] font-medium text-muted-foreground">
                {message}
              </p>
            )}

            {message === "Password changed. Sign in with the new password." ? (
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="h-[52px] w-full rounded-[10px] bg-foreground text-[15px] font-semibold text-background transition-opacity active:opacity-75 short-phone:h-12"
              >
                Back to sign in
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="h-[52px] w-full rounded-[10px] bg-foreground text-[15px] font-semibold text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:h-12"
              >
                {loading
                  ? codeSent
                    ? "Changing…"
                    : "Sending…"
                  : codeSent
                    ? "Change password"
                    : "Send code"}
              </button>
            )}
          </form>

          {codeSent && !message && (
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={loading}
              className="mt-2 h-[48px] w-full rounded-[10px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/50 active:text-foreground disabled:opacity-50 short-phone:h-10"
            >
              Resend code
            </button>
          )}
        </section>
      </main>
    </div>
  )
}
