import { tr } from "@repo/ui/i18n"
export type OfflineSyncStatusTone =
  "offline" | "pending" | "syncing" | "error" | "synced"

export type OfflineSyncStatusCopy = {
  title: string
  body: string
  tone: OfflineSyncStatusTone
  canRetry: boolean
}

function pluralChanges(total: number) {
  return tr("{{value0}} change{{value1}}", {
    value0: total,
    value1: total === 1 ? "" : "s",
  })
}

/**
 * Written copy for a failed sync. The underlying message is a thrown
 * `Error.message` from the network or backend, so it is used only to tell a
 * connection problem apart from everything else and is never shown verbatim.
 */
function syncErrorBody(message: string) {
  if (
    /network|fetch|offline|disconnected|websocket|timed out|timeout/i.test(
      message
    )
  ) {
    return tr("We couldn’t reach OneRep. Check your connection, then retry.")
  }
  return tr("Your changes are safe on this device. Retry to back them up.")
}

export function offlineSyncErrorText(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === "string" && error.trim()) {
    return error
  }
  return tr("Your changes are still on this device and not backed up yet.")
}

export function offlineSyncStatusCopy({
  online,
  canSync,
  syncing = false,
  total,
  lastError,
}: {
  online: boolean
  canSync: boolean
  syncing?: boolean
  total: number
  lastError?: string | null
}): OfflineSyncStatusCopy {
  if (!online) {
    return {
      title: tr("Offline mode"),
      body:
        total > 0
          ? tr("{{value0}} saved locally. Connect to sync.", {
              value0: pluralChanges(total),
            })
          : tr("Keep logging. Changes are saved locally."),
      tone: "offline",
      canRetry: false,
    }
  }

  if (syncing && canSync) {
    return {
      title: tr("Syncing changes"),
      body:
        total > 0
          ? tr("Uploading saved changes now.")
          : tr("Checking for saved changes."),
      tone: "syncing",
      canRetry: false,
    }
  }

  if (lastError && (total > 0 || canSync)) {
    return {
      title: tr("Sync needs attention"),
      body: canSync
        ? syncErrorBody(lastError)
        : tr("Sign in again to retry syncing local changes."),
      tone: "error",
      canRetry: canSync,
    }
  }

  if (total > 0 && canSync) {
    return {
      title: tr("{{value0}} waiting to sync", { value0: pluralChanges(total) }),
      body: tr("Uploading automatically. You can retry now."),
      tone: "syncing",
      canRetry: true,
    }
  }

  if (total > 0) {
    return {
      title: tr("Waiting to sync"),
      body: tr("Sign-in is still connecting. Changes are saved locally."),
      tone: "pending",
      canRetry: false,
    }
  }

  if (canSync) {
    return {
      title: tr("All changes synced"),
      body: tr("Your latest changes are backed up."),
      tone: "synced",
      canRetry: false,
    }
  }

  return {
    title: tr("Waiting to sync"),
    body: tr("Sign-in is still connecting. New changes are saved locally."),
    tone: "pending",
    canRetry: false,
  }
}
