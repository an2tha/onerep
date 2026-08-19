import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  AUTH_CARD_CLASS,
  AuthLayout,
  AuthMark,
  GoogleMark,
} from "@/components/auth-shell"
import { useSearchParams } from "react-router"
import { useConvexAuth } from "convex/react"
import { CaretDown, Eye, EyeSlash } from "@phosphor-icons/react"
import { safeAuthRedirectPath } from "@/lib/auth-session"
import {
  authClient,
  betterAuthErrorMessage,
  isEmailNotVerifiedError,
  useAppAuth,
  useSocialProviders,
} from "@/lib/auth-client"
import { isNativeOAuthPlatform, openNativeOAuth } from "@/lib/native-oauth"
import { hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { usePostHog } from "@posthog/react"
import { captureFeatureUsage } from "@/lib/analytics"
import {
  getAuthCallbackUrl,
  getEmailVerificationCallbackUrl,
  getSocialCallbackUrl,
  rememberPendingVerification,
} from "@/lib/auth-redirects"
import { ServerPicker, currentServerLabel } from "@/components/server-picker"

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
      <section aria-labelledby="auth-redirect-title">
        <div className="mb-6 h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        <h1 id="auth-redirect-title" className="app-title">
          Opening OneRep
        </h1>
        <p className="native-supporting mt-2">
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
      data-active={active}
      disabled={disabled}
      onClick={onSelect}
      className="app-segmented-button motion-tactile disabled:opacity-50"
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
  // Better Auth bounces failed social sign-ins back here with its own error
  // code in the query, so any `error` param means an OAuth round trip broke.
  const [error, setError] = useState<string | undefined>(
    searchParams.has("error")
      ? "Sign-in did not complete. Try again, or use your email and password."
      : undefined
  )
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [oidcLoading, setOidcLoading] = useState(false)
  const [serverPickerOpen, setServerPickerOpen] = useState(false)
  const authActionRef = useRef(false)
  const socialProviders = useSocialProviders()
  // Google's OAuth pages refuse to load inside an embedded webview, which is
  // why this button was hidden on native for a while. `native-oauth.ts` now
  // sends the consent screen to the system browser, so it is offered again.
  const googleAvailable = socialProviders?.google === true
  // Self-hosted identity providers do not carry Google's webview ban, so the
  // OIDC button stays on everywhere.
  const oidcAvailable = socialProviders?.oidc === true
  const oidcName = socialProviders?.oidcName ?? "SSO"
  const submitting = loading || googleLoading || oidcLoading
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

  async function handleGoogleSignIn() {
    if (redirectIfSignedIn()) return

    setError(undefined)
    setMessage(undefined)
    if (mode === "signup" && !legalAccepted) {
      setError("Confirm that you are at least 13 and accept the Terms")
      return
    }
    if (authActionRef.current || submitting) return

    authActionRef.current = true
    setGoogleLoading(true)

    try {
      // Google rejects its own consent screen inside an embedded WebView, so
      // the native shells ask for the URL and hand it to the system browser
      // instead of following the redirect in place.
      const native = isNativeOAuthPlatform()
      const { data, error } = await withAuthActionTimeout(
        "Sign in",
        authClient.signIn.social({
          provider: "google",
          callbackURL: getSocialCallbackUrl(nextPath),
          newUserCallbackURL: getSocialCallbackUrl("/onboarding", {
            isNewUser: true,
          }),
          errorCallbackURL: getAuthCallbackUrl("/login"),
          ...(native ? { disableRedirect: true } : {}),
        })
      )
      if (error) {
        setError(betterAuthErrorMessage(error, "Google sign-in failed"))
        return
      }

      if (native) {
        const url = (data as { url?: string } | null)?.url
        if (!url) {
          setError("Google sign-in failed")
          return
        }
        await openNativeOAuth(url)
      }

      // The browser is on its way to Google; keep the button busy so the page
      // does not flash back to an idle state before it unloads.
      setMessage("Opening Google…")
      return
    } catch (error) {
      setError(
        betterAuthErrorMessage(
          error,
          "Could not reach Google. Check your connection and try again."
        )
      )
    } finally {
      authActionRef.current = false
      setGoogleLoading(false)
    }
  }

  async function handleOidcSignIn() {
    if (redirectIfSignedIn()) return

    setError(undefined)
    setMessage(undefined)
    if (mode === "signup" && !legalAccepted) {
      setError("Confirm that you are at least 13 and accept the Terms")
      return
    }
    if (authActionRef.current || submitting) return

    authActionRef.current = true
    setOidcLoading(true)

    try {
      const native = isNativeOAuthPlatform()
      const { data, error } = await withAuthActionTimeout(
        "Sign in",
        authClient.signIn.oauth2({
          providerId: "oidc",
          callbackURL: getSocialCallbackUrl(nextPath),
          newUserCallbackURL: getSocialCallbackUrl("/onboarding", {
            isNewUser: true,
          }),
          errorCallbackURL: getAuthCallbackUrl("/login"),
          ...(native ? { disableRedirect: true } : {}),
        })
      )
      if (error) {
        setError(betterAuthErrorMessage(error, `${oidcName} sign-in failed`))
        return
      }

      if (native) {
        const url = (data as { url?: string } | null)?.url
        if (!url) {
          setError(`${oidcName} sign-in failed`)
          return
        }
        await openNativeOAuth(url)
      }

      // Same as Google: the browser is leaving for the identity provider, so
      // keep the button busy until the page unloads.
      setMessage(`Opening ${oidcName}…`)
      return
    } catch (error) {
      setError(
        betterAuthErrorMessage(
          error,
          `Could not reach ${oidcName}. Check your connection and try again.`
        )
      )
    } finally {
      authActionRef.current = false
      setOidcLoading(false)
    }
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
        // When the deployment does not require email verification, sign-up
        // returns an active session and the verify screen would be a dead end.
        const session = await authClient.getSession()
        if (session.data?.session) {
          setMessage("Account created. Opening OneRep…")
          return
        }
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
      <header className="text-center">
        <AuthMark />
        <div
          key={mode}
          data-transition-direction={modeDirection}
          className="auth-mode-panel"
        >
          <h1 className="app-title mt-7">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="native-supporting mx-auto mt-2 max-w-[32ch] text-balance">
            {mode === "signin"
              ? "Sign in to pick up where you left off."
              : "Training, nutrition, and progress in one place."}
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
          className="app-segmented mb-6 grid-cols-2"
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

        <form
          key={mode}
          data-transition-direction={modeDirection}
          onSubmit={handleSubmit}
          className="auth-mode-panel space-y-4"
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
              className="native-field-error border-y border-border py-3"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              className="native-supporting border-y border-border py-3"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            aria-busy={loading}
            className="native-primary-button mt-2 min-h-12 w-full rounded-[0.8rem]"
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

        {(googleAvailable || oidcAvailable) && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="native-row-detail">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3">
              {googleAvailable && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                  aria-busy={googleLoading}
                  className="native-secondary-button min-h-12 w-full rounded-[0.8rem]"
                >
                  <GoogleMark />
                  {googleLoading ? "Opening Google…" : "Continue with Google"}
                </button>
              )}

              {oidcAvailable && (
                <button
                  type="button"
                  onClick={handleOidcSignIn}
                  disabled={submitting}
                  aria-busy={oidcLoading}
                  className="native-secondary-button min-h-12 w-full rounded-[0.8rem]"
                >
                  {oidcLoading
                    ? `Opening ${oidcName}…`
                    : `Continue with ${oidcName}`}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <footer className="mt-9 border-t border-border pt-2">
        <button
          type="button"
          onClick={() => {
            hapticSelection()
            setServerPickerOpen((open) => !open)
          }}
          disabled={submitting}
          aria-expanded={serverPickerOpen}
          aria-controls="server-picker"
          className="motion-tactile flex min-h-12 w-full items-center justify-between gap-3 text-left disabled:opacity-50"
        >
          <span className="native-row-title">Server</span>
          <span className="flex items-center gap-1.5">
            <span className="native-row-value text-muted-foreground">
              {currentServerLabel()}
            </span>
            <CaretDown
              size={14}
              weight="bold"
              className={`text-muted-foreground transition-transform duration-200 ${
                serverPickerOpen ? "rotate-180" : ""
              }`}
            />
          </span>
        </button>

        {/*
          A grid whose single row animates between 0fr and 1fr: the panel
          measures itself, so the open height is never hard-coded and never
          goes stale the way a JS-measured height does. It stays mounted so
          the transition has something to run on, and `inert` keeps the
          collapsed copy out of the tab order and off screen readers.
        */}
        <div
          id="server-picker"
          className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            serverPickerOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div
              inert={!serverPickerOpen}
              className={`pt-1 pb-4 transition-opacity duration-200 motion-reduce:transition-none ${
                serverPickerOpen ? "opacity-100" : "opacity-0"
              }`}
            >
              <ServerPicker disabled={submitting} />
            </div>
          </div>
        </div>

        <p className="native-row-detail border-t border-border py-4 text-center">
          Your data stays private and is never sold.
        </p>
      </footer>
    </AuthLayout>
  )
}
