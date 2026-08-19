import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle } from "@capacitor/haptics"
import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"

export const HAPTICS_ENABLED_KEY = "onerep:haptics-enabled"

/**
 * Asked per call rather than cached at module scope: whichever module happens
 * to import this one first would otherwise freeze the answer, which under
 * `bun test` means the first test file to pull in a component decides what
 * every later file sees.
 */
function isNative() {
  return Capacitor.isNativePlatform()
}

/**
 * Fire-and-forget haptic helpers.
 * We intentionally do NOT await the bridge call — awaiting can defer the
 * native haptic until the current micro-task queue drains, which means the
 * user feels the buzz only after a page-transition animation finishes
 * instead of on the tap itself.
 */

export function hapticsEnabled() {
  return safeLocalStorageGet(HAPTICS_ENABLED_KEY) !== "false"
}

export function setHapticsEnabled(enabled: boolean) {
  return safeLocalStorageSet(HAPTICS_ENABLED_KEY, String(enabled))
}

export function hapticTap() {
  if (!isNative() || !hapticsEnabled()) return
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}

export function hapticMedium() {
  if (!isNative() || !hapticsEnabled()) return
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
}

export function hapticHeavy() {
  if (!isNative() || !hapticsEnabled()) return
  Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {})
}

export function hapticSelection() {
  if (!isNative() || !hapticsEnabled()) return
  Haptics.selectionChanged().catch(() => {})
}

/**
 * Rain, as the vibration motor understands it: one medium impact for the
 * splash, then a few lighter ones falling out of time with each other so it
 * reads as scattered drops rather than a metronome. Timers are unowned by
 * design — the whole thing is over in a third of a second, and cancelling a
 * finished buzz helps nobody.
 */
export function hapticRain() {
  if (!isNative() || !hapticsEnabled()) return
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
  for (const delay of [70, 135, 185, 260]) {
    window.setTimeout(() => {
      if (!hapticsEnabled()) return
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    }, delay)
  }
}
