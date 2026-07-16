import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"

export const REST_BELL_ENABLED_KEY = "onerep:rest-bell-enabled"
export const REST_VIBRATION_ENABLED_KEY = "onerep:rest-vibration-enabled"

export function restBellEnabled() {
  return safeLocalStorageGet(REST_BELL_ENABLED_KEY) !== "false"
}

export function restVibrationEnabled() {
  return safeLocalStorageGet(REST_VIBRATION_ENABLED_KEY) !== "false"
}

export function setRestBellEnabled(enabled: boolean) {
  safeLocalStorageSet(REST_BELL_ENABLED_KEY, String(enabled))
}

export function setRestVibrationEnabled(enabled: boolean) {
  safeLocalStorageSet(REST_VIBRATION_ENABLED_KEY, String(enabled))
}

/** A soft, two-tone completion bell synthesized locally (no media asset/network latency). */
export function playRestCompletion() {
  if (restBellEnabled() && typeof AudioContext !== "undefined") {
    const context = new AudioContext()
    const gain = context.createGain()
    gain.connect(context.destination)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.35)
    ;[659.25, 987.77].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      oscillator.start(context.currentTime + index * 0.12)
      oscillator.stop(context.currentTime + 1.4)
    })
    window.setTimeout(() => void context.close(), 1600)
  }
  if (restVibrationEnabled()) navigator.vibrate?.([120, 70, 180])
}

const COLORS = ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#b517ff", "#ff9f1c"]

/** Celebrations are intentionally not preference-gated. */
export function celebrateAchievement(intensity: "target" | "workout" = "target") {
  if (typeof document === "undefined") return
  const root = document.createElement("div")
  root.className = "onerep-confetti-root"
  const count = intensity === "workout" ? 150 : 56
  for (let index = 0; index < count; index += 1) {
    const piece = document.createElement("span")
    const size = 4 + Math.random() * 7
    piece.className = "onerep-confetti-piece"
    piece.style.setProperty("--start-x", `${Math.random() * 100}vw`)
    piece.style.setProperty("--drift", `${Math.random() * 220 - 110}px`)
    piece.style.setProperty("--r", `${Math.random() * 1080 - 540}deg`)
    piece.style.setProperty("--delay", `${Math.random() * (intensity === "workout" ? 1000 : 300)}ms`)
    piece.style.setProperty("--duration", `${2200 + Math.random() * 1400}ms`)
    piece.style.width = `${size}px`
    piece.style.height = `${size * 0.7}px`
    piece.style.background = COLORS[index % COLORS.length]!
    root.appendChild(piece)
  }
  document.body.appendChild(root)
  window.setTimeout(() => root.remove(), 4000)
}
