import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { LoginForm, type LoginMode } from "@repo/ui"
import { authClient } from "@/lib/auth-client"
import { usePostHog } from "@posthog/react"

export default function Login() {
  const navigate = useNavigate()
  const posthog = usePostHog()
  const { data: session, isPending } = authClient.useSession()
  const [mode, setMode] = useState<LoginMode>("signin")
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isPending && session) {
      navigate("/", { replace: true })
    }
  }, [session, isPending, navigate])

  async function handleSubmit(email: string, password: string, name?: string) {
    setError(undefined)
    setLoading(true)
    try {
      if (mode === "signin") {
        const { data, error } = await authClient.signIn.email({ email, password })
        if (error) { setError(error.message ?? "Sign in failed"); return }
        posthog.identify(data?.user?.id ?? email, { email })
        posthog.capture("user_signed_in", { method: "email" })
      } else {
        const { data, error } = await authClient.signUp.email({
          email,
          password,
          name: name ?? email.split("@")[0],
        })
        if (error) { setError(error.message ?? "Sign up failed"); return }
        posthog.identify(data?.user?.id ?? email, { email, name: name ?? email.split("@")[0] })
        posthog.capture("user_signed_up", { method: "email" })
        navigate("/onboarding", { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background">

      {/* ── Background accent ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, currentColor 0, currentColor 1px, transparent 1px, transparent 28px)," +
            "repeating-linear-gradient(90deg, currentColor 0, currentColor 1px, transparent 1px, transparent 28px)",
        }}
      />
      {/* Radial glow top-right */}
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, var(--foreground) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-between px-6 pb-10 pt-16">

        {/* ── Wordmark + mode badge ── */}
        <div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                {/* Logo mark */}
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-foreground">
                  <span className="text-[14px] font-black tracking-tighter text-background">1R</span>
                </div>
                <span className="text-[13px] font-semibold tracking-tight text-foreground/80">
                  OneRep
                </span>
              </div>
              <h1 className="mt-6 text-[2.4rem] leading-[1.06] font-semibold tracking-tight">
                {mode === "signin"
                  ? <>Train<br />with intent.</>
                  : <>Build your<br />training log.</>}
              </h1>
              <p className="mt-2.5 max-w-[220px] text-[13px] leading-relaxed text-muted-foreground/55">
                {mode === "signin"
                  ? "Sessions, nutrition, and progress — all in one place."
                  : "Start structuring workouts, meals, and body metrics."}
              </p>
            </div>
          </div>

          {/* ── Stats strip ── */}
          <div className="mt-8 flex gap-5">
            {[
              { n: "Workouts", d: "logged" },
              { n: "Nutrition", d: "tracked" },
              { n: "Offline", d: "always ready" },
            ].map((item) => (
              <div key={item.n}>
                <p className="text-[12px] font-semibold">{item.n}</p>
                <p className="text-[10.5px] text-muted-foreground/45">{item.d}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Form ── */}
        <div className="mt-10">
          {/* Mode toggle */}
          <div className="mb-5 flex items-center gap-1 rounded-full bg-muted/60 p-0.5 self-start inline-flex w-fit">
            {(["signin", "signup"] as LoginMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(undefined) }}
                className={[
                  "rounded-full px-4 py-1.5 text-[11.5px] font-semibold tracking-wide transition-all",
                  mode === m
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground active:text-foreground",
                ].join(" ")}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <LoginForm
            mode={mode}
            onSubmit={handleSubmit}
            onModeChange={(m) => { setMode(m); setError(undefined) }}
            error={error}
            loading={loading}
          />
        </div>

      </div>
    </div>
  )
}
