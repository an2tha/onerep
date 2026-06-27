import {
  useEffect,
  useState,
  type FormEvent,
} from "react"
import { useAuth, useSignIn, useSignUp } from "@clerk/react"
import { AppleLogo, GoogleLogo } from "@phosphor-icons/react"
import { getAuthCallbackUrl } from "@/lib/auth-redirects"
import { useSmoothNavigate } from "@/lib/navigation"
import { usePostHog } from "@posthog/react"

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
const SSO_CALLBACK_PATH = "/sso-callback"

const OAUTH_PROVIDERS: {
  label: string
  strategy: OAuthStrategy
  icon: typeof GoogleLogo
}[] = [
  { label: "Google", strategy: "oauth_google", icon: GoogleLogo },
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
      className="mx-auto px-4 py-3.5 w-full max-w-[19rem] app-rail-surface"
      style={{ "--rail-color": rows[0][2] } as React.CSSProperties}
    >
      <div className="flex justify-between items-baseline mb-3">
        <span className="text-muted-foreground/60 app-eyebrow">
          Today ledger
        </span>
        <span className="font-semibold text-[10px] text-muted-foreground/45">
          OneRep
        </span>
      </div>
      <div className="divide-y divide-border/35">
        {rows.map(([label, value, color]) => (
          <div key={label} className="flex items-center gap-3 py-2.5">
            <span
              className="rounded-full w-2 h-2 shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="flex-1 min-w-0 font-semibold text-[13px] text-left truncate">
              {label}
            </span>
            <span className="font-semibold tabular-nums text-[12px] text-muted-foreground/65">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Login() {
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()
  const [mode, setMode] = useState<LoginMode>("signin")
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(PRELOGIN_SEEN_KEY) !== "true"
  })
  const [introIndex, setIntroIndex] = useState(0)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationMode, setVerificationMode] = useState<
    "signup" | "signin" | null
  >(null)
  const [pendingEmail, setPendingEmail] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<OAuthStrategy | null>(null)
  const submitting = loading || oauthLoading !== null

  useEffect(() => {
    if (authLoaded && isSignedIn) {
      navigate("/", { replace: true })
    }
  }, [authLoaded, isSignedIn, navigate])

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode)
    setError(undefined)
    setMessage(undefined)
    setVerificationCode("")
    setVerificationMode(null)
    setPendingEmail("")
    void signIn?.reset()
    void signUp?.reset()
  }

  function finishIntro(nextMode: LoginMode) {
    if (typeof window !== "undefined") {
      localStorage.setItem(PRELOGIN_SEEN_KEY, "true")
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
    const provider = OAUTH_PROVIDERS.find((item) => item.strategy === strategy)
    const providerLabel = provider?.label ?? "OAuth"
    const finalPath = mode === "signup" ? "/onboarding" : "/"
    const callbackPath =
      mode === "signup"
        ? `${SSO_CALLBACK_PATH}?next=onboarding`
        : SSO_CALLBACK_PATH

    setError(undefined)
    setMessage(undefined)
    setVerificationCode("")
    setVerificationMode(null)
    setPendingEmail("")
    setOauthLoading(strategy)

    try {
      const result =
        mode === "signup"
          ? await signUp.sso({
              strategy,
              redirectCallbackUrl: getAuthCallbackUrl(callbackPath),
              redirectUrl: getAuthCallbackUrl(finalPath),
            })
          : await signIn.sso({
              strategy,
              redirectCallbackUrl: getAuthCallbackUrl(callbackPath),
              redirectUrl: getAuthCallbackUrl(finalPath),
            })

      if (result.error) {
        setError(
          clerkErrorMessage(
            result.error,
            `Could not continue with ${providerLabel}`
          )
        )
      }
    } catch (error) {
      setError(
        clerkErrorMessage(error, `Could not continue with ${providerLabel}`)
      )
    } finally {
      setOauthLoading(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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

    setLoading(true)

    try {
      if (mode === "signin") {
        const { error } = await signIn.password({
          identifier: trimmedEmail,
          password,
        })
        if (error) {
          setError(clerkErrorMessage(error, "Sign in failed"))
          return
        }

        if (signIn.status === "complete") {
          const finalized = await signIn.finalize()
          if (finalized.error) {
            setError(clerkErrorMessage(finalized.error, "Sign in failed"))
            return
          }
          posthog.identify(trimmedEmail, { email: trimmedEmail })
          posthog.capture("user_signed_in", { method: "email" })
          navigate("/", { replace: true })
          return
        }

        if (
          signIn.status === "needs_second_factor" ||
          signIn.status === "needs_client_trust"
        ) {
          const sent = await signIn.mfa.sendEmailCode()
          if (sent.error) {
            setError(clerkErrorMessage(sent.error, "Could not send code"))
            return
          }
          setPendingEmail(trimmedEmail)
          setVerificationMode("signin")
          return
        }

        setError("Sign in needs another verification step.")
        return
      } else {
        const displayName = name.trim() || trimmedEmail.split("@")[0]
        const [firstName, ...restName] = displayName.split(/\s+/)
        const { error } = await signUp.password({
          emailAddress: trimmedEmail,
          password,
          firstName,
          ...(restName.length > 0 ? { lastName: restName.join(" ") } : {}),
        })
        if (error) {
          setError(clerkErrorMessage(error, "Sign up failed"))
          return
        }

        if (signUp.status === "complete") {
          const finalized = await signUp.finalize()
          if (finalized.error) {
            setError(clerkErrorMessage(finalized.error, "Sign up failed"))
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

        const sent = await signUp.verifications.sendEmailCode()
        if (sent.error) {
          setError(clerkErrorMessage(sent.error, "Could not send code"))
          return
        }
        setPendingEmail(trimmedEmail)
        setVerificationMode("signup")
        return
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleVerificationSubmit() {
    setError(undefined)
    setMessage(undefined)
    if (!verificationCode.trim()) {
      setError("Enter the code from your email")
      return
    }

    setLoading(true)
    try {
      if (verificationMode === "signup") {
        const verified = await signUp.verifications.verifyEmailCode({
          code: verificationCode.trim(),
        })
        if (verified.error) {
          setError(clerkErrorMessage(verified.error, "Verification failed"))
          return
        }
        if (signUp.status !== "complete") {
          setError("Sign up needs another verification step.")
          return
        }
        const finalized = await signUp.finalize()
        if (finalized.error) {
          setError(clerkErrorMessage(finalized.error, "Sign up failed"))
          return
        }
        posthog.identify(pendingEmail, { email: pendingEmail, name })
        posthog.capture("user_signed_up", { method: "email" })
        navigate("/onboarding", { replace: true })
        return
      }

      if (verificationMode === "signin") {
        const verified = await signIn.mfa.verifyEmailCode({
          code: verificationCode.trim(),
        })
        if (verified.error) {
          setError(clerkErrorMessage(verified.error, "Verification failed"))
          return
        }
        if (signIn.status !== "complete") {
          setError("Sign in needs another verification step.")
          return
        }
        const finalized = await signIn.finalize()
        if (finalized.error) {
          setError(clerkErrorMessage(finalized.error, "Sign in failed"))
          return
        }
        posthog.identify(pendingEmail, { email: pendingEmail })
        posthog.capture("user_signed_in", { method: "email" })
        navigate("/", { replace: true })
        return
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResendCode() {
    if (!verificationMode) return
    setLoading(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const result =
        verificationMode === "signup"
          ? await signUp?.verifications.sendEmailCode()
          : await signIn?.mfa.sendEmailCode()
      if (result?.error) {
        setError(clerkErrorMessage(result.error, "Could not send code"))
        return
      }
      setMessage("A fresh code is on the way.")
    } finally {
      setLoading(false)
    }
  }

  if (showIntro) {
    const slide = INTRO_SLIDES[introIndex] ?? INTRO_SLIDES[0]
    const isLastSlide = introIndex === INTRO_SLIDES.length - 1

    return (
      <div className="bg-background min-h-svh text-foreground">
        <main className="py-[var(--app-safe-bottom-lg)] flex flex-col mx-auto px-5 short-phone:px-5 w-full short-phone:max-w-[23rem] max-w-sm min-h-svh">
          <header className="flex justify-center items-center pt-4 short-phone:pt-1">
            <div className="flex items-center gap-2.5">
              <img
                src="/app-icon.svg"
                alt=""
                className="rounded-full w-8 h-8"
              />
              <span className="font-semibold text-[13px]">
                OneRep
              </span>
            </div>
          </header>

          <section
            className="flex flex-col flex-1 justify-center"
            aria-live="polite"
          >
            <IntroIllustration index={introIndex} />

            <div className="mt-8 short-phone:mt-5 text-center">
              <p className="text-muted-foreground/65 app-eyebrow">
                {slide.kicker}
              </p>
              <h1 className="mt-3 short-phone:mt-2 text-[2.15rem] short-phone:text-[1.72rem] app-display">
                {slide.title}
              </h1>
              <p className="mx-auto mt-3 short-phone:mt-2 max-w-[240px] text-[14px] text-muted-foreground/70 short-phone:text-[13px] leading-6 short-phone:leading-5">
                {slide.body}
              </p>
            </div>

            <div className="flex justify-center gap-2 mt-8 short-phone:mt-5">
              {INTRO_SLIDES.map((item, index) => (
                <button
                  key={item.kicker}
                  type="button"
                  aria-label={`Show ${item.kicker}`}
                  onClick={() => setIntroIndex(index)}
                  className="flex justify-center items-center active:bg-muted/45 rounded-[8px] w-10 h-10 transition-colors"
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
              className="bg-foreground active:opacity-75 rounded-[10px] w-full h-[52px] short-phone:h-12 font-semibold text-[15px] text-background transition-opacity"
            >
              {isLastSlide ? "Get started" : "Next"}
            </button>
            <button
              type="button"
              onClick={() => finishIntro("signin")}
              className="active:bg-muted/50 rounded-[10px] w-full h-[48px] short-phone:h-10 font-semibold text-[14px] text-muted-foreground active:text-foreground transition-colors"
            >
              Sign in
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-svh text-foreground">
      <main className="py-[var(--app-safe-bottom-lg)] flex flex-col justify-center mx-auto px-5 w-full short-phone:max-w-[23rem] max-w-sm min-h-svh">
        <header className="flex flex-col items-center mb-8 short-phone:mb-5">
          <img
            src="/app-icon.svg"
            alt=""
            className="rounded-full w-11 short-phone:w-9 h-11 short-phone:h-9"
          />
          <h1 className="mt-4 short-phone:mt-3 text-[1.8rem] short-phone:text-[1.45rem] app-display">
            OneRep
          </h1>
        </header>

        <section className="p-3.5 short-phone:p-3 app-rail-surface">
          <div className="grid-cols-2 mb-3 short-phone:mb-2.5 app-segmented">
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
                <div className="bg-background px-4 py-3 border border-border/60 rounded-[10px]">
                  <p className={LABEL_CLASS}>Email code</p>
                  <p className="mt-1.5 text-[13px] text-muted-foreground/65 leading-5">
                    Enter the 6-digit code sent to{" "}
                    {pendingEmail || "your email"}.
                  </p>
                </div>
                <label className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>Code</span>
                  <input
                    type="text"
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
                  <input
                    type="password"
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
                </label>
              </>
            )}

            {mode === "signup" && !verificationMode && (
              <div id="clerk-captcha" />
            )}

            {mode === "signin" && !verificationMode && (
              <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 px-1">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={submitting}
                  className="flex items-center disabled:opacity-50 min-h-10 font-semibold text-[12.5px] text-muted-foreground/65 active:text-foreground text-left transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="bg-destructive/8 px-3.5 py-2.5 border border-destructive/20 rounded-[10px] font-medium text-[12.5px] text-destructive"
              >
                {error}
              </p>
            )}

            {message && (
              <p className="bg-muted/55 px-3.5 py-2.5 border border-foreground/10 rounded-[10px] font-medium text-[12.5px] text-muted-foreground">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="bg-foreground active:opacity-75 disabled:opacity-50 rounded-[10px] w-full h-[52px] short-phone:h-12 font-semibold text-[15px] text-background transition-opacity"
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
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-4 short-phone:mt-3 text-[13px] text-muted-foreground/60">
              <button
                type="button"
                onClick={() => void handleResendCode()}
                disabled={submitting}
                className="inline-flex items-center active:opacity-60 disabled:opacity-50 px-1 min-h-10 font-semibold text-foreground/85 transition-opacity"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => switchMode(mode)}
                disabled={submitting}
                className="inline-flex items-center active:opacity-60 disabled:opacity-50 px-1 min-h-10 font-semibold text-foreground/85 transition-opacity"
              >
                Start over
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3 short-phone:space-y-2.5 mt-4 short-phone:mt-3">
                <div
                  className="flex items-center gap-3 px-1"
                  aria-hidden="true"
                >
                  <span className="flex-1 bg-border/70 h-px" />
                  <span className="font-semibold text-[10px] text-muted-foreground/45 uppercase tracking-[0.2em]">
                    or
                  </span>
                  <span className="flex-1 bg-border/70 h-px" />
                </div>

                <div className="gap-2 grid grid-cols-1">
                  {OAUTH_PROVIDERS.map((provider) => {
                    const Icon = provider.icon
                    const isProviderLoading = oauthLoading === provider.strategy

                    return (
                      <button
                        key={provider.strategy}
                        type="button"
                        onClick={() => void handleOAuth(provider.strategy)}
                        disabled={submitting}
                        aria-label={`Continue with ${provider.label}`}
                        className="flex justify-center items-center gap-2 bg-background active:bg-muted/55 disabled:opacity-50 border border-border/70 rounded-[10px] h-12 short-phone:h-11 font-semibold text-[13px] text-foreground transition-colors"
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
                          {isProviderLoading ? "Opening..." : provider.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="mt-4 short-phone:mt-3 text-[13px] text-muted-foreground/60 text-center">
                {mode === "signin" ? "New here?" : "Have an account?"}{" "}
                <button
                  type="button"
                  onClick={() =>
                    switchMode(mode === "signin" ? "signup" : "signin")
                  }
                  disabled={submitting}
                  className="inline-flex items-center active:opacity-60 disabled:opacity-50 px-1 min-h-10 font-semibold text-foreground/85 transition-opacity"
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
