import { beforeEach, describe, expect, mock, test } from "bun:test"

const mutationMock = mock(async () => null)

mock.module("../convex", () => ({
  convexClient: {
    mutation: mutationMock,
  },
}))

const {
  clearOfflineQueue,
  enqueueOfflineMutation,
  flushOfflineQueue,
  getOfflineQueueOwner,
  getOfflineQueueSummary,
  isBrowserOnline,
  isOfflineLikeError,
  OfflineQueuePersistenceError,
  readOfflineQueue,
  setOfflineQueueOwner,
  subscribeOfflineQueue,
} = await import("../offline-queue")

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

class FailingWriteStorage extends MemoryStorage {
  setItem() {
    throw new Error("quota exceeded")
  }
}

function installBrowserGlobals() {
  const listeners = new Map<string, Set<() => void>>()
  const storage = new MemoryStorage()

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  })
  Object.defineProperty(globalThis, "window", {
    value: {
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listeners.get(type) ?? new Set())
        listeners.get(type)!.add(listener)
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener)
      },
      dispatchEvent(event: Event) {
        listeners.get(event.type)?.forEach((listener) => listener())
        return true
      },
    },
    configurable: true,
  })
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  })
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "fixed-job-id" },
    configurable: true,
  })

  return storage
}

function installStorage(storage: MemoryStorage | null) {
  if (storage) {
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
    })
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: storage },
      configurable: true,
    })
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
    })
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    })
  }
}

