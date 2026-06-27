import { useEffect } from "react"
import { useAuth, useClerk } from "@clerk/react"
import { handleUnauthenticatedSession } from "@/lib/auth-session"
import { useSmoothNavigate } from "@/lib/navigation"
import { useConvexAuth } from "convex/react"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { signOut } = useClerk()
  const convexAuth = useConvexAuth()
  const navigate = useSmoothNavigate()

  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn) {
      void handleUnauthenticatedSession({ navigate, signOut })
      return
    }

    if (!convexAuth.isLoading && !convexAuth.isAuthenticated) {
      void handleUnauthenticatedSession({ navigate, signOut })
    }
  }, [
    convexAuth.isAuthenticated,
    convexAuth.isLoading,
    isLoaded,
    isSignedIn,
    navigate,
    signOut,
  ])

  if (!isLoaded || (isSignedIn && !convexAuth.isAuthenticated)) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </div>
    )
  }

  if (!isSignedIn) return null

  return <>{children}</>
}
