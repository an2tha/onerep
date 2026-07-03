type ServiceWorkerState = "installing" | "installed" | "activating" | string

type ServiceWorkerLike = {
  state?: ServiceWorkerState
  postMessage?: (message: unknown) => void
  addEventListener?: (type: "statechange", listener: () => void) => void
}

export type AppServiceWorkerRegistration = {
  installing?: ServiceWorkerLike | null
  waiting?: ServiceWorkerLike | null
  addEventListener?: (type: "updatefound", listener: () => void) => void
}

export type AppServiceWorkerContainer = {
  controller?: ServiceWorkerLike | null
  register: (url: string) => Promise<AppServiceWorkerRegistration>
  addEventListener?: (type: "controllerchange", listener: () => void) => void
}

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
    const registration = await serviceWorker.register(url)

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

  let reloaded = false
  serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return
    reloaded = true
    reload()
  })
}
