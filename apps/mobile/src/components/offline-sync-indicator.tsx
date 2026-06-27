import { useEffect, useState } from "react"
import { CloudArrowUp, WifiSlash, X } from "@phosphor-icons/react"
import { useAuth } from "@clerk/react"
import { useConvexAuth } from "convex/react"
import {
  flushOfflineQueue,
  getOfflineQueueSummary,
  setOfflineQueueOwner,
  subscribeOfflineQueue,
} from "@/lib/offline-queue"
import { cn } from "@/lib/utils"
import { APP_ACCENT_COLORS, tint } from "@/lib/design-tokens"

function onlineNow() {
  if (typeof navigator === "undefined") return true
  return navigator.onLine
}

export function OfflineSyncIndicator() {
  const { userId, isSignedIn } = useAuth()
  const convexAuth = useConvexAuth()
  const [online, setOnline] = useState(onlineNow())
  const [summary, setSummary] = useState(getOfflineQueueSummary())
  const [dismissed, setDismissed] = useState(false)
  const canSync = online && Boolean(isSignedIn) && convexAuth.isAuthenticated

  useEffect(() => {
    setOfflineQueueOwner(userId ?? null)
  }, [userId])

  useEffect(() => {
    const refresh = () => {
      setOnline(onlineNow())
      setSummary(getOfflineQueueSummary())
    }

    const tryFlush = () => {
      refresh()
      if (canSync) {
        void flushOfflineQueue().then(refresh)
      }
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
  }, [canSync])

  useEffect(() => {
    if (!online || summary.total > 0) setDismissed(false)
  }, [online, summary.total])

  if (dismissed || (online && summary.total === 0)) return null

  const syncing = canSync && summary.total > 0
  const caution = APP_ACCENT_COLORS.caution

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[10000] flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex max-w-sm items-center gap-3 rounded-[10px] border px-3 py-2 shadow-xl backdrop-blur-md",
          online
            ? "text-foreground"
            : "border-border/50 bg-card/95 text-foreground"
        )}
        style={
          online
            ? {
                borderColor: tint(caution, 32),
                backgroundColor: `color-mix(in srgb, ${caution} 15%, var(--background))`,
              }
            : undefined
        }
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-foreground/10">
          {online ? (
            <CloudArrowUp size={15} weight="bold" />
          ) : (
            <WifiSlash size={15} weight="bold" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-tight font-bold">
            {syncing
              ? `${summary.total} change${summary.total === 1 ? "" : "s"} waiting to sync`
              : "Offline mode"}
          </p>
          <p className="truncate text-[10.5px] opacity-65">
            {syncing
              ? "We’ll upload automatically when the connection is stable."
              : "Keep logging. Changes are saved locally."}
          </p>
        </div>
        {canSync && summary.total > 0 && (
          <button
            type="button"
            onClick={() =>
              void flushOfflineQueue().then(() =>
                setSummary(getOfflineQueueSummary())
              )
            }
            className="rounded-[8px] bg-foreground px-2.5 py-1 text-[10px] font-bold text-background"
          >
            Sync
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss offline sync status"
          className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-foreground/10"
        >
          <X size={12} weight="bold" />
        </button>
      </div>
    </div>
  )
}
