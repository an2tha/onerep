import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function createClientId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export type StorageLike = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
> &
  Partial<Pick<Storage, "key" | "length">>

function browserStorage(kind: "localStorage" | "sessionStorage") {
  try {
    if (typeof window !== "undefined" && window[kind]) {
      return window[kind] as StorageLike
    }
    return (
      (
        globalThis as typeof globalThis &
          Partial<Record<typeof kind, StorageLike>>
      )[kind] ?? null
    )
  } catch {
    return null
  }
}

export function browserLocalStorage() {
  return browserStorage("localStorage")
}

export function browserSessionStorage() {
  return browserStorage("sessionStorage")
}

export function safeStorageKeys(storage: StorageLike | null) {
  if (!storage?.key || typeof storage.length !== "number") return []

  const keys: string[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key) keys.push(key)
    }
  } catch {
    return []
  }
  return keys
}

export function safeLocalStorageGet(key: string) {
  try {
    return browserLocalStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function safeLocalStorageSet(key: string, value: string) {
  try {
    const storage = browserLocalStorage()
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeLocalStorageRemove(key: string) {
  try {
    const storage = browserLocalStorage()
    if (!storage) return false
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function safeSessionStorageGet(key: string) {
  try {
    return browserSessionStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function safeSessionStorageSet(key: string, value: string) {
  try {
    const storage = browserSessionStorage()
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeSessionStorageRemove(key: string) {
  try {
    const storage = browserSessionStorage()
    if (!storage) return false
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function logDevDebug(...args: unknown[]) {
  if (import.meta.env.DEV) console.debug(...args)
}

export function logDevWarn(...args: unknown[]) {
  if (import.meta.env.DEV) console.warn(...args)
}

export function logDevError(...args: unknown[]) {
  if (import.meta.env.DEV) console.error(...args)
}
