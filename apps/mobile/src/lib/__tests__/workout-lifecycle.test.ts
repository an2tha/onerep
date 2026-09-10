import { describe, expect, test } from "bun:test"
import { abortWorkoutAfterPendingWrites } from "../workout-lifecycle"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe("discarding a workout with writes in flight", () => {
  test("waits for creation and saving before deleting the session", async () => {
    const create = deferred()
    const save = deferred()
    const events: string[] = []
    const discard = abortWorkoutAfterPendingWrites(
      [create.promise.then(() => { events.push("created") }),
        save.promise.then(() => { events.push("saved") })],
      async () => { events.push("deleted") }
    )
    save.resolve()
    await save.promise
    expect(events).toEqual(["saved"])
    create.resolve()
    await discard
    expect(events).toEqual(["saved", "created", "deleted"])
  })

  test("a failed save does not prevent deletion", async () => {
    let deleted = false
    await abortWorkoutAfterPendingWrites(
      [null, Promise.reject(new Error("save failed"))],
      async () => { deleted = true }
    )
    expect(deleted).toBe(true)
  })

  test("failed deletion rejects so the prompt and local draft remain recoverable", async () => {
    const failure = new Error("offline")
    let cleared = false
    await expect((async () => {
      await abortWorkoutAfterPendingWrites([], async () => { throw failure })
      cleared = true
    })()).rejects.toBe(failure)
    expect(cleared).toBe(false)
  })

  test("local-only sessions can be discarded without pending writes", async () => {
    let calls = 0
    await abortWorkoutAfterPendingWrites([null, null], async () => { calls += 1 })
    expect(calls).toBe(1)
  })
})
