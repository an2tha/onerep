import { useEffect, useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"

const readClock = () => String(Math.floor(Date.now() / 300_000))
export function useRestart() {
  const { isAuthenticated } = useConvexAuth()
  const [clockKey, setClockKey] = useState(readClock)
  useEffect(() => {
    const refresh = () => setClockKey(readClock())
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])
  return useQuery(api.restart.get, isAuthenticated ? { clockKey } : "skip")
}
