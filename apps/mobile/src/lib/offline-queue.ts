import { api } from "../../../../convex/_generated/api"
import { convexClient } from "./convex"

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

const MUTATION_REGISTRY = {
  "logs.foodLogs.setDay": api.logs.foodLogs.setDay,
  "logs.water.setDay": api.logs.water.setDay,
  "logs.water.addEntry": api.logs.water.addEntry,
  "logs.workouts.completion": api.logs.workouts.completion,
  "bodyProgress.save": api.bodyProgress.save,
  "bodyProgress.remove": api.bodyProgress.remove,
  "users.users.setBodyReminder": api.users.users.setBodyReminder,
  "users.users.setPushReminders": api.users.users.setPushReminders,
  "users.users.setPrivacySettings": api.users.users.setPrivacySettings,
  "users.users.setWaterGoal": api.users.users.setWaterGoal,
  "users.users.setWeightUnit": api.users.users.setWeightUnit,
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
  "logs.recipes.save": api.logs.recipes.save,
  "logs.recipes.remove": api.logs.recipes.remove,
} as const

let flushing = false

function hasStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

function emitQueueChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function setOfflineQueueOwner(ownerId: string | null) {
  if (!hasStorage()) return
  if (ownerId) {
    localStorage.setItem(OWNER_KEY, ownerId)
    const queue = readOfflineQueue()
    if (queue.some((job) => !job.ownerId)) {
      writeOfflineQueue(queue.map((job) => (job.ownerId ? job : { ...job, ownerId })))
      return
    }
  } else {
    localStorage.removeItem(OWNER_KEY)
  }
  emitQueueChanged()
}

export function getOfflineQueueOwner() {
  if (!hasStorage()) return null
  return localStorage.getItem(OWNER_KEY)
}

export function readOfflineQueue(): OfflineJob[] {
  if (!hasStorage()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOfflineQueue(queue: OfflineJob[]) {
  if (!hasStorage()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  emitQueueChanged()
}

export function clearOfflineQueue() {
  if (!hasStorage()) return
  localStorage.removeItem(STORAGE_KEY)
  emitQueueChanged()
}

export function enqueueOfflineMutation(name: OfflineMutationName, args: unknown) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`

  const job: OfflineJob = {
    id,
    name,
    args,
    ownerId: getOfflineQueueOwner(),
    createdAt: Date.now(),
    attempts: 0,
  }

  writeOfflineQueue([...readOfflineQueue(), job])
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

export function isOfflineLikeError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true
  const message = error instanceof Error ? error.message : String(error)
  return /network|fetch|offline|disconnected|failed to send|websocket/i.test(message)
}

export async function flushOfflineQueue() {
  if (flushing || !hasStorage()) return { flushed: 0, remaining: readOfflineQueue().length }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
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
          const currentIndex = queue.findIndex((queuedJob) => queuedJob.id === job.id)
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
    lastError: [...visibleJobs].reverse().find((job) => job.lastError)?.lastError ?? null,
  }
}
