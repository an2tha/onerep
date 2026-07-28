import { useEffect, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
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
  const [legalAccepted, setLegalAccepted] = useState(false)
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
    if (mode === "signup" && !legalAccepted) {
      setError("Confirm that you are at least 16 and accept the Terms")
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
            callbackURL: getEmailVerificationCallbackUrl(),
          })
        )
        if (error) {
          setError(betterAuthErrorMessage(error, "Sign up failed"))
          return
        }

        posthog.capture("user_signed_up", { method: "email" })
        rememberPendingVerification(trimmedEmail, "/onboarding")
        navigate("/verify-email-required", { replace: true })
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
    <div className="min-h-svh bg-background text-foreground lg:grid lg:grid-cols-[minmax(20rem,0.78fr)_minmax(32rem,1.22fr)]">
      <aside className="relative hidden min-h-svh flex-col justify-between overflow-hidden border-r border-border bg-[var(--surface-panel)] px-12 py-10 lg:flex xl:px-16 xl:py-14">
        <div className="flex items-center gap-3">
          <img src="/app-icon.svg" alt="" className="size-9" />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">
            OneRep
          </span>
        </div>

        <div className="max-w-md pb-[8vh]">
          <span className="mb-6 block h-px w-12 bg-foreground" />
          <p className="text-[clamp(2rem,3.25vw,3.75rem)] leading-[1.02] font-semibold tracking-[-0.055em] text-balance">
            Training.
            <br />
            Nutrition.
            <br />
            Progress.
          </p>
        </div>

        <span className="h-px w-full bg-border" />
      </aside>

      <main className="mx-auto flex min-h-svh w-full max-w-[31rem] flex-col px-6 pt-[calc(var(--app-safe-top)+1.5rem)] pb-[var(--app-safe-bottom-lg)] sm:px-10 lg:justify-center lg:py-16">
        <header className="mb-10">
          <div className="flex items-center gap-2.5 lg:hidden">
            <img src="/app-icon.svg" alt="" className="size-8" />
            <span className="text-[16px] font-semibold tracking-[-0.02em]">
              OneRep
            </span>
          </div>
          <div className="mt-[clamp(3.5rem,13vh,7.5rem)] lg:mt-0">
            <h1 className="text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.045em] sm:text-[2.6rem]">
              {mode === "signin" ? "Sign in to OneRep" : "Create your account"}
            </h1>
            <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
              {mode === "signin"
                ? "Pick up where you left off."
                : "It only takes a minute to get set up."}
            </p>
          </div>
        </header>

        <section aria-label={mode === "signin" ? "Sign in" : "Create account"}>
          <form onSubmit={handleSubmit} className="space-y-5">
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
                  I confirm that I am at least 16 and agree to the{" "}
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

            {mode === "signin" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={submitting}
                  className="-my-2 flex min-h-11 items-center text-[14px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:opacity-60 disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
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

          <p className="mt-8 text-center text-[14px] text-muted-foreground">
            {mode === "signin" ? "New here?" : "Have an account?"}{" "}
            <button
              type="button"
              onClick={() =>
                switchMode(mode === "signin" ? "signup" : "signin")
              }
              disabled={submitting}
              className="inline-flex min-h-10 items-center px-1 font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground active:opacity-60 disabled:opacity-50"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </section>
      </main>
    </div>
  )
}
