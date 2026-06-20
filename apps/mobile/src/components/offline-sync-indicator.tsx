import { useEffect, useState } from "react"
import { CloudArrowUp, WifiSlash, X } from "@phosphor-icons/react"
import { authClient } from "@/lib/auth-client"
import {
  flushOfflineQueue,
  getOfflineQueueSummary,
  setOfflineQueueOwner,
  subscribeOfflineQueue,
} from "@/lib/offline-queue"
import { cn } from "@/lib/utils"

function onlineNow() {
  if (typeof navigator === "undefined") return true
  return navigator.onLine
}

export function OfflineSyncIndicator() {
  const { data: session } = authClient.useSession()
  const [online, setOnline] = useState(onlineNow())
  const [summary, setSummary] = useState(getOfflineQueueSummary())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setOfflineQueueOwner(session?.user?.id ?? null)
  }, [session?.user?.id])

  useEffect(() => {
    const refresh = () => {
      setOnline(onlineNow())
      setSummary(getOfflineQueueSummary())
    }

    const tryFlush = () => {
      refresh()
      void flushOfflineQueue().then(refresh)
    }

    const unsubscribe = subscribeOfflineQueue(refresh)
    window.addEventListener("online", tryFlush)
    window.addEventListener("offline", refresh)
    window.addEventListener("focus", tryFlush)
    tryFlush()

    return () => {
      unsubscribe()
      window.removeEventListener("online", tryFlush)
      window.removeEventListener("offline", refresh)
      window.removeEventListener("focus", tryFlush)
    }
  }, [])

  useEffect(() => {
    if (!online || summary.total > 0) setDismissed(false)
  }, [online, summary.total])

  if (dismissed || (online && summary.total === 0)) return null

  const syncing = online && summary.total > 0

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[10000] flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex max-w-sm items-center gap-3 rounded-full border px-3 py-2 shadow-xl backdrop-blur-md",
          online
            ? "border-amber-400/30 bg-amber-50/95 text-amber-950 dark:bg-amber-950/90 dark:text-amber-50"
            : "border-border/50 bg-card/95 text-foreground",
        )}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10">
          {online ? <CloudArrowUp size={15} weight="bold" /> : <WifiSlash size={15} weight="bold" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold leading-tight">
            {syncing ? `${summary.total} change${summary.total === 1 ? "" : "s"} waiting to sync` : "Offline mode"}
          </p>
          <p className="truncate text-[10.5px] opacity-65">
            {syncing
              ? "We’ll upload automatically when the connection is stable."
              : "Keep logging. Changes are saved locally."}
          </p>
        </div>
        {online && summary.total > 0 && (
          <button
            type="button"
            onClick={() => void flushOfflineQueue().then(() => setSummary(getOfflineQueueSummary()))}
            className="rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold text-background"
          >
            Sync
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss offline sync status"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10"
        >
          <X size={12} weight="bold" />
        </button>
      </div>
    </div>
  )
}
