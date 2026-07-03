import { useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
import { Eye, EyeSlash } from "@phosphor-icons/react"
import { authClient, betterAuthErrorMessage } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

const FIELD_CLASS =
  "block rounded-[10px] border border-border/60 bg-background px-4 py-3 transition-colors focus-within:border-foreground/25 focus-within:bg-card short-phone:py-2.5"
const LABEL_CLASS =
  "block text-[9.5px] font-semibold tracking-[0.18em] text-muted-foreground/60 uppercase"
const INPUT_CLASS =
  "mt-1.5 min-h-10 w-full bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-muted-foreground/35 disabled:opacity-60"
const PASSWORD_CHANGED_MESSAGE =
  "Password changed. Sign in with the new password."

function PasswordInput({
  label,
  name,
  value,
  onChange,
  visible,
  onToggleVisible,
  disabled,
}: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
  disabled: boolean
}) {
  return (
    <label className={FIELD_CLASS}>
      <span className={LABEL_CLASS}>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          autoComplete="new-password"
          disabled={disabled}
          className={INPUT_CLASS}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          disabled={disabled}
          className="mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground/60 transition-colors active:bg-muted/45 active:text-foreground disabled:opacity-40"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeSlash size={18} weight="bold" />
          ) : (
            <Eye size={18} weight="bold" />
          )}
        </button>
      </span>
    </label>
  )
}

export default function ResetPassword() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const token = searchParams.get("token")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [codeSent, setCodeSent] = useState(Boolean(token))
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const resetActionRef = useRef(false)

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (resetActionRef.current || loading) return
    setError(undefined)
    setMessage(undefined)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Enter your email")
      return
    }
    resetActionRef.current = true
    setLoading(true)
    try {
      const sent = await authClient.requestPasswordReset({
        email: trimmedEmail,
        redirectTo: "/reset-password",
      })
      if (sent.error) {
        setError(betterAuthErrorMessage(sent.error, "Could not send reset link"))
        return
      }

      setCodeSent(true)
      setMessage("Reset link sent. Check your email.")
    } catch (error) {
      setError(betterAuthErrorMessage(error, "Could not send reset link"))
    } finally {
      resetActionRef.current = false
      setLoading(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (resetActionRef.current || loading) return
    setError(undefined)
    setMessage(undefined)

    if (!token) {
      setError("Open the reset link from your email first.")
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

    resetActionRef.current = true
    setLoading(true)
    try {
      const submitted = await authClient.resetPassword({
        token,
        newPassword,
      })
      if (submitted.error) {
        setError(
          betterAuthErrorMessage(submitted.error, "Could not reset password")
        )
        return
      }

      setNewPassword("")
      setConfirmPassword("")
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      setMessage(PASSWORD_CHANGED_MESSAGE)
    } catch (error) {
      setError(betterAuthErrorMessage(error, "Could not reset password"))
    } finally {
      resetActionRef.current = false
      setLoading(false)
    }
  }

  const passwordChanged = message === PASSWORD_CHANGED_MESSAGE

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
              {codeSent ? "Choose a password." : "Get a reset link."}
            </h2>
            <p className="mt-2 text-[13.5px] leading-5 font-medium text-muted-foreground/70">
              {codeSent
                ? "Use the reset link from your email, then choose a new password."
                : "Enter your account email and OneRep will send a password reset link."}
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
                  name="email"
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

            {codeSent && !passwordChanged && (
              <>
                <PasswordInput
                  label="New password"
                  name="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  visible={showNewPassword}
                  onToggleVisible={() =>
                    setShowNewPassword((visible) => !visible)
                  }
                  disabled={loading}
                />

                <PasswordInput
                  label="Confirm password"
                  name="confirm-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  visible={showConfirmPassword}
                  onToggleVisible={() =>
                    setShowConfirmPassword((visible) => !visible)
                  }
                  disabled={loading}
                />
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

            {passwordChanged ? (
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
                aria-busy={loading}
                className="h-[52px] w-full rounded-[10px] bg-foreground text-[15px] font-semibold text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:h-12"
              >
                {loading
                  ? codeSent
                    ? "Changing…"
                    : "Sending…"
                  : codeSent
                    ? "Change password"
                    : "Send link"}
              </button>
            )}
          </form>

          {codeSent && !passwordChanged && (
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={loading}
              aria-busy={loading}
              className="mt-2 h-[48px] w-full rounded-[10px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/50 active:text-foreground disabled:opacity-50 short-phone:h-10"
            >
              Resend link
            </button>
          )}
        </section>
      </main>
    </div>
  )
}
