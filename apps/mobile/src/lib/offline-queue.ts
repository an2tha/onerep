import { api } from "../../../../convex/_generated/api"
import { convexClient } from "./convex"
import {
  browserLocalStorage,
  createClientId,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "./utils"

export type OfflineMutationName = keyof typeof MUTATION_REGISTRY

export type OfflineJob = {
  id: string
  name: OfflineMutationName
  args: unknown
  ownerId: string | null
  createdAt: number
  attempts: number
  lastError?: string
}

const STORAGE_KEY = "onerep:offline-mutation-queue:v1"
const OWNER_KEY = "onerep:offline-owner:v1"
const EVENT_NAME = "onerep:offline-queue-changed"
const PERSISTENCE_ERROR_MESSAGE =
  "Could not save this change for offline sync. Please reconnect and try again."

const MUTATION_REGISTRY = {
  "logs.foodLogs.setDay": api.logs.foodLogs.setDay,
  "logs.water.setDay": api.logs.water.setDay,
  "logs.water.addEntry": api.logs.water.addEntry,
  "logs.water.removeEntry": api.logs.water.removeEntry,
  "logs.supplements.setDay": api.logs.supplements.setDay,
  "logs.supplements.addEntry": api.logs.supplements.addEntry,
  "logs.supplements.removeEntry": api.logs.supplements.removeEntry,
  "logs.supplements.saveItem": api.logs.supplements.saveItem,
  "logs.supplements.setItemActive": api.logs.supplements.setItemActive,
  "logs.supplements.removeItem": api.logs.supplements.removeItem,
  "logs.supplements.logTaken": api.logs.supplements.logTaken,
  "logs.supplements.markSkipped": api.logs.supplements.markSkipped,
  "logs.supplements.removeLog": api.logs.supplements.removeLog,
  "logs.workouts.completion": api.logs.workouts.completion,
  "bodyProgress.save": api.bodyProgress.save,
  "bodyProgress.remove": api.bodyProgress.remove,
  "users.users.setBodyReminder": api.users.users.setBodyReminder,
  "users.users.setPushReminders": api.users.users.setPushReminders,
  "users.users.setPrivacySettings": api.users.users.setPrivacySettings,
  "users.users.setWaterGoal": api.users.users.setWaterGoal,
  "users.users.setWeightUnit": api.users.users.setWeightUnit,
  "users.users.setFoodSearchLanguage": api.users.users.setFoodSearchLanguage,
  "users.users.setDashboardSettings": api.users.users.setDashboardSettings,
  "users.users.setCustomGoals": api.users.users.setCustomGoals,
  "users.users.setMacroCycling": api.users.users.setMacroCycling,
  "users.users.setWorkoutAdjustment": api.users.users.setWorkoutAdjustment,
  "users.users.setWidgetLayout": api.users.users.setWidgetLayout,
  "users.users.syncTimezone": api.users.users.syncTimezone,
  "users.schedules.set": api.users.schedules.set,
  "logs.presets.create": api.logs.presets.create,
  "logs.presets.update": api.logs.presets.update,
  "logs.presets.remove": api.logs.presets.remove,
  "logs.mealPresets.create": api.logs.mealPresets.create,
  "logs.mealPresets.remove": api.logs.mealPresets.remove,
  "logs.recipes.save": api.logs.recipes.save,
  "logs.recipes.remove": api.logs.recipes.remove,
} as const

const SINGLETON_COALESCE_MUTATIONS = new Set<OfflineMutationName>([
  "users.users.setBodyReminder",
  "users.users.setPushReminders",
  "users.users.setPrivacySettings",
  "users.users.setWaterGoal",
  "users.users.setWeightUnit",
  "users.users.setFoodSearchLanguage",
  "users.users.setDashboardSettings",
  "users.users.setCustomGoals",
  "users.users.setMacroCycling",
  "users.users.setWorkoutAdjustment",
  "users.users.setWidgetLayout",
  "users.users.syncTimezone",
  "users.schedules.set",
])

let flushing = false

export class OfflineQueuePersistenceError extends Error {
  constructor() {
    super(PERSISTENCE_ERROR_MESSAGE)
    this.name = "OfflineQueuePersistenceError"
  }
}

function hasStorage() {
  return browserLocalStorage() != null
}

function emitQueueChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function setOfflineQueueOwner(ownerId: string | null) {
  if (!hasStorage()) return
  if (ownerId) {
    safeLocalStorageSet(OWNER_KEY, ownerId)
    const queue = readOfflineQueue()
    if (queue.some((job) => !job.ownerId)) {
      writeOfflineQueue(
        queue.map((job) => (job.ownerId ? job : { ...job, ownerId }))
      )
      return
    }
  } else {
    safeLocalStorageRemove(OWNER_KEY)
  }
  emitQueueChanged()
}

export function getOfflineQueueOwner() {
  if (!hasStorage()) return null
  return safeLocalStorageGet(OWNER_KEY)
}

export function readOfflineQueue(): OfflineJob[] {
  if (!hasStorage()) return []
  try {
    const raw = safeLocalStorageGet(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOfflineQueue(queue: OfflineJob[]) {
  if (!hasStorage()) return false
  const persisted =
    queue.length === 0
      ? safeLocalStorageRemove(STORAGE_KEY)
      : safeLocalStorageSet(STORAGE_KEY, JSON.stringify(queue))
  if (!persisted) return false
  emitQueueChanged()
  return true
}

export function clearOfflineQueue() {
  if (!hasStorage()) return
  safeLocalStorageRemove(STORAGE_KEY)
  emitQueueChanged()
}

function objectArgs(args: unknown): Record<string, unknown> | null {
  return typeof args === "object" && args !== null
    ? (args as Record<string, unknown>)
    : null
}

function offlineMutationCoalesceKey(
  name: OfflineMutationName,
  args: unknown
) {
  if (
    name === "logs.foodLogs.setDay" ||
    name === "logs.water.setDay" ||
    name === "logs.supplements.setDay"
  ) {
    const date = objectArgs(args)?.date
    return typeof date === "string" ? `${name}:${date}` : null
  }

  if (SINGLETON_COALESCE_MUTATIONS.has(name)) {
    return name
  }

  return null
}

export function enqueueOfflineMutation(
  name: OfflineMutationName,
  args: unknown
) {
  const job: OfflineJob = {
    id: createClientId(),
    name,
    args,
    ownerId: getOfflineQueueOwner(),
    createdAt: Date.now(),
    attempts: 0,
  }

  const coalesceKey = offlineMutationCoalesceKey(name, args)
  const queue = readOfflineQueue()
  const nextQueue = coalesceKey
    ? queue.filter((existingJob) => {
        if (existingJob.ownerId !== job.ownerId) return true
        return (
          offlineMutationCoalesceKey(existingJob.name, existingJob.args) !==
          coalesceKey
        )
      })
    : queue

  if (!writeOfflineQueue([...nextQueue, job])) {
    throw new OfflineQueuePersistenceError()
  }
  return job
}

export function subscribeOfflineQueue(listener: () => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(EVENT_NAME, listener)
  window.addEventListener("storage", listener)
  return () => {
    window.removeEventListener(EVENT_NAME, listener)
    window.removeEventListener("storage", listener)
  }
}

export function isBrowserOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine
}

export function isOfflineLikeError(error: unknown) {
  if (!isBrowserOnline()) return true
  const message = error instanceof Error ? error.message : String(error)
  return /network|fetch|offline|disconnected|failed to send|websocket/i.test(
    message
  )
}

export async function flushOfflineQueue() {
  if (flushing || !hasStorage())
    return { flushed: 0, remaining: readOfflineQueue().length }
  if (!isBrowserOnline()) {
    return { flushed: 0, remaining: readOfflineQueue().length }
  }

  flushing = true
  let flushed = 0
  const ownerId = getOfflineQueueOwner()
  const queue = readOfflineQueue()
  const remaining: OfflineJob[] = []

  try {
    for (const job of queue) {
      if (!ownerId || job.ownerId !== ownerId) {
        remaining.push(job)
        continue
      }

      const mutation = MUTATION_REGISTRY[job.name]
      if (!mutation) {
        flushed += 1
        continue
      }

      try {
        await convexClient.mutation(mutation, job.args as never)
        flushed += 1
      } catch (error) {
        remaining.push({
          ...job,
          attempts: job.attempts + 1,
          lastError: error instanceof Error ? error.message : String(error),
        })

        if (isOfflineLikeError(error)) {
          const currentIndex = queue.findIndex(
            (queuedJob) => queuedJob.id === job.id
          )
          remaining.push(...queue.slice(currentIndex + 1))
          break
        }
      }
    }
  } finally {
    writeOfflineQueue(remaining)
    flushing = false
  }

  return { flushed, remaining: remaining.length }
}

export function getOfflineQueueSummary() {
  const ownerId = getOfflineQueueOwner()
  const jobs = readOfflineQueue()
  const visibleJobs = jobs.filter((job) => !ownerId || job.ownerId === ownerId)
  return {
    total: visibleJobs.length,
    oldestAt: visibleJobs[0]?.createdAt ?? null,
    lastError:
      [...visibleJobs].reverse().find((job) => job.lastError)?.lastError ??
      null,
  }
}
