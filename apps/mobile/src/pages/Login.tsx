import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  AUTH_CARD_CLASS,
  AuthLayout,
  AuthMark,
  AuthModeCard,
} from "@/components/auth-shell"
import { useSearchParams } from "react-router"
import { useConvexAuth } from "convex/react"
import { Eye, EyeSlash } from "@phosphor-icons/react"
import { safeAuthRedirectPath } from "@/lib/auth-session"
import {
  authClient,
  betterAuthErrorMessage,
  isEmailNotVerifiedError,
  useAppAuth,
} from "@/lib/auth-client"
import { hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { usePostHog } from "@posthog/react"
import { captureFeatureUsage } from "@/lib/analytics"
import {
  getAuthCallbackUrl,
  getEmailVerificationCallbackUrl,
  rememberPendingVerification,
} from "@/lib/auth-redirects"

type LoginMode = "signin" | "signup"

const FIELD_CLASS = "native-field"
const LABEL_CLASS = "native-field-label"
const INPUT_CLASS = "native-input disabled:opacity-60"
const AUTH_ACTION_TIMEOUT_MS = 20_000

function authActionTimeoutMessage(label: string) {
  return `${label} is taking too long. Check your connection and try again.`
}

async function withAuthActionTimeout<T>(label: string, action: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      action,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(authActionTimeoutMessage(label)))
        }, AUTH_ACTION_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function AuthRedirectFallback() {
  return (
    <AuthLayout>
      <section aria-labelledby="auth-redirect-title" className="text-center">
        <div className="mx-auto mb-6 h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        <h1 id="auth-redirect-title" className="native-large-title">
          Opening OneRep
        </h1>
        <p className="native-body mt-3 text-muted-foreground">
          Your sign-in is ready. Sending you back to where you left off.
        </p>
      </section>
    </AuthLayout>
  )
}

