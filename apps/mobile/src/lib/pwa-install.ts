import { tr } from "@repo/ui/i18n"
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

/**
 * Where install guidance has to come from when beforeinstallprompt never
 * fires — which is every browser except Chromium. "in-app" means an embedded
 * webview (Instagram, Facebook, TikTok, the Google app…) where installation
 * is impossible until the user escapes to a real browser.
 */
export type PwaInstallPlatform =
  "chromium" | "ios" | "safari-desktop" | "in-app" | "other"

export function detectPwaInstallPlatform(
  win: Window = window
): PwaInstallPlatform {
  const ua = win.navigator.userAgent
  if (
    /\b(FBAN|FBAV|Instagram|Snapchat|musical_ly|BytedanceWebview|LinkedInApp|GSA\/|Line\/)|; wv\)/i.test(
      ua
    )
  ) {
    return "in-app"
  }
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports itself as a Mac; touch support gives it away.
    (ua.includes("Macintosh") && (win.navigator.maxTouchPoints ?? 0) > 1)
  if (isIos) return "ios"
  if (/Chrome|Chromium|Edg\//.test(ua)) return "chromium"
  if (/Safari\//.test(ua)) return "safari-desktop"
  return "other"
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
  platform = "other",
}: {
  hasPrompt: boolean
  installed: boolean
  platform?: PwaInstallPlatform
}): PwaInstallCopy {
  if (installed) {
    return {
      actionLabel: tr("Installed"),
      description: tr("OneRep is already installed on this device."),
      disabled: true,
      statusLabel: tr("Installed"),
    }
  }

  if (hasPrompt) {
    return {
      actionLabel: tr("Install"),
      description: tr("Add OneRep to your home screen for faster launches."),
      disabled: false,
      statusLabel: tr("Ready"),
    }
  }

  // No prompt will ever arrive on these platforms, so the tile stays
  // tappable and the description carries the actual steps.
  switch (platform) {
    case "ios":
      return {
        actionLabel: tr("How to install"),
        description: tr(
          "Tap the Share button, then choose “Add to Home Screen”."
        ),
        disabled: false,
        statusLabel: tr("Manual"),
      }
    case "safari-desktop":
      return {
        actionLabel: tr("How to install"),
        description: tr("In Safari's File menu, choose “Add to Dock”."),
        disabled: false,
        statusLabel: tr("Manual"),
      }
    case "in-app":
      return {
        actionLabel: tr("Open in browser"),
        description: tr(
          "This in-app browser can't install apps. Open app.onerep.life in Safari or Chrome, then install from there."
        ),
        disabled: false,
        statusLabel: tr("Blocked"),
      }
    case "chromium":
      return {
        actionLabel: tr("How to install"),
        description: tr(
          "Look for the install icon in the address bar, or choose “Add to Home screen” from the browser menu."
        ),
        disabled: false,
        statusLabel: tr("Manual"),
      }
    default:
      return {
        actionLabel: tr("How to install"),
        description: tr(
          "Use your browser's share or menu button to add OneRep to your home screen."
        ),
        disabled: false,
        statusLabel: tr("Manual"),
      }
  }
}
