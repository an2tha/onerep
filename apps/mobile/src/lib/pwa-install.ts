export type PwaInstallOutcome = "accepted" | "dismissed"

export type PwaBeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: PwaInstallOutcome; platform?: string }>
}

export type PwaInstallCopy = {
  actionLabel: string
  description: string
  disabled: boolean
  statusLabel: string
}

export type PwaInstallState = {
  installed: boolean
  prompt: PwaBeforeInstallPromptEvent | null
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

type InstallStateListener = (state: PwaInstallState) => void

let deferredPrompt: PwaBeforeInstallPromptEvent | null = null
let installed = false
let initialized = false
const listeners = new Set<InstallStateListener>()

export function isPwaStandalone(win: Window = window) {
  const nav = win.navigator as NavigatorWithStandalone
  return Boolean(
    nav.standalone ||
      win.matchMedia?.("(display-mode: standalone)").matches ||
      win.matchMedia?.("(display-mode: fullscreen)").matches
  )
}

function snapshot(): PwaInstallState {
  return { installed, prompt: deferredPrompt }
}

function notifyInstallState() {
  const state = snapshot()
  for (const listener of listeners) listener(state)
}

/**
 * Start listening as soon as the app module loads. Browsers may emit
 * beforeinstallprompt before the user ever opens Settings, so the deferred
 * event must be retained globally rather than by the Settings page.
 */
export function initializePwaInstallTracking(win: Window = window) {
  if (initialized) return snapshot()
  initialized = true
  installed = isPwaStandalone(win)

  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    if (isPwaStandalone(win)) return
    deferredPrompt = event as PwaBeforeInstallPromptEvent
    installed = false
    notifyInstallState()
  })

  win.addEventListener("appinstalled", () => {
    deferredPrompt = null
    installed = true
    notifyInstallState()
  })

  return snapshot()
}

export function subscribePwaInstallState(listener: InstallStateListener) {
  listeners.add(listener)
  listener(snapshot())
  return () => {
    listeners.delete(listener)
  }
}

export function takePwaInstallPrompt() {
  const prompt = deferredPrompt
  deferredPrompt = null
  notifyInstallState()
  return prompt
}

export function pwaInstallCopy({
  hasPrompt,
  installed,
}: {
  hasPrompt: boolean
  installed: boolean
}): PwaInstallCopy {
  if (installed) {
    return {
      actionLabel: "Installed",
      description: "OneRep is already installed on this device.",
      disabled: true,
      statusLabel: "Installed",
    }
  }

  if (hasPrompt) {
    return {
      actionLabel: "Install",
      description: "Add OneRep to your home screen for faster launches.",
      disabled: false,
      statusLabel: "Ready",
    }
  }

  return {
    actionLabel: "Not available",
    description:
      "Use your browser's share or menu button to add OneRep to your home screen.",
    disabled: true,
    statusLabel: "Manual",
  }
}
