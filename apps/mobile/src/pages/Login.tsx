import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useSearchParams } from "react-router"
import { AppleLogo, Eye, EyeSlash, GoogleLogo } from "@phosphor-icons/react"
import { safeAuthRedirectPath } from "@/lib/auth-session"
import {
  authClient,
  betterAuthErrorMessage,
  useAppAuth,
} from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { usePostHog } from "@posthog/react"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

type LoginMode = "signin" | "signup"
type OAuthStrategy = "oauth_google" | "oauth_apple"

const FIELD_CLASS =
  "block rounded-[10px] border border-border/60 bg-background px-4 py-3 transition-colors focus-within:border-foreground/25 focus-within:bg-card short-phone:py-2.5"
const LABEL_CLASS =
  "block text-[9.5px] font-semibold tracking-[0.18em] text-muted-foreground/60 uppercase"
const INPUT_CLASS =
  "mt-1.5 min-h-10 w-full bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-muted-foreground/35 disabled:opacity-60"
const CODE_INPUT_CLASS =
  "mt-2 min-h-10 w-full bg-transparent text-[22px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/25 disabled:opacity-60"
const PRELOGIN_SEEN_KEY = "onerep:prelogin-onboarding-seen"
const AUTH_ACTION_TIMEOUT_MS = 20_000

const OAUTH_PROVIDERS: {
  label: string
  strategy: OAuthStrategy
  icon: typeof GoogleLogo
  disabled?: boolean
}[] = [
  { label: "Google", strategy: "oauth_google", icon: GoogleLogo, disabled: true },
  { label: "Apple", strategy: "oauth_apple", icon: AppleLogo },
]

const INTRO_SLIDES = [
  {
    kicker: "Track",
    title: "One log for the day.",
    body: "Workouts, food, water, progress.",
  },
  {
    kicker: "Consistency",
    title: "Fast, even offline.",
    body: "Log quickly. Sync when you are back.",
  },
  {
    kicker: "Ownership",
    title: "Free. Private. Yours.",
    body: "Export, delete, and control analytics anytime.",
  },
]

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

