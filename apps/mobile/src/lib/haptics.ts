import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle } from "@capacitor/haptics"
import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"

export const HAPTICS_ENABLED_KEY = "onerep:haptics-enabled"
export const HAPTICS_STRENGTH_KEY = "onerep:haptics-strength"

/**
 * How hard the phone is allowed to hit back.
 *
 * Android routes every one of these through a vibration motor that has no
 * opinion about nuance, so a "light" tap on a Pixel lands somewhere between a
 * knock and a threat. Rather than pretend the ladder is only on or off, the
 * setting picks a ceiling and every call gets clamped down to it.
 */
export type HapticStrength = "off" | "light" | "medium" | "full"

export const HAPTIC_STRENGTHS: readonly HapticStrength[] = [
  "off",
  "light",
  "medium",
  "full",
]

/**
 * Nominal intensity a call site asks for, before the user's ceiling applies.
 */
type HapticLevel = "light" | "medium" | "heavy"

const LEVEL_ORDER: HapticLevel[] = ["light", "medium", "heavy"]

/**
 * The ceiling each strength imposes. "light" collapses everything to the
 * gentlest impact; "medium" lets a heavy hit land as medium; "full" is the
 * behaviour that shipped before this setting existed.
 */
const STRENGTH_CEILING: Record<Exclude<HapticStrength, "off">, HapticLevel> = {
  light: "light",
  medium: "medium",
  full: "heavy",
}

const IMPACT_STYLE: Record<HapticLevel, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
}

/**
 * Asked per call rather than cached at module scope: whichever module happens
 * to import this one first would otherwise freeze the answer, which under
 * `bun test` means the first test file to pull in a component decides what
 * every later file sees.
 */
function isNative() {
  return Capacitor.isNativePlatform()
}

function isStrength(value: string | null): value is HapticStrength {
  return value !== null && (HAPTIC_STRENGTHS as string[]).includes(value)
}

/**
 * The strength setting is the source of truth. The old boolean key is still
 * read once, for phones that turned haptics off before the dial existed —
 * silently re-enabling them would be a rude way to announce a new feature.
 */
export function hapticStrength(): HapticStrength {
  const stored = safeLocalStorageGet(HAPTICS_STRENGTH_KEY)
  if (isStrength(stored)) return stored
  return safeLocalStorageGet(HAPTICS_ENABLED_KEY) === "false" ? "off" : "full"
}

export function setHapticStrength(strength: HapticStrength) {
  // The legacy key is kept in step so a downgrade — an OTA rollback, an older
  // build sideloaded over this one — still honours a user who wanted silence.
  safeLocalStorageSet(HAPTICS_ENABLED_KEY, String(strength !== "off"))
  return safeLocalStorageSet(HAPTICS_STRENGTH_KEY, strength)
}

export function hapticsEnabled() {
  return hapticStrength() !== "off"
}

export function setHapticsEnabled(enabled: boolean) {
  return setHapticStrength(enabled ? "full" : "off")
}

/**
 * Fire-and-forget haptic helpers.
 * We intentionally do NOT await the bridge call — awaiting can defer the
 * native haptic until the current micro-task queue drains, which means the
 * user feels the buzz only after a page-transition animation finishes
 * instead of on the tap itself.
 */
function impact(level: HapticLevel) {
  if (!isNative()) return
  const strength = hapticStrength()
  if (strength === "off") return
  const ceiling = STRENGTH_CEILING[strength]
  const clamped =
    LEVEL_ORDER.indexOf(level) <= LEVEL_ORDER.indexOf(ceiling) ? level : ceiling
  Haptics.impact({ style: IMPACT_STYLE[clamped] }).catch(() => {})
}

export function hapticTap() {
  impact("light")
}

export function hapticMedium() {
  impact("medium")
}

export function hapticHeavy() {
  impact("heavy")
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
 *
 * At the lowest strength the drizzle is cut to two drops: four gentle taps in
 * a row on a phone tuned down to gentle is just the buzz the user turned off,
 * spread thin.
 */
export function hapticRain() {
  if (!isNative()) return
  const strength = hapticStrength()
  if (strength === "off") return
  impact("medium")
  const delays = strength === "light" ? [90, 200] : [70, 135, 185, 260]
  for (const delay of delays) {
    window.setTimeout(() => {
      impact("light")
    }, delay)
  }
}
