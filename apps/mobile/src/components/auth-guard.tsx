import { useEffect } from "react"
import { authClient } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useSmoothNavigate()

  useEffect(() => {
    if (!isPending && !session) {
      navigate("/login", { replace: true })
    }
  }, [session, isPending, navigate])

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </div>
    )
  }

  if (!session) return null

  return <>{children}</>
}
