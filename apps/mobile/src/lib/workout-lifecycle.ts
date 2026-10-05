/** A queued create/save must settle before deletion, or it can revive the draft.
 * Failed writes do not prevent discarding; deletion failure still reaches the UI.
 */
export async function abortWorkoutAfterPendingWrites(
  pendingWrites: Array<Promise<unknown> | null>,
  abort: () => Promise<unknown>
): Promise<void> {
  await Promise.allSettled(pendingWrites.filter((write) => write !== null))
  await abort()
}

/** Only unsaved edits from this same session may outrank a remote draft. */
export function shouldResumeDeviceDraft(
  device: {
    startedAt: number
    elapsedSeconds: number
    hasUnsyncedChanges?: boolean
  } | null,
  remote: { startedAt: number; elapsedSeconds: number }
): boolean {
  return Boolean(
    device?.hasUnsyncedChanges &&
    device.startedAt === remote.startedAt &&
    device.elapsedSeconds >= remote.elapsedSeconds
  )
}
