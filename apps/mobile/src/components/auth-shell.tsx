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
