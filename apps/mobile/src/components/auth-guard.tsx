import { useEffect } from "react"
import { handleUnauthenticatedSession } from "@/lib/auth-session"
import { signOutApp, useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAppAuth()
  const signOut = signOutApp
  const navigate = useSmoothNavigate()

  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn) {
      void handleUnauthenticatedSession({ navigate, signOut })
    }
  }, [isLoaded, isSignedIn, navigate, signOut])

  if (!isLoaded) {
    return null
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 text-center">
        <section className="app-rail-surface p-5">
          <div className="mx-auto mb-4 h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
          <h1 className="text-[1.25rem] font-semibold tracking-tight">
            Taking you to sign in
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground/70">
            Your destination is saved so you can continue after signing in.
          </p>
          <button
            type="button"
            onClick={() =>
              void handleUnauthenticatedSession({ navigate, signOut })
            }
            className="mt-5 h-11 w-full rounded-[10px] bg-foreground text-[14px] font-semibold text-background transition-opacity active:opacity-75"
          >
            Continue to sign in
          </button>
        </section>
      </main>
    )
  }

  return <>{children}</>
}