function ModeTab({
  active,
  disabled,
  onSelect,
  children,
}: {
  active: boolean
  disabled: boolean
  onSelect: () => void
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onSelect}
      className={`min-h-10 flex-1 rounded-[0.55rem] text-[14px] font-semibold transition-[background,color,box-shadow] disabled:opacity-50 ${
        active
          ? "bg-[var(--surface-raised)] text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.14)]"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

export default function Login() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const posthog = usePostHog()
  const { isLoaded: authLoaded, isSignedIn } = useAppAuth()
  const convexAuth = useConvexAuth()
  const requestedMode =
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  const nextPath = safeAuthRedirectPath(searchParams.get("next"))
  const [mode, setMode] = useState<LoginMode>(requestedMode)
  const [modeDirection, setModeDirection] = useState<"forward" | "back">(
    "forward"
  )
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const authActionRef = useRef(false)
  const submitting = loading
  const redirectingSignedInUser = authLoaded && isSignedIn
  const authenticatedHandoffReady =
    redirectingSignedInUser && convexAuth.isAuthenticated

  useEffect(() => {
    if (authenticatedHandoffReady) {
      navigate(nextPath, { replace: true })
    }
  }, [authenticatedHandoffReady, navigate, nextPath])

  function redirectIfSignedIn() {
    if (!isSignedIn) return false
    if (convexAuth.isAuthenticated) {
      navigate(nextPath, { replace: true })
    } else {
      setMessage("Finishing your secure sign-in…")
    }
    return true
  }

  function switchMode(nextMode: LoginMode) {
    if (nextMode === mode) return
    hapticSelection()
    setModeDirection(nextMode === "signup" ? "forward" : "back")
    setMode(nextMode)
    setError(undefined)
    setMessage(undefined)
    setShowPassword(false)
  }

  function handlePasswordReset() {
    setError(undefined)
    setMessage(undefined)
    const trimmed = email.trim()
    navigate(
      trimmed
        ? `/reset-password?email=${encodeURIComponent(trimmed)}`
        : "/reset-password",
      { replace: false }
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (redirectIfSignedIn()) return

    setError(undefined)
    setMessage(undefined)
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Enter your email")
      return
    }
    if (mode === "signup" && !legalAccepted) {
      setError("Confirm that you are at least 13 and accept the Terms")
      return
    }
    if (authActionRef.current || submitting) return

    authActionRef.current = true
    setLoading(true)

    try {
      if (mode === "signin") {
        const { error } = await withAuthActionTimeout(
          "Sign in",
          authClient.signIn.email({
            email: trimmedEmail,
            password,
            rememberMe: true,
            callbackURL: getAuthCallbackUrl(nextPath),
          })
        )
        if (error) {
          if (isEmailNotVerifiedError(error)) {
            rememberPendingVerification(trimmedEmail, nextPath)
            navigate("/verify-email-required", { replace: true })
            return
          }
          setError(betterAuthErrorMessage(error, "Sign in failed"))
          return
        }

        captureFeatureUsage(posthog, "user_signed_in", { method: "email" })
        setMessage("Sign-in accepted. Opening OneRep…")
        return
      } else {
        const displayName = name.trim() || trimmedEmail.split("@")[0]
        const { error } = await withAuthActionTimeout(
          "Sign up",
          authClient.signUp.email({
            name: displayName,
            email: trimmedEmail,
            password,
            callbackURL: getEmailVerificationCallbackUrl(),
          })
        )
        if (error) {
          setError(betterAuthErrorMessage(error, "Sign up failed"))
          return
        }

        captureFeatureUsage(posthog, "user_signed_up", { method: "email" })
        rememberPendingVerification(trimmedEmail, "/onboarding")
        navigate("/verify-email-required", { replace: true })
        return
      }
    } catch (error) {
      setError(
        betterAuthErrorMessage(
          error,
          "Something went wrong. Check your details and try again."
        )
      )
    } finally {
      authActionRef.current = false
      setLoading(false)
    }
  }

  if (redirectingSignedInUser) {
    return <AuthRedirectFallback />
  }

  return (
    <AuthLayout>
      <header className="mb-7 text-center">
        <AuthMark />
        <div
          key={mode}
          data-transition-direction={modeDirection}
          className="auth-mode-panel"
        >
          <h1 className="mt-5 text-[1.9rem] leading-[1.1] font-semibold tracking-[-0.04em]">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-balance text-muted-foreground">
            {mode === "signin"
              ? "Pick up where you left off."
              : "Training. Nutrition. Progress. All in one place."}
          </p>
        </div>
      </header>

      <section
        aria-label={mode === "signin" ? "Sign in" : "Create account"}
        className={AUTH_CARD_CLASS}
      >
        <div
          role="tablist"
          aria-label="Sign in or create account"
          className="mb-6 flex gap-1 rounded-[0.7rem] border border-border bg-[var(--surface-subtle)] p-1"
        >
          <ModeTab
            active={mode === "signin"}
            disabled={submitting}
            onSelect={() => switchMode("signin")}
          >
            Sign in
          </ModeTab>
          <ModeTab
            active={mode === "signup"}
            disabled={submitting}
            onSelect={() => switchMode("signup")}
          >
            Create account
          </ModeTab>
        </div>

        <AuthModeCard>
          <form
            key={mode}
            data-transition-direction={modeDirection}
            onSubmit={handleSubmit}
            className="auth-mode-panel space-y-5"
          >
            {mode === "signup" ? (
              <label className={FIELD_CLASS}>
                <span className={LABEL_CLASS}>Name</span>
                <input
                  type="text"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  required
                  autoComplete="name"
                  disabled={submitting}
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}

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
                disabled={submitting}
                className={INPUT_CLASS}
              />
            </label>

            <label className={FIELD_CLASS}>
              <span className="flex items-baseline justify-between gap-3">
                <span className={LABEL_CLASS}>Password</span>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={submitting}
                    className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:opacity-60 disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                )}
              </span>
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  disabled={submitting}
                  className={`${INPUT_CLASS} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={submitting}
                  className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:opacity-60 disabled:opacity-40"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeSlash size={18} weight="bold" />
                  ) : (
                    <Eye size={18} weight="bold" />
                  )}
                </button>
              </span>
              {mode === "signup" && (
                <span className="native-field-hint">At least 8 characters</span>
              )}
            </label>

            {mode === "signup" && (
              <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-5 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(event) => setLegalAccepted(event.target.checked)}
                  required
                  disabled={submitting}
                  className="mt-0.5 size-4 shrink-0 accent-foreground"
                />
                <span>
                  I confirm that I am at least 13 and agree to the{" "}
                  <a
                    href="https://onerep.life/terms"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-foreground underline decoration-border underline-offset-4"
                  >
                    Terms and Conditions
                  </a>
                  . I acknowledge the{" "}
                  <a
                    href="https://onerep.life/privacy"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-foreground underline decoration-border underline-offset-4"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
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

            <button
              type="submit"
              disabled={submitting}
              aria-busy={loading}
              className="native-primary-button mt-2 min-h-13 w-full rounded-[0.8rem] transition-[opacity,transform] active:scale-[0.99]"
            >
              {loading
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </AuthModeCard>
      </section>

      <p className="mt-6 text-center text-[13px] leading-5 text-muted-foreground">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button
              type="button"
              onClick={() => switchMode("signup")}
              disabled={submitting}
              className="font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground active:opacity-60 disabled:opacity-50"
            >
              Create an account
            </button>
          </>
        ) : (
          "Your data stays private and is never sold."
        )}
      </p>
    </AuthLayout>
  )
}
