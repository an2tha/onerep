import { hapticHeavy, hapticMedium, hapticSelection } from "@/lib/haptics"

const CONFETTI_COLORS = [
  "var(--foreground)",
  "var(--accent-food)",
  "var(--accent-workout)",
  "var(--accent-progress)",
  "var(--accent-water)",
]

export function celebrateSubscription() {
  hapticHeavy()
  window.setTimeout(hapticMedium, 90)
  window.setTimeout(hapticSelection, 180)

  if (typeof document === "undefined") return

  const root = document.createElement("div")
  root.className = "onerep-confetti-root"

  for (let index = 0; index < 42; index += 1) {
    const piece = document.createElement("span")
    const angle = -70 + Math.random() * 140
    const distance = 120 + Math.random() * 180
    const size = 5 + Math.random() * 7
    piece.className = "onerep-confetti-piece"
    piece.style.setProperty("--x", `${Math.cos(angle) * distance}px`)
    piece.style.setProperty("--y", `${Math.sin(angle) * distance}px`)
    piece.style.setProperty("--r", `${Math.random() * 720 - 360}deg`)
    piece.style.setProperty("--delay", `${Math.random() * 90}ms`)
    piece.style.width = `${size}px`
    piece.style.height = `${size * (0.55 + Math.random() * 0.75)}px`
    piece.style.background =
      CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? "var(--foreground)"
    root.appendChild(piece)
  }

  document.body.appendChild(root)
  window.setTimeout(() => root.remove(), 1100)
}
