type ServiceWorkerState = "installing" | "installed" | "activating" | string

type ServiceWorkerLike = {
  state?: ServiceWorkerState
  postMessage?: (message: unknown) => void
  addEventListener?: (type: "statechange", listener: () => void) => void
}

export type AppServiceWorkerRegistration = {
  installing?: ServiceWorkerLike | null
  waiting?: ServiceWorkerLike | null
  update?: () => Promise<unknown>
  addEventListener?: (type: "updatefound", listener: () => void) => void
}

export type AppServiceWorkerContainer = {
  controller?: ServiceWorkerLike | null
  register: (
    url: string,
    options?: { scope?: string; updateViaCache?: "all" | "imports" | "none" }
  ) => Promise<AppServiceWorkerRegistration>
  getRegistrations?: () => Promise<
    readonly { unregister: () => Promise<boolean> }[]
  >
  addEventListener?: (type: "controllerchange", listener: () => void) => void
  removeEventListener?: (type: "controllerchange", listener: () => void) => void
}

type AppCacheStorage = {
  keys: () => Promise<string[]>
  delete: (key: string) => Promise<boolean>
}

/** Cache-name prefix used by public/sw.js. */
const APP_CACHE_PREFIX = "onerep-app-"

type RegisterAppServiceWorkerOptions = {
  onError?: (error: unknown) => void
  onUpdate?: (registration: AppServiceWorkerRegistration) => void
  serviceWorker?: AppServiceWorkerContainer | null
  url?: string
}

function browserServiceWorker() {
  if (typeof navigator === "undefined") return null
  return "serviceWorker" in navigator ? navigator.serviceWorker : null
}

export function canUseAppServiceWorker() {
  if (typeof window === "undefined") return false
  if (window.isSecureContext === false) return false
  return browserServiceWorker() != null
}

export async function registerAppServiceWorker({
  onError,
  onUpdate,
  serviceWorker = browserServiceWorker(),
  url = "/sw.js",
}: RegisterAppServiceWorkerOptions = {}) {
  if (!serviceWorker || !canUseAppServiceWorker()) return null

  try {
    const registration = await serviceWorker.register(url, {
      scope: "/",
      updateViaCache: "none",
    })

    if (registration.waiting && serviceWorker.controller) {
      onUpdate?.(registration)
    }

    registration.addEventListener?.("updatefound", () => {
      const installing = registration.installing
      if (!installing) return

      installing.addEventListener?.("statechange", () => {
        if (installing.state === "installed" && serviceWorker.controller) {
          onUpdate?.(registration)
        }
      })
    })

    return registration
  } catch (error) {
    onError?.(error)
    return null
  }
}

/**
 * Removes the service worker and its caches. Used on native, where the OTA
 * updater owns updates instead.
 *
 * Android serves the app over https://localhost through WebViewAssetLoader,
 * which does support service workers, so sw.js genuinely installs there. When
 * the updater swaps the bundle it changes the backing directory, not the
 * origin — so a surviving cache would keep serving the previous index.html and
 * its hashed assets, and the update would silently not take effect.
 *
 * This actively unregisters rather than merely declining to register, because
 * devices running an earlier build already have one installed.
 */
export async function unregisterAppServiceWorker(
  serviceWorker: AppServiceWorkerContainer | null = browserServiceWorker(),
  cacheStorage: AppCacheStorage | undefined = typeof caches === "undefined"
    ? undefined
    : caches
) {
  let removed = false

  try {
    const registrations = (await serviceWorker?.getRegistrations?.()) ?? []
    for (const registration of registrations) {
      await registration.unregister()
      removed = true
    }
  } catch (error) {
    console.warn("Service worker unregistration failed", error)
  }

  try {
    const keys = (await cacheStorage?.keys()) ?? []
    for (const key of keys) {
      // Only our own caches: anything else in this origin belongs to code we
      // do not control.
      if (!key.startsWith(APP_CACHE_PREFIX)) continue
      await cacheStorage?.delete(key)
      removed = true
    }
  } catch (error) {
    console.warn("Service worker cache cleanup failed", error)
  }

  return removed
}

export function activateWaitingServiceWorker(
  registration: AppServiceWorkerRegistration
) {
  registration.waiting?.postMessage?.({ type: "SKIP_WAITING" })
}

export function reloadWhenServiceWorkerControlsPage(
  serviceWorker: AppServiceWorkerContainer | null = browserServiceWorker(),
  reload = () => {
    if (typeof window !== "undefined") window.location.reload()
  }
) {
  if (!serviceWorker?.addEventListener) return

  // Claiming the first installed worker must not refresh a user's first visit.
  // A controller present at startup means controllerchange is a real update.
  const hadController = Boolean(serviceWorker.controller)
  let reloaded = false
  const handleControllerChange = () => {
    if (!hadController || reloaded) return
    reloaded = true
    reload()
  }
  serviceWorker.addEventListener("controllerchange", handleControllerChange)
  return () =>
    serviceWorker.removeEventListener?.(
      "controllerchange",
      handleControllerChange
    )
}
