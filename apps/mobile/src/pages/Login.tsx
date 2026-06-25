import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
  type SVGProps,
} from "react"
import { authClient } from "@/lib/auth-client"
import { getAuthCallbackUrl } from "@/lib/auth-redirects"
import { useSmoothNavigate } from "@/lib/navigation"
import { usePostHog } from "@posthog/react"

type LoginMode = "signin" | "signup"

const FIELD_CLASS =
  "block rounded-[20px] border border-border/60 bg-background px-4 py-3 transition-colors focus-within:border-foreground/25 focus-within:bg-card short-phone:rounded-[18px] short-phone:py-2.5"
const LABEL_CLASS =
  "block text-[9.5px] font-semibold tracking-[0.18em] text-muted-foreground/60 uppercase"
const INPUT_CLASS =
  "mt-1.5 min-h-10 w-full bg-transparent text-[15px] font-medium tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35 disabled:opacity-60"
const PRELOGIN_SEEN_KEY = "onerep:prelogin-onboarding-seen"

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

function isEmailNotVerified(
  error: { status?: number; code?: string; message?: string } | null | undefined
) {
  const message = error?.message?.toLowerCase() ?? ""

  return (
    error?.code === "EMAIL_NOT_VERIFIED" ||
    (error?.status === 403 && message.includes("verified"))
  )
}

function IntroSvgShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex h-56 w-full items-center justify-center rounded-[30px] border border-border/60 bg-card shadow-sm shadow-black/[0.03] dark:shadow-black/20 short-phone:h-44 short-phone:rounded-[24px]">
      <div className="pointer-events-none absolute inset-4 rounded-[22px] border border-border/35 short-phone:inset-3 short-phone:rounded-[18px]" />
      {children}
    </div>
  )
}

function TrackSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 260 190" fill="none" aria-hidden="true" {...props}>
      <rect
        x="48"
        y="42"
        width="164"
        height="106"
        rx="26"
        className="fill-muted/60"
      />
      <rect
        x="68"
        y="61"
        width="124"
        height="24"
        rx="12"
        className="fill-background"
      />
      <rect
        x="68"
        y="96"
        width="55"
        height="33"
        rx="16"
        className="fill-background"
      />
      <rect
        x="137"
        y="96"
        width="55"
        height="33"
        rx="16"
        className="fill-background"
      />
      <path
        d="M89 73h48M88 112h15M157 112h18"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="182" cy="73" r="5" className="fill-foreground" />
      <path
        d="M72 148h116"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-15"
      />
    </svg>
  )
}

function OfflineSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 260 190" fill="none" aria-hidden="true" {...props}>
      <rect
        x="91"
        y="28"
        width="78"
        height="134"
        rx="28"
        className="fill-muted/60"
      />
      <rect
        x="105"
        y="45"
        width="50"
        height="82"
        rx="18"
        className="fill-background"
      />
      <path
        d="M115 77h30M115 94h22"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="130" cy="144" r="5" className="fill-foreground" />
      <path
        d="M62 72c17-18 39-28 68-28s51 10 68 28"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        className="opacity-20"
      />
      <path
        d="M79 92c13-13 30-20 51-20s38 7 51 20"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        className="opacity-20"
      />
      <path
        d="M105 86l50 50"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PrivacySvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 260 190" fill="none" aria-hidden="true" {...props}>
      <path
        d="M130 33l70 25v43c0 39-28 66-70 82-42-16-70-43-70-82V58l70-25z"
        className="fill-muted/60"
      />
      <path
        d="M100 92V78c0-18 12-31 30-31s30 13 30 31v14"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <rect
        x="89"
        y="88"
        width="82"
        height="54"
        rx="21"
        className="fill-background"
      />
      <circle cx="130" cy="113" r="7" className="fill-foreground" />
      <path
        d="M130 120v12"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M98 158h64"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-15"
      />
    </svg>
  )
}

function IntroIllustration({ index }: { index: number }) {
  const svgClass = "relative h-full w-full text-foreground"

  return (
    <IntroSvgShell>
      {index === 0 && <TrackSvg className={svgClass} />}
      {index === 1 && <OfflineSvg className={svgClass} />}
      {index === 2 && <PrivacySvg className={svgClass} />}
    </IntroSvgShell>
  )
}

