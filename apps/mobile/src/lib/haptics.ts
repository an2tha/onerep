import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle } from "@capacitor/haptics"

const IS_NATIVE = Capacitor.isNativePlatform()

/**
 * Fire-and-forget haptic helpers.
 * We intentionally do NOT await the bridge call — awaiting can defer the
 * native haptic until the current micro-task queue drains, which means the
 * user feels the buzz only after a page-transition animation finishes
 * instead of on the tap itself.
 */

export function hapticTap() {
  if (!IS_NATIVE) return
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}

export function hapticMedium() {
  if (!IS_NATIVE) return
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
}

export function hapticHeavy() {
  if (!IS_NATIVE) return
  Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {})
}

export function hapticSelection() {
  if (!IS_NATIVE) return
  Haptics.selectionChanged().catch(() => {})
}
