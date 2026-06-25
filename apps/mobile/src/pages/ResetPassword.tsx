import { useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
import { authClient } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

const FIELD_CLASS =
  "block rounded-[20px] border border-border/60 bg-background px-4 py-3 transition-colors focus-within:border-foreground/25 focus-within:bg-card short-phone:rounded-[18px] short-phone:py-2.5"
const LABEL_CLASS =
  "block text-[9.5px] font-semibold tracking-[0.18em] text-muted-foreground/60 uppercase"
const INPUT_CLASS =
  "mt-1.5 min-h-10 w-full bg-transparent text-[15px] font-medium tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35 disabled:opacity-60"

function formatResetError(message?: string) {
  const normalized = message?.toLowerCase() ?? ""
  if (normalized.includes("token")) {
    return "This reset link has expired. Request a new one from sign in."
  }
  if (normalized.includes("short")) {
    return "Use at least 8 characters for your new password."
  }
  return message || "Could not reset password"
}

export default function ResetPassword() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const linkError = searchParams.get("error")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | undefined>(
    linkError
      ? "This reset link has expired. Request a new one from sign in."
      : token
        ? undefined
        : "Open the reset link from your email."
  )
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const canSubmit = Boolean(token) && !linkError && !message

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setMessage(undefined)

    if (!canSubmit) {
      setError("Request a new reset link from sign in.")
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
      const { error: resetError } = await authClient.resetPassword({
        token,
        newPassword,
      })
      if (resetError) {
        setError(formatResetError(resetError.message))
        return
      }

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
          <h1 className="mt-4 text-[1.65rem] font-semibold tracking-tight short-phone:mt-3 short-phone:text-[1.45rem]">
            OneRep
          </h1>
        </header>

        <section className="rounded-[28px] border border-border/70 bg-card p-3.5 shadow-[0_24px_70px_rgba(15,23,42,0.07)] dark:shadow-black/30 short-phone:rounded-[24px] short-phone:p-3">
          <div className="mb-3 px-1.5 py-1 short-phone:mb-2">
            <p className="text-[10px] font-semibold tracking-[0.22em] text-muted-foreground/60 uppercase">
              Reset password
            </p>
            <h2 className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-tight short-phone:text-[1.55rem]">
              Pick a new one.
            </h2>
            <p className="mt-2 text-[13.5px] leading-5 font-medium text-muted-foreground/70">
              Use the link from your email. Other sessions are revoked when this
              changes.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-2.5 short-phone:space-y-2"
          >
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
                disabled={loading || !canSubmit}
                className={INPUT_CLASS}
              />
            </label>

            <label className={FIELD_CLASS}>
              <span className={LABEL_CLASS}>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
                disabled={loading || !canSubmit}
                className={INPUT_CLASS}
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-[18px] border border-destructive/20 bg-destructive/8 px-3.5 py-2.5 text-[12.5px] font-medium text-destructive"
              >
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-[18px] border border-foreground/10 bg-muted/55 px-3.5 py-2.5 text-[12.5px] font-medium text-muted-foreground">
                {message}
              </p>
            )}

            {message ? (
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="h-[52px] w-full rounded-[22px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-75 short-phone:h-12 short-phone:rounded-[20px]"
              >
                Back to sign in
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="h-[52px] w-full rounded-[22px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:h-12 short-phone:rounded-[20px]"
              >
                {loading ? "Changing..." : "Change password"}
              </button>
            )}
          </form>
        </section>
      </main>
    </div>
  )
}
