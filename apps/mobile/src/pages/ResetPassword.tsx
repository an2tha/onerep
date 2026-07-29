import { useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
import { Eye, EyeSlash } from "@phosphor-icons/react"
import { authClient, betterAuthErrorMessage } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { getAuthCallbackUrl } from "@/lib/auth-redirects"

const FIELD_CLASS = "native-field"
const LABEL_CLASS = "native-field-label"
const INPUT_CLASS = "native-input disabled:opacity-60"
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
          className="native-toolbar-button h-11 w-11 shrink-0 border border-border text-muted-foreground disabled:opacity-40"
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
        redirectTo: getAuthCallbackUrl("/reset-password"),
      })
      if (sent.error) {
        setError(
          betterAuthErrorMessage(sent.error, "Could not send reset link")
        )
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
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <header className="mb-8 flex items-center gap-2.5">
          <img src="/app-icon.svg" alt="" className="size-8" />
          <span className="native-row-title font-semibold">OneRep</span>
        </header>

        <section aria-labelledby="reset-password-title">
          <p className="native-supporting">Account security</p>
          <h1 id="reset-password-title" className="native-large-title mt-2">
            {codeSent ? "Choose a new password" : "Reset your password"}
          </h1>
          <p className="native-body mt-3 text-muted-foreground">
            {codeSent
              ? "Use the link from your email and enter a new password below."
              : "Enter your account email. We’ll send you a secure reset link."}
          </p>

          <form
            onSubmit={codeSent ? changePassword : sendCode}
            className="mt-7 space-y-4"
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
                className="border-l-2 border-destructive py-2 pl-3 text-[14px] font-medium text-destructive"
              >
                {error}
              </p>
            )}

            {message && (
              <p
                role="status"
                className="border-l-2 border-border py-2 pl-3 text-[14px] font-medium text-muted-foreground"
              >
                {message}
              </p>
            )}

            {passwordChanged ? (
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="native-primary-button min-h-12 w-full"
              >
                Back to sign in
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="native-primary-button min-h-12 w-full disabled:opacity-50"
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

          {/* Without an email in scope the resend would only ever error, and
              the email field is hidden once codeSent is true. */}
          {codeSent && !passwordChanged && email.trim() !== "" && (
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={loading}
              aria-busy={loading}
              className="native-toolbar-button mt-3 min-h-12 w-full border border-border text-muted-foreground disabled:opacity-50"
            >
              Resend link
            </button>
          )}
        </section>
      </main>
    </div>
  )
}
