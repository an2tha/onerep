import { useEffect, useRef, type ReactNode } from "react"

/**
 * Shared chrome for the unauthenticated screens (sign in, create account,
 * password reset) so they read as one flow rather than three pages.
 */
export const AUTH_BACKDROP_CLASS =
  "relative min-h-svh bg-background text-foreground before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[45svh] before:bg-[radial-gradient(120%_100%_at_50%_0%,var(--surface-raised),transparent_70%)]"

export const AUTH_CARD_CLASS =
  "rounded-[1.15rem] border border-border bg-[var(--surface-panel)] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:p-6"

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={AUTH_BACKDROP_CLASS}>
      <main className="relative mx-auto flex min-h-svh w-full max-w-[27rem] flex-col justify-center px-6 pt-[calc(var(--app-safe-top)+2rem)] pb-[var(--app-safe-bottom-lg)]">
        {children}
      </main>
    </div>
  )
}

export function AuthMark() {
  return (
    <img
      src="/app-icon.svg"
      alt=""
      className="mx-auto size-14 rounded-[1rem] border border-border bg-[var(--surface-raised)] p-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.16)]"
    />
  )
}

/**
 * Animates its own height to match the swapping panel inside it, so the card
 * grows and shrinks with a mode change instead of snapping.
 */
export function AuthModeCard({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const sync = () => {
      container.style.height = `${content.offsetHeight}px`
    }
    sync()

    const observer = new ResizeObserver(sync)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="auth-mode-card overflow-hidden">
      <div ref={contentRef}>{children}</div>
    </div>
  )
}

/** Google's brand mark, which their sign-in guidelines require us to use as-is. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
