export type OfflineSyncStatusTone =
  "offline" | "pending" | "syncing" | "error" | "synced"

export type OfflineSyncStatusCopy = {
  title: string
  body: string
  tone: OfflineSyncStatusTone
  canRetry: boolean
}

function pluralChanges(total: number) {
  return `${total} change${total === 1 ? "" : "s"}`
}

function shortError(message: string) {
  const trimmed = message.trim()
  if (trimmed.length <= 72) return trimmed
  return `${trimmed.slice(0, 69)}...`
}

export function offlineSyncErrorText(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === "string" && error.trim()) {
    return error
  }
  return "Sync failed. Try again."
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
      title: "Offline mode",
      body:
        total > 0
          ? `${pluralChanges(total)} saved locally. Connect to sync.`
          : "Keep logging. Changes are saved locally.",
      tone: "offline",
      canRetry: false,
    }
  }

  if (syncing && canSync) {
    return {
      title: "Syncing changes",
      body:
        total > 0
          ? "Uploading saved changes now."
          : "Checking for saved changes.",
      tone: "syncing",
      canRetry: false,
    }
  }

  if (lastError && (total > 0 || canSync)) {
    return {
      title: "Sync needs attention",
      body: canSync
        ? `Last error: ${shortError(lastError)}`
        : "Sign in again to retry syncing local changes.",
      tone: "error",
      canRetry: canSync,
    }
  }

  if (total > 0 && canSync) {
    return {
      title: `${pluralChanges(total)} waiting to sync`,
      body: "Uploading automatically. You can retry now.",
      tone: "syncing",
      canRetry: true,
    }
  }

  if (total > 0) {
    return {
      title: "Waiting to sync",
      body: "Sign-in is still connecting. Changes are saved locally.",
      tone: "pending",
      canRetry: false,
    }
  }

  if (canSync) {
    return {
      title: "All changes synced",
      body: "Your latest changes are backed up.",
      tone: "synced",
      canRetry: false,
    }
  }

  return {
    title: "Waiting to sync",
    body: "Sign-in is still connecting. New changes are saved locally.",
    tone: "pending",
    canRetry: false,
  }
}
