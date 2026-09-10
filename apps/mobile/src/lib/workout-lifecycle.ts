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
