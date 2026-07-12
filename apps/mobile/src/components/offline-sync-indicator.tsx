import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowsClockwise,
  CloudArrowUp,
  Warning,
  WifiSlash,
  X,
} from "@phosphor-icons/react"
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

  const refresh = useCallback(() => {
    setOnline(onlineNow())
    setSummary(getOfflineQueueSummary())
  }, [])

  const tryFlush = useCallback(() => {
    refresh()
    if (!canSync || syncingRef.current) return

    syncingRef.current = true
    setSyncing(true)
    setSyncError(null)
    void flushOfflineQueue()
      .then(() => {
        refresh()
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
      refresh()
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
  const actionLabel = status.tone === "error" ? "Retry" : "Sync"

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[10000] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[10px] border px-3 py-2 shadow-xl backdrop-blur-md",
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
        <div className="flex h-11 w-8 shrink-0 items-center justify-center">
          {status.tone === "error" ? (
            <Warning size={15} weight="bold" />
          ) : online ? (
            <CloudArrowUp size={15} weight="bold" />
          ) : (
            <WifiSlash size={15} weight="bold" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-tight font-semibold">
            {status.title}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {status.body}
          </p>
        </div>
        {status.canRetry && (
          <button
            type="button"
            onClick={tryFlush}
            disabled={syncing}
            aria-busy={syncing}
            aria-label={
              status.tone === "error"
                ? "Retry offline sync"
                : "Sync saved changes"
            }
            className="min-h-11 rounded-[8px] bg-foreground px-3 text-[13px] font-semibold text-background"
          >
            <span className="inline-flex items-center gap-1">
              {syncing && (
                <ArrowsClockwise size={11} className="animate-spin" />
              )}
              {syncing ? "Syncing" : actionLabel}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (!syncing) setDismissed(true)
          }}
          disabled={syncing}
          aria-label="Dismiss offline sync status"
          className="flex h-11 w-11 items-center justify-center rounded-[8px] text-muted-foreground transition-colors active:bg-muted disabled:opacity-40"
        >
          <X size={12} weight="bold" />
        </button>
      </div>
    </div>
  )
}
