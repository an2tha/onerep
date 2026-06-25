import { useEffect } from "react"
import { authClient } from "@/lib/auth-client"
import { handleUnauthenticatedSession } from "@/lib/auth-session"
import { useSmoothNavigate } from "@/lib/navigation"
import { useConvexAuth } from "convex/react"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const convexAuth = useConvexAuth()
  const navigate = useSmoothNavigate()

  useEffect(() => {
    if (isPending || convexAuth.isLoading) return

    if (!session || !convexAuth.isAuthenticated) {
      handleUnauthenticatedSession({ navigate })
    }
  }, [
    session,
    isPending,
    convexAuth.isLoading,
    convexAuth.isAuthenticated,
    navigate,
  ])

  if (isPending || convexAuth.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </div>
    )
  }

  if (!session || !convexAuth.isAuthenticated) return null

  return <>{children}</>
}