export default function Login() {
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const { data: session, isPending } = authClient.useSession()
  const [mode, setMode] = useState<LoginMode>("signin")
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(PRELOGIN_SEEN_KEY) !== "true"
  })
  const [introIndex, setIntroIndex] = useState(0)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isPending && session) {
      navigate("/", { replace: true })
    }
  }, [session, isPending, navigate])

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode)
    setError(undefined)
    setMessage(undefined)
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

  async function handlePasswordReset() {
    setError(undefined)
    setMessage(undefined)
    const trimmed = email.trim()
    if (!trimmed) {
      setError("Enter your email first")
      return
    }

    setLoading(true)
    try {
      const { error } = await authClient.requestPasswordReset({
        email: trimmed,
        redirectTo: getAuthCallbackUrl("/reset-password"),
      })
      if (error) {
        setError(error.message ?? "Could not send reset email")
        return
      }
      setMessage("If that email has an account, a reset link is on the way.")
    } finally {
      setLoading(false)
    }
  }

  async function handleVerificationEmail(targetEmail = email.trim()) {
    const trimmed = targetEmail.trim()
    if (!trimmed) {
      setError("Enter your email first")
      return
    }

    setLoading(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: trimmed,
        callbackURL: getAuthCallbackUrl("/email-verified"),
      })
      if (error) {
        setError(error.message ?? "Could not send verification email")
        return
      }
      setMessage("Verification email sent. Check your inbox.")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setMessage(undefined)
    setLoading(true)

    try {
      if (mode === "signin") {
        const { data, error } = await authClient.signIn.email({
          email,
          password,
        })
        if (error) {
          if (isEmailNotVerified(error)) {
            await handleVerificationEmail(email)
            return
          }
          setError(error.message ?? "Sign in failed")
          return
        }
        posthog.identify(data?.user?.id ?? email, { email })
        posthog.capture("user_signed_in", { method: "email" })
      } else {
        const displayName = name.trim() || email.split("@")[0]
        const { data, error } = await authClient.signUp.email({
          email,
          password,
          name: displayName,
          callbackURL: getAuthCallbackUrl("/email-verified?next=onboarding"),
        })
        if (error) {
          setError(error.message ?? "Sign up failed")
          return
        }
        posthog.identify(data?.user?.id ?? email, { email, name: displayName })
        posthog.capture("user_signed_up", { method: "email" })
        setMode("signin")
        setName("")
        setPassword("")
        setMessage(
          "If this is a new account, a verification link is on the way."
        )
      }
    } finally {
      setLoading(false)
    }
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
              <span className="text-[13px] font-semibold tracking-tight">
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
              <p className="text-[10px] font-semibold tracking-[0.24em] text-muted-foreground/60 uppercase">
                {slide.kicker}
              </p>
              <h1 className="mt-3 text-[2rem] leading-tight font-semibold tracking-tight short-phone:mt-2 short-phone:text-[1.72rem]">
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
                  className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-muted/45"
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
              className="h-[52px] w-full rounded-[22px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-75 short-phone:h-12 short-phone:rounded-[20px]"
            >
              {isLastSlide ? "Get started" : "Next"}
            </button>
            <button
              type="button"
              onClick={() => finishIntro("signin")}
              className="h-[48px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/50 active:text-foreground short-phone:h-10"
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
          <h1 className="mt-4 text-[1.65rem] font-semibold tracking-tight short-phone:mt-3 short-phone:text-[1.45rem]">
            OneRep
          </h1>
        </header>

        <section className="rounded-[28px] border border-border/70 bg-card p-3.5 shadow-[0_24px_70px_rgba(15,23,42,0.07)] dark:shadow-black/30 short-phone:rounded-[24px] short-phone:p-3">
          <div className="mb-3 grid grid-cols-2 rounded-full bg-muted/65 p-1 short-phone:mb-2.5">
            {(["signin", "signup"] as LoginMode[]).map((item) => {
              const active = mode === item
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchMode(item)}
                  className={[
                    "h-10 rounded-full text-[12px] font-semibold tracking-tight transition-all short-phone:h-9",
                    active
                      ? "bg-background text-foreground shadow-sm shadow-black/[0.04]"
                      : "text-muted-foreground active:text-foreground",
                  ].join(" ")}
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
            {mode === "signup" && (
              <label className={FIELD_CLASS}>
                <span className={LABEL_CLASS}>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  required
                  autoComplete="name"
                  disabled={loading}
                  className={INPUT_CLASS}
                />
              </label>
            )}

            <label className={FIELD_CLASS}>
              <span className={LABEL_CLASS}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                disabled={loading}
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
                disabled={loading}
                className={INPUT_CLASS}
              />
            </label>

            {mode === "signin" && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={loading}
                  className="flex min-h-10 items-center text-left text-[12.5px] font-semibold text-muted-foreground/65 transition-colors active:text-foreground disabled:opacity-50"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => void handleVerificationEmail()}
                  disabled={loading}
                  className="flex min-h-10 items-center text-left text-[12.5px] font-semibold text-muted-foreground/65 transition-colors active:text-foreground disabled:opacity-50"
                >
                  Resend verification
                </button>
              </div>
            )}

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

            <button
              type="submit"
              disabled={loading}
              className="h-[52px] w-full rounded-[22px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-75 disabled:opacity-50 short-phone:h-12 short-phone:rounded-[20px]"
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

          <p className="mt-4 text-center text-[13px] text-muted-foreground/60 short-phone:mt-3">
            {mode === "signin" ? "New here?" : "Have an account?"}{" "}
            <button
              type="button"
              onClick={() =>
                switchMode(mode === "signin" ? "signup" : "signin")
              }
              className="inline-flex min-h-10 items-center px-1 font-semibold text-foreground/85 transition-opacity active:opacity-60"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </section>
      </main>
    </div>
  )
}
