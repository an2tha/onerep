import { useCallback, useEffect, useRef, useState } from "react"
import { CloudArrowUp, Warning, WifiSlash, X } from "@phosphor-icons/react"
import { useConvexAuth } from "convex/react"
import { useAppAuth } from "@/lib/auth-client"
import {
  flushOfflineQueue,
  getOfflineQueueSummary,
  isBrowserOnline,
  setOfflineQueueOwner,
  subscribeOfflineQueue,
} from "@/lib/offline-queue"
import {
  offlineSyncErrorText,
  offlineSyncStatusCopy,
} from "@/lib/offline-sync-status"
import { cn } from "@/lib/utils"
import { APP_ACCENT_COLORS, tint } from "@/lib/design-tokens"

function onlineNow() {
  return isBrowserOnline()
}

export function OfflineSyncIndicator() {
  const { userId, isSignedIn } = useAppAuth()
  const convexAuth = useConvexAuth()
  const [online, setOnline] = useState(onlineNow())
  const [summary, setSummary] = useState(getOfflineQueueSummary())
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const syncingRef = useRef(false)
  const canSync = online && Boolean(isSignedIn) && convexAuth.isAuthenticated

  useEffect(() => {
    setOfflineQueueOwner(userId ?? null)
  }, [userId])

  const refresh = useCallback((options: { clearError?: boolean } = {}) => {
    setOnline(onlineNow())
    setSummary(getOfflineQueueSummary())
    if (options.clearError) setSyncError(null)
  }, [])

  const tryFlush = useCallback(() => {
    refresh({ clearError: true })
    if (!canSync || syncingRef.current) return

    syncingRef.current = true
    setSyncing(true)
    void flushOfflineQueue()
      .then(() => {
        refresh({ clearError: true })
      })
      .catch((error) => {
        setOnline(onlineNow())
        setSummary(getOfflineQueueSummary())
        setSyncError(offlineSyncErrorText(error))
      })
      .finally(() => {
        syncingRef.current = false
        setSyncing(false)
      })
  }, [canSync, refresh])

  useEffect(() => {
    const handleOffline = () => {
      refresh({ clearError: true })
    }

    const unsubscribe = subscribeOfflineQueue(refresh)
    window.addEventListener("online", tryFlush)
    window.addEventListener("offline", handleOffline)
    window.addEventListener("focus", tryFlush)
    tryFlush()

    return () => {
      unsubscribe()
      window.removeEventListener("online", tryFlush)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("focus", tryFlush)
    }
  }, [refresh, tryFlush])

  useEffect(() => {
    if (!online || summary.total > 0 || syncError) setDismissed(false)
  }, [online, summary.total, syncError])

  if (dismissed || (online && summary.total === 0 && !syncError)) return null

  const caution = APP_ACCENT_COLORS.caution
  const danger = APP_ACCENT_COLORS.danger
  const status = offlineSyncStatusCopy({
    online,
    canSync,
    syncing,
    total: summary.total,
    lastError: syncError ?? summary.lastError,
  })
  const accent = status.tone === "error" ? danger : caution

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[10000] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-auto flex max-w-sm items-center gap-3 rounded-[10px] border px-3 py-2 shadow-xl backdrop-blur-md",
          online
            ? "text-foreground"
            : "border-border/50 bg-card/95 text-foreground"
        )}
        style={
          online
            ? {
                borderColor: tint(accent, 32),
                backgroundColor: `color-mix(in srgb, ${accent} 15%, var(--background))`,
              }
            : undefined
        }
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-foreground/10">
          {status.tone === "error" ? (
            <Warning size={15} weight="bold" />
          ) : online ? (
            <CloudArrowUp size={15} weight="bold" />
          ) : (
            <WifiSlash size={15} weight="bold" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-tight font-bold">
            {status.title}
          </p>
          <p className="truncate text-[10.5px] opacity-65">
            {status.body}
          </p>
        </div>
        {status.canRetry && (
          <button
            type="button"
            onClick={tryFlush}
            disabled={syncing}
            aria-busy={syncing}
            className="rounded-[8px] bg-foreground px-2.5 py-1 text-[10px] font-bold text-background"
          >
            {syncing ? "Syncing" : "Sync"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (!syncing) setDismissed(true)
          }}
          disabled={syncing}
          aria-label="Dismiss offline sync status"
          className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-foreground/10 disabled:opacity-40"
        >
          <X size={12} weight="bold" />
        </button>
      </div>
    </div>
  )
}
