import { describe, expect, test } from "bun:test"
import { isPwaStandalone, pwaInstallCopy } from "../pwa-install"

function fakeWindow({
  displayMode = false,
  fullscreen = false,
  standalone = false,
}: {
  displayMode?: boolean
  fullscreen?: boolean
  standalone?: boolean
}) {
  return {
    navigator: { standalone },
    matchMedia: (query: string) => ({
      matches:
        (query === "(display-mode: standalone)" && displayMode) ||
        (query === "(display-mode: fullscreen)" && fullscreen),
    }),
  } as unknown as Window
}

describe("PWA install helpers", () => {
  test("detects standalone display mode", () => {
    expect(isPwaStandalone(fakeWindow({ displayMode: true }))).toBe(true)
  })

  test("detects iOS navigator standalone mode", () => {
    expect(isPwaStandalone(fakeWindow({ standalone: true }))).toBe(true)
  })

  test("detects fullscreen installed mode", () => {
    expect(isPwaStandalone(fakeWindow({ fullscreen: true }))).toBe(true)
  })

  test("reports install-ready copy when a prompt is available", () => {
    expect(pwaInstallCopy({ hasPrompt: true, installed: false })).toEqual({
      actionLabel: "Install",
      description: "Add OneRep to your home screen for faster launches.",
      disabled: false,
      statusLabel: "Ready",
    })
  })

  test("reports installed copy when already running as an app", () => {
    expect(pwaInstallCopy({ hasPrompt: true, installed: true })).toEqual({
      actionLabel: "Installed",
      description: "OneRep is already installed on this device.",
      disabled: true,
      statusLabel: "Installed",
    })
  })

  test("reports manual install guidance when no prompt is available", () => {
    expect(pwaInstallCopy({ hasPrompt: false, installed: false })).toEqual({
      actionLabel: "Not available",
      description:
        "Use your browser's share or menu button to add OneRep to your home screen.",
      disabled: true,
      statusLabel: "Manual",
    })
  })
})
