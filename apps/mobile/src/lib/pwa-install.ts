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

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

export function isPwaStandalone(win: Window = window) {
  const nav = win.navigator as NavigatorWithStandalone
  return Boolean(
    nav.standalone ||
      win.matchMedia?.("(display-mode: standalone)").matches ||
      win.matchMedia?.("(display-mode: fullscreen)").matches
  )
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
