import * as React from "react"
import { cn } from "@/lib/utils"

export type LoginMode = "signin" | "signup"

type LoginFormProps = {
  mode?: LoginMode
  onSubmit: (email: string, password: string, name?: string) => Promise<void>
  onModeChange?: (mode: LoginMode) => void
  error?: string
  loading?: boolean
  className?: string
}

export function LoginForm({
  mode = "signin",
  onSubmit,
  onModeChange,
  error,
  loading,
  className,
}: LoginFormProps) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    await onSubmit(email, password, mode === "signup" ? name : undefined)
  }

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <div className="relative">
            <label className="absolute left-4 top-2.5 text-[9.5px] font-semibold tracking-[0.14em] text-foreground/35 uppercase select-none">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
              required
              autoComplete="name"
              className="w-full rounded-2xl border border-border/50 bg-muted/40 pb-3.5 pt-7 pl-4 pr-4 text-[15px] font-medium outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground/30 focus:bg-muted/60"
            />
          </div>
        )}

        <div className="relative">
          <label className="absolute left-4 top-2.5 text-[9.5px] font-semibold tracking-[0.14em] text-foreground/35 uppercase select-none">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full rounded-2xl border border-border/50 bg-muted/40 pb-3.5 pt-7 pl-4 pr-4 text-[15px] font-medium outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground/30 focus:bg-muted/60"
          />
        </div>

        <div className="relative">
          <label className="absolute left-4 top-2.5 text-[9.5px] font-semibold tracking-[0.14em] text-foreground/35 uppercase select-none">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full rounded-2xl border border-border/50 bg-muted/40 pb-3.5 pt-7 pl-4 pr-4 text-[15px] font-medium outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground/30 focus:bg-muted/60"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-destructive/20 bg-destructive/8 px-3.5 py-2.5 text-[12.5px] font-medium text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 h-[54px] w-full rounded-2xl bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-75 disabled:opacity-50"
        >
          {loading
            ? mode === "signin" ? "Signing in…" : "Creating account…"
            : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="mt-5 text-center">
        {mode === "signin" ? (
          <p className="text-[13px] text-muted-foreground/55">
            No account?{" "}
            <button
              type="button"
              onClick={() => onModeChange?.("signup")}
              className="font-semibold text-foreground/80 transition-opacity active:opacity-60"
            >
              Sign up →
            </button>
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground/55">
            Already a member?{" "}
            <button
              type="button"
              onClick={() => onModeChange?.("signin")}
              className="font-semibold text-foreground/80 transition-opacity active:opacity-60"
            >
              Sign in →
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
