import { useEffect } from "react"
import { useNavigate } from "react-router"
import { authClient } from "@/lib/auth-client"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()

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
