import { useCallback, useEffect, useRef, useState } from "react"
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
import { OfflineSyncStatus } from "@repo/ui"

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

  const status = offlineSyncStatusCopy({
    online,
    canSync,
    syncing,
    total: summary.total,
    lastError: syncError ?? summary.lastError,
  })
  return (
    <OfflineSyncStatus
      status={status}
      online={online}
      syncing={syncing}
      onRetry={tryFlush}
      onDismiss={() => {
        if (!syncing) setDismissed(true)
      }}
    />
  )
}
