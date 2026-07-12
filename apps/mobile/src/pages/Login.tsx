import { useEffect, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
import { Eye, EyeSlash } from "@phosphor-icons/react"
import { safeAuthRedirectPath } from "@/lib/auth-session"
import {
  authClient,
  betterAuthErrorMessage,
  useAppAuth,
} from "@/lib/auth-client"
import { hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { usePostHog } from "@posthog/react"

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
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center bg-background px-6 py-10">
      <section aria-labelledby="auth-redirect-title">
        <div className="mb-5 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        <h1 id="auth-redirect-title" className="native-large-title">
          Opening OneRep
        </h1>
        <p className="native-body mt-3 text-muted-foreground">
          Your sign-in is ready. Sending you back to where you left off.
        </p>
      </section>
    </main>
  )
}

export default function Login() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const posthog = usePostHog()
  const { isLoaded: authLoaded, isSignedIn } = useAppAuth()
  const requestedMode =
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  const nextPath = safeAuthRedirectPath(searchParams.get("next"))
  const [mode, setMode] = useState<LoginMode>(requestedMode)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const authActionRef = useRef(false)
  const submitting = loading
  const redirectingSignedInUser = authLoaded && isSignedIn

  useEffect(() => {
    if (redirectingSignedInUser) {
      navigate(nextPath, { replace: true })
    }
  }, [navigate, nextPath, redirectingSignedInUser])

  function redirectIfSignedIn() {
    if (!isSignedIn) return false
    navigate(nextPath, { replace: true })
    return true
  }

  function switchMode(nextMode: LoginMode) {
    hapticSelection()
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
          })
        )
        if (error) {
          setError(betterAuthErrorMessage(error, "Sign in failed"))
          return
        }

        posthog.identify(trimmedEmail, { email: trimmedEmail })
        posthog.capture("user_signed_in", { method: "email" })
        navigate(nextPath, { replace: true })
        return
      } else {
        const displayName = name.trim() || trimmedEmail.split("@")[0]
        const { error } = await withAuthActionTimeout(
          "Sign up",
          authClient.signUp.email({
            name: displayName,
            email: trimmedEmail,
            password,
          })
        )
        if (error) {
          setError(betterAuthErrorMessage(error, "Sign up failed"))
          return
        }

        posthog.identify(trimmedEmail, {
          email: trimmedEmail,
          name: displayName,
        })
        posthog.capture("user_signed_up", { method: "email" })
        navigate("/onboarding", { replace: true })
        return
      }
    } catch (error) {
      setError(betterAuthErrorMessage(error, "Authentication failed"))
    } finally {
      authActionRef.current = false
      setLoading(false)
    }
  }

  if (redirectingSignedInUser) {
    return <AuthRedirectFallback />
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col px-6 pt-[calc(var(--app-safe-top)+2.5rem)] pb-[var(--app-safe-bottom-lg)]">
        <header className="mb-8">
          <div className="flex items-center gap-2.5">
            <img src="/app-icon.svg" alt="" className="size-8" />
            <span className="native-row-title font-semibold">OneRep</span>
          </div>
          <h1 className="native-large-title mt-8">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <p className="native-body mt-2 text-muted-foreground">
            {mode === "signin"
              ? "Continue to your training and nutrition log."
              : "Set up your profile, then choose your starting targets."}
          </p>
        </header>

        <section>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <span className={LABEL_CLASS}>Password</span>
              <span className="flex items-center gap-2">
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
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={submitting}
                  className="native-toolbar-button h-11 w-11 shrink-0 border border-border text-muted-foreground disabled:opacity-40"
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

            {mode === "signin" && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={submitting}
                  className="flex min-h-11 items-center text-left text-[14px] font-semibold text-muted-foreground transition-colors active:text-foreground disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
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

            <button
              type="submit"
              disabled={submitting}
              aria-busy={loading}
              className="native-primary-button min-h-12 w-full"
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

          <p className="mt-6 border-t border-border pt-5 text-[14px] text-muted-foreground">
            {mode === "signin" ? "New here?" : "Have an account?"}{" "}
            <button
              type="button"
              onClick={() =>
                switchMode(mode === "signin" ? "signup" : "signin")
              }
              disabled={submitting}
              className="inline-flex min-h-10 items-center px-1 font-semibold text-foreground/85 transition-opacity active:opacity-60 disabled:opacity-50"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </section>
      </main>
    </div>
  )
}
