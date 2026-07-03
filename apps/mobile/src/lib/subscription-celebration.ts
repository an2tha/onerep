import { hapticHeavy, hapticMedium, hapticSelection } from "@/lib/haptics"

const CONFETTI_COLORS = [
  "#ff4d6d",
  "#ffd166",
  "#06d6a0",
  "#4cc9f0",
  "#b517ff",
  "#ff9f1c",
  "var(--accent-food)",
  "var(--accent-workout)",
  "var(--accent-progress)",
  "var(--accent-water)",
]

export function celebrateSubscription() {
  hapticHeavy()
  window.setTimeout(hapticMedium, 160)
  window.setTimeout(hapticSelection, 320)
  window.setTimeout(hapticMedium, 640)
  window.setTimeout(hapticSelection, 960)
  window.setTimeout(hapticHeavy, 1400)
  window.setTimeout(hapticSelection, 1900)
  window.setTimeout(hapticMedium, 2600)
  window.setTimeout(hapticSelection, 3400)
  window.setTimeout(hapticHeavy, 4300)
  window.setTimeout(hapticSelection, 5000)

  if (typeof document === "undefined") return

  const root = document.createElement("div")
  root.className = "onerep-confetti-root"

  for (let index = 0; index < 150; index += 1) {
    const piece = document.createElement("span")
    const size = 4 + Math.random() * 8
    piece.className = "onerep-confetti-piece"
    piece.style.setProperty("--start-x", `${Math.random() * 100}vw`)
    piece.style.setProperty("--drift", `${Math.random() * 240 - 120}px`)
    piece.style.setProperty("--r", `${Math.random() * 1080 - 540}deg`)
    piece.style.setProperty("--delay", `${Math.random() * 1400}ms`)
    piece.style.setProperty("--duration", `${3400 + Math.random() * 1600}ms`)
    piece.style.width = `${size}px`
    piece.style.height = `${size * (0.55 + Math.random() * 0.75)}px`
    piece.style.borderRadius = Math.random() > 0.5 ? "999px" : "2px"
    piece.style.background =
      CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? "var(--foreground)"
    root.appendChild(piece)
  }

  document.body.appendChild(root)
  window.setTimeout(() => root.remove(), 5200)
}