describe("offline mutation queue", () => {
  beforeEach(() => {
    installBrowserGlobals()
    mutationMock.mockReset()
    clearOfflineQueue()
    setOfflineQueueOwner(null)
  })

  test("enqueue stores owner, args, timestamps, and initial attempt count", () => {
    setOfflineQueueOwner("user-1")

    const job = enqueueOfflineMutation("logs.water.addEntry", {
      date: "2026-06-24",
      entry: { id: "drink-1", amountMl: 500 },
    })

    expect(job.id).toBe("fixed-job-id")
    expect(job.ownerId).toBe("user-1")
    expect(job.attempts).toBe(0)
    expect(job.createdAt).toBeGreaterThan(0)
    expect(readOfflineQueue()).toEqual([job])
  })

  test("enqueue throws instead of pretending an offline change was saved when storage is unavailable", () => {
    installStorage(null)

    expect(() =>
      enqueueOfflineMutation("logs.water.addEntry", {
        date: "2026-06-24",
        entry: { id: "drink-1", amountMl: 500 },
      })
    ).toThrow(OfflineQueuePersistenceError)
  })

  test("enqueue throws instead of pretending an offline change was saved when storage write fails", () => {
    const storage = new FailingWriteStorage()
    installStorage(storage)

    expect(() =>
      enqueueOfflineMutation("logs.water.addEntry", {
        date: "2026-06-24",
        entry: { id: "drink-1", amountMl: 500 },
      })
    ).toThrow(OfflineQueuePersistenceError)
    expect(readOfflineQueue()).toEqual([])
  })

  test("setting an owner adopts existing unowned queued jobs", () => {
    enqueueOfflineMutation("logs.water.setDay", {
      date: "2026-06-24",
      entries: [],
    })

    setOfflineQueueOwner("user-2")

    expect(getOfflineQueueOwner()).toBe("user-2")
    expect(readOfflineQueue()[0].ownerId).toBe("user-2")
  })

  test("coalesces last-write-wins day snapshots for the same owner and date", () => {
    setOfflineQueueOwner("owner-a")

    enqueueOfflineMutation("logs.water.setDay", {
      date: "2026-06-24",
      entries: [{ id: "first", amountMl: 250 }],
    })
    enqueueOfflineMutation("logs.water.setDay", {
      date: "2026-06-24",
      entries: [{ id: "second", amountMl: 500 }],
    })

    const queue = readOfflineQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].args).toEqual({
      date: "2026-06-24",
      entries: [{ id: "second", amountMl: 500 }],
    })
  })

  test("keeps day snapshots separate across dates and owners", () => {
    setOfflineQueueOwner("owner-a")
    enqueueOfflineMutation("logs.foodLogs.setDay", {
      date: "2026-06-24",
      entries: [{ id: "a" }],
    })
    enqueueOfflineMutation("logs.foodLogs.setDay", {
      date: "2026-06-25",
      entries: [{ id: "b" }],
    })
    setOfflineQueueOwner("owner-b")
    enqueueOfflineMutation("logs.foodLogs.setDay", {
      date: "2026-06-24",
      entries: [{ id: "c" }],
    })

    expect(readOfflineQueue().map((job) => job.args)).toEqual([
      { date: "2026-06-24", entries: [{ id: "a" }] },
      { date: "2026-06-25", entries: [{ id: "b" }] },
      { date: "2026-06-24", entries: [{ id: "c" }] },
    ])
  })

  test("coalesces singleton preference mutations but preserves additive logs", () => {
    setOfflineQueueOwner("owner-a")

    enqueueOfflineMutation("users.users.setWaterGoal", { goalMl: 2000 })
    enqueueOfflineMutation("users.users.setWaterGoal", { goalMl: 2500 })
    enqueueOfflineMutation("logs.water.addEntry", {
      date: "2026-06-24",
      entry: { id: "drink-1", amountMl: 250 },
    })
    enqueueOfflineMutation("logs.water.addEntry", {
      date: "2026-06-24",
      entry: { id: "drink-2", amountMl: 500 },
    })

    expect(readOfflineQueue().map((job) => job.args)).toEqual([
      { goalMl: 2500 },
      { date: "2026-06-24", entry: { id: "drink-1", amountMl: 250 } },
      { date: "2026-06-24", entry: { id: "drink-2", amountMl: 500 } },
    ])
  })

  test("queue subscriptions receive local queue and storage events until unsubscribed", () => {
    let calls = 0
    const unsubscribe = subscribeOfflineQueue(() => {
      calls += 1
    })

    enqueueOfflineMutation("users.users.setWaterGoal", { goalMl: 2500 })
    window.dispatchEvent(new Event("storage"))
    unsubscribe()
    clearOfflineQueue()

    expect(calls).toBe(2)
  })

  test("flush sends current-owner jobs and leaves jobs for other owners", async () => {
    setOfflineQueueOwner("owner-a")
    enqueueOfflineMutation("logs.water.addEntry", { date: "2026-06-24" })
    setOfflineQueueOwner("owner-b")
    enqueueOfflineMutation("logs.foodLogs.setDay", { date: "2026-06-24" })
    setOfflineQueueOwner("owner-a")

    const result = await flushOfflineQueue()

    expect(result).toEqual({ flushed: 1, remaining: 1 })
    expect(mutationMock).toHaveBeenCalledTimes(1)
    expect(readOfflineQueue()[0].ownerId).toBe("owner-b")
  })

  test("flush records non-network failures and continues with later jobs", async () => {
    setOfflineQueueOwner("owner-a")
    enqueueOfflineMutation("logs.water.addEntry", { order: 1 })
    enqueueOfflineMutation("logs.foodLogs.setDay", { order: 2 })
    mutationMock
      .mockImplementationOnce(async () => {
        throw new Error("validation failed")
      })
      .mockImplementationOnce(async () => null)

    const result = await flushOfflineQueue()

    expect(result).toEqual({ flushed: 1, remaining: 1 })
    expect(readOfflineQueue()[0]).toMatchObject({
      attempts: 1,
      lastError: "validation failed",
    })
  })

  test("flush stops on network-like failures and keeps later jobs untouched", async () => {
    setOfflineQueueOwner("owner-a")
    enqueueOfflineMutation("logs.water.addEntry", { order: 1 })
    enqueueOfflineMutation("logs.foodLogs.setDay", { order: 2 })
    mutationMock.mockImplementationOnce(async () => {
      throw new Error("failed to send request")
    })

    const result = await flushOfflineQueue()
    const remaining = readOfflineQueue()

    expect(result).toEqual({ flushed: 0, remaining: 2 })
    expect(mutationMock).toHaveBeenCalledTimes(1)
    expect(remaining[0]).toMatchObject({ attempts: 1 })
    expect(remaining[1]).toMatchObject({ attempts: 0 })
  })

  test("flush is skipped while the browser is offline", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    })
    setOfflineQueueOwner("owner-a")
    enqueueOfflineMutation("logs.water.addEntry", {})

    const result = await flushOfflineQueue()

    expect(result).toEqual({ flushed: 0, remaining: 1 })
    expect(mutationMock).not.toHaveBeenCalled()
  })

  test("summary is scoped to the active owner and reports oldest and last error", async () => {
    setOfflineQueueOwner("owner-a")
    enqueueOfflineMutation("logs.water.addEntry", { order: 1 })
    enqueueOfflineMutation("logs.foodLogs.setDay", { order: 2 })
    mutationMock.mockImplementation(async () => {
      throw new Error("validation failed")
    })
    await flushOfflineQueue()

    const summary = getOfflineQueueSummary()

    expect(summary.total).toBe(2)
    expect(summary.oldestAt).toBeGreaterThan(0)
    expect(summary.lastError).toBe("validation failed")
  })

  test("offline-like error detection handles navigator state and common messages", () => {
    expect(isOfflineLikeError(new Error("WebSocket disconnected"))).toBe(true)
    expect(isOfflineLikeError(new Error("validation failed"))).toBe(false)

    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    })
    expect(isOfflineLikeError(new Error("any message"))).toBe(true)
  })

  test("browser online helper defaults to online outside browser contexts", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
    })
    expect(isBrowserOnline()).toBe(true)
  })
})