function IntroIllustration({ index }: { index: number }) {
  const rows = [
    [
      ["Breakfast", "620 kcal", "var(--accent-food)"],
      ["Workout", "Upper A", "var(--accent-workout)"],
      ["Water", "1.5 L", "var(--accent-water)"],
    ],
    [
      ["Offline queue", "2 saved", "var(--accent-supplement)"],
      ["Last sync", "12:44", "var(--accent-water)"],
      ["Next", "Push when online", "var(--muted-foreground)"],
    ],
    [
      ["Analytics", "Off", "var(--accent-progress)"],
      ["Export", "Ready", "var(--accent-supplement)"],
      ["Device", "Local cache", "var(--muted-foreground)"],
    ],
  ][index]

  return (
    <div
      className="app-rail-surface mx-auto w-full max-w-[19rem] px-4 py-3.5"
      style={{ "--rail-color": rows[0][2] } as React.CSSProperties}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <span className="app-eyebrow text-muted-foreground/60">
          Today ledger
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground/45">
          OneRep
        </span>
      </div>
      <div className="divide-y divide-border/35">
        {rows.map(([label, value, color]) => (
          <div key={label} className="flex items-center gap-3 py-2.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">
              {label}
            </span>
            <span className="text-[12px] font-semibold text-muted-foreground/65 tabular-nums">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AuthRedirectFallback() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center bg-background px-5 text-center">
      <section className="app-rail-surface p-5">
        <div className="mx-auto mb-4 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        <h1 className="text-[1.25rem] font-semibold tracking-tight">
          Opening OneRep
        </h1>
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground/70">
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
  const [showIntro, setShowIntro] = useState(() => {
    if (searchParams.has("mode")) return false
    if (typeof window === "undefined") return false
    return safeLocalStorageGet(PRELOGIN_SEEN_KEY) !== "true"
  })
  const [introIndex, setIntroIndex] = useState(0)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationMode, setVerificationMode] = useState<
    "signup" | "signin" | null
  >(null)
  const [pendingEmail, setPendingEmail] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<OAuthStrategy | null>(null)
  const authActionRef = useRef(false)
  const submitting = loading || oauthLoading !== null
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
    setMode(nextMode)
    setError(undefined)
    setMessage(undefined)
    setVerificationCode("")
    setVerificationMode(null)
    setPendingEmail("")
    setShowPassword(false)
  }

  function finishIntro(nextMode: LoginMode) {
    if (typeof window !== "undefined") {
      safeLocalStorageSet(PRELOGIN_SEEN_KEY, "true")
    }
    switchMode(nextMode)
    setShowIntro(false)
  }

  function handleIntroNext() {
    if (introIndex < INTRO_SLIDES.length - 1) {
      setIntroIndex((current) => current + 1)
      return
    }

    finishIntro("signup")
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

  async function handleOAuth(strategy: OAuthStrategy) {
    if (authActionRef.current || submitting) return
    if (redirectIfSignedIn()) return

    const provider = OAUTH_PROVIDERS.find((item) => item.strategy === strategy)
    const providerLabel = provider?.label ?? "OAuth"

    authActionRef.current = true
    setError(undefined)
    setMessage(undefined)
    setVerificationCode("")
    setVerificationMode(null)
    setPendingEmail("")
    setShowPassword(false)
    setOauthLoading(strategy)

    try {
      setError(
        `${providerLabel} sign-in is not configured in Better Auth yet. Use email and password for now.`
      )
    } catch (error) {
      setError(
        betterAuthErrorMessage(error, `Could not continue with ${providerLabel}`)
      )
    } finally {
      authActionRef.current = false
      setOauthLoading(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (redirectIfSignedIn()) return

    if (verificationMode) {
      await handleVerificationSubmit()
      return
    }

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

  async function handleVerificationSubmit() {
    if (authActionRef.current || submitting) return
    if (redirectIfSignedIn()) return

    setError(undefined)
    setMessage(undefined)
    if (!verificationCode.trim()) {
      setError("Enter the code from your email")
      return
    }

    authActionRef.current = true
    setLoading(true)
    try {
      setVerificationMode(null)
      setVerificationCode("")
      setMessage("Email verification codes are not required right now.")
    } catch (error) {
      setError(betterAuthErrorMessage(error, "Verification failed"))
    } finally {
      authActionRef.current = false
      setLoading(false)
    }
  }

  async function handleResendCode() {
    if (!verificationMode) return
    if (authActionRef.current || submitting) return
    if (redirectIfSignedIn()) return

    authActionRef.current = true
    setLoading(true)
    setError(undefined)
    setMessage(undefined)
    try {
      setVerificationMode(null)
      setMessage("Email verification codes are not required right now.")
    } catch (error) {
      setError(betterAuthErrorMessage(error, "Could not send code"))
    } finally {
      authActionRef.current = false
      setLoading(false)
    }
  }

  if (redirectingSignedInUser) {
    return <AuthRedirectFallback />
  }

  if (showIntro) {
    const slide = INTRO_SLIDES[introIndex] ?? INTRO_SLIDES[0]
    const isLastSlide = introIndex === INTRO_SLIDES.length - 1

    return (
      <div className="min-h-svh bg-background text-foreground">
        <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col px-5 py-[var(--app-safe-bottom-lg)] short-phone:max-w-[23rem] short-phone:px-5">
          <header className="flex items-center justify-center pt-4 short-phone:pt-1">
            <div className="flex items-center gap-2.5">
              <img
                src="/app-icon.svg"
                alt=""
                className="h-8 w-8 rounded-full"
              />
              <span className="text-[13px] font-semibold">
                OneRep
              </span>
            </div>
          </header>

          <section
            className="flex flex-1 flex-col justify-center"
            aria-live="polite"
          >
            <IntroIllustration index={introIndex} />

            <div className="mt-8 text-center short-phone:mt-5">
              <p className="app-eyebrow text-muted-foreground/65">
                {slide.kicker}
              </p>
              <h1 className="app-display mt-3 text-[2.15rem] short-phone:mt-2 short-phone:text-[1.72rem]">
                {slide.title}
              </h1>
              <p className="mx-auto mt-3 max-w-[240px] text-[14px] leading-6 text-muted-foreground/70 short-phone:mt-2 short-phone:text-[13px] short-phone:leading-5">
                {slide.body}
              </p>
            </div>

            <div className="mt-8 flex justify-center gap-2 short-phone:mt-5">
              {INTRO_SLIDES.map((item, index) => (
                <button
                  key={item.kicker}
                  type="button"
                  aria-label={`Show ${item.kicker}`}
                  onClick={() => setIntroIndex(index)}
                  className="flex h-10 w-10 items-center justify-center rounded-[8px] transition-colors active:bg-muted/45"
                >
                  <span
                    className={[
                      "h-1.5 rounded-full transition-all",
                      index === introIndex
                        ? "w-6 bg-foreground"
                        : "w-1.5 bg-muted-foreground/25",
                    ].join(" ")}
                  />
                </button>
              ))}
            </div>
          </section>

          <div className="space-y-3 short-phone:space-y-2">
            <button
              type="button"
              onClick={handleIntroNext}
              className="h-[52px] w-full rounded-[10px] bg-foreground text-[15px] font-semibold text-background transition-opacity active:opacity-75 short-phone:h-12"
            >
              {isLastSlide ? "Get started" : "Next"}
            </button>
            <button
              type="button"
              onClick={() => finishIntro("signin")}
              className="h-[48px] w-full rounded-[10px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/50 active:text-foreground short-phone:h-10"
            >
              Sign in
            </button>
          </div>
        </main>
      </div>
    )
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
          <div className="app-segmented mb-3 grid-cols-2 short-phone:mb-2.5">
            {(["signin", "signup"] as LoginMode[]).map((item) => {
              const active = mode === item
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchMode(item)}
                  className={[
                    "app-segmented-button h-10 text-[12px] transition-all short-phone:h-9",
                    active
                      ? "bg-background text-foreground shadow-sm shadow-black/[0.04]"
                      : "text-muted-foreground active:text-foreground",
                  ].join(" ")}
                  data-active={active}
                >
                  {item === "signin" ? "Sign in" : "Sign up"}
                </button>
              )
            })}
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-2.5 short-phone:space-y-2"
          >
            {verificationMode ? (
              <>
                <div className="rounded-[10px] border border-border/60 bg-background px-4 py-3">
                  <p className={LABEL_CLASS}>Email code</p>
                  <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground/65">
                    Enter the 6-digit code sent to{" "}
                    {pendingEmail || "your email"}.
                  </p>
                </div>
                <label className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>Code</span>
                  <input
                    type="text"
                    name="one-time-code"
                    inputMode="numeric"
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(event.target.value)
                    }
                    placeholder="123456"
                    maxLength={6}
                    pattern="[0-9]*"
                    required
                    autoComplete="one-time-code"
                    disabled={submitting}
                    className={CODE_INPUT_CLASS}
                  />
                </label>
              </>
            ) : mode === "signup" ? (
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

            {!verificationMode && (
              <>
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
                      className="mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground/60 transition-colors active:bg-muted/45 active:text-foreground disabled:opacity-40"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <EyeSlash size={18} weight="bold" />
                      ) : (
                        <Eye size={18} weight="bold" />
                      )}
                    </button>
                  </span>
                </label>
              </>
            )}

            {mode === "signin" && !verificationMode && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={submitting}
                  className="flex min-h-10 items-center text-left text-[12.5px] font-semibold text-muted-foreground/65 transition-colors active:text-foreground disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
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

            <button
              type="submit"
              disabled={submitting}
              className="h-[52px] w-full rounded-[10px] bg-foreground text-[15px] font-semibold text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:h-12"
            >
              {loading
                ? verificationMode
                  ? "Checking…"
                  : mode === "signin"
                    ? "Signing in…"
                    : "Creating…"
                : verificationMode
                  ? "Verify code"
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
            </button>
          </form>

          {verificationMode ? (
            <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground/60 short-phone:mt-3">
              <button
                type="button"
                onClick={() => void handleResendCode()}
                disabled={submitting}
                className="inline-flex min-h-10 items-center px-1 font-semibold text-foreground/85 transition-opacity active:opacity-60 disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => switchMode(mode)}
                disabled={submitting}
                className="inline-flex min-h-10 items-center px-1 font-semibold text-foreground/85 transition-opacity active:opacity-60 disabled:opacity-50"
              >
                Start over
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-3 short-phone:mt-3 short-phone:space-y-2.5">
                <div
                  className="flex items-center gap-3 px-1"
                  aria-hidden="true"
                >
                  <span className="h-px flex-1 bg-border/70" />
                  <span className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground/45 uppercase">
                    or
                  </span>
                  <span className="h-px flex-1 bg-border/70" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {OAUTH_PROVIDERS.map((provider) => {
                    const Icon = provider.icon
                    const isProviderLoading = oauthLoading === provider.strategy
                    const disabled = submitting || Boolean(provider.disabled)

                    return (
                      <button
                        key={provider.strategy}
                        type="button"
                        onClick={() => {
                          if (provider.disabled) return
                          void handleOAuth(provider.strategy)
                        }}
                        disabled={disabled}
                        aria-label={`Continue with ${provider.label}`}
                        aria-disabled={disabled}
                        className="flex h-12 items-center justify-center gap-2 rounded-[10px] border border-border/70 bg-background text-[13px] font-semibold text-foreground transition-colors active:bg-muted/55 disabled:opacity-50 short-phone:h-11"
                      >
                        <Icon
                          size={18}
                          weight={
                            provider.strategy === "oauth_apple"
                              ? "fill"
                              : "bold"
                          }
                          aria-hidden="true"
                        />
                        <span>
                          {isProviderLoading
                            ? "Opening..."
                            : provider.disabled
                              ? `${provider.label} soon`
                              : provider.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="mt-4 text-center text-[13px] text-muted-foreground/60 short-phone:mt-3">
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
            </>
          )}
        </section>
      </main>
    </div>
  )
}
