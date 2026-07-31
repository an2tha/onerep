import { useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
import { CaretLeft, Eye, EyeSlash } from "@phosphor-icons/react"
import { authClient, betterAuthErrorMessage } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { AUTH_CARD_CLASS, AuthLayout, AuthMark } from "@/components/auth-shell"
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
      <span className="relative block">
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
          className={`${INPUT_CLASS} pr-12`}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          disabled={disabled}
          className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:opacity-60 disabled:opacity-40"
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

  /**
   * Always resolves to the sign-in route rather than history.back(), since this
   * page is also reached cold from the emailed reset link.
   */
  function backToSignIn() {
    navigate("/login", { replace: true, motion: "back" })
  }

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
    <AuthLayout>
      <header className="mb-7 text-center">
        <div className="flex justify-start">
          <button
            type="button"
            onClick={backToSignIn}
            className="native-toolbar-button -ml-2.5 pl-1.5 text-muted-foreground transition-colors hover:text-foreground active:opacity-60"
          >
            <CaretLeft size={18} weight="bold" />
            Sign in
          </button>
        </div>
        <AuthMark />
        <h1
          id="reset-password-title"
          className="mt-5 text-[1.9rem] leading-[1.1] font-semibold tracking-[-0.04em]"
        >
          {codeSent ? "Choose a new password" : "Reset your password"}
        </h1>
        <p className="mt-2 text-[15px] leading-6 text-balance text-muted-foreground">
          {codeSent
            ? "Use the link from your email and enter a new password below."
            : "Enter your account email. We’ll send you a secure reset link."}
        </p>
      </header>

      <section
        aria-labelledby="reset-password-title"
        className={AUTH_CARD_CLASS}
      >
        <form
          onSubmit={codeSent ? changePassword : sendCode}
          className="space-y-5"
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
              className="border-l-2 border-destructive py-1.5 pl-3 text-[14px] leading-5 font-medium text-destructive"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              className="border-l-2 border-border py-1.5 pl-3 text-[14px] leading-5 font-medium text-muted-foreground"
            >
              {message}
            </p>
          )}

          {passwordChanged ? (
            <button
              type="button"
              onClick={backToSignIn}
              className="native-primary-button mt-2 min-h-13 w-full rounded-[0.8rem] transition-[opacity,transform] active:scale-[0.99]"
            >
              Back to sign in
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="native-primary-button mt-2 min-h-13 w-full rounded-[0.8rem] transition-[opacity,transform] active:scale-[0.99] disabled:opacity-50"
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
            className="native-secondary-button mt-3 min-h-12 w-full rounded-[0.8rem] text-muted-foreground disabled:opacity-50"
          >
            Resend link
          </button>
        )}
      </section>
    </AuthLayout>
  )
}
