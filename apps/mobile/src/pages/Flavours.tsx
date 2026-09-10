import { useEffect, useRef, type CSSProperties } from "react"
import { Check, X } from "@phosphor-icons/react"
import { hapticTap } from "@/lib/haptics"
import { useTheme, type VisualIdentity } from "@repo/ui"

const DESCRIPTIONS: Record<string, string> = {
  onerep: "The original OneRep palette",
  dusk: "Earth tones and evening violet",
  slate: "Cool blues and mineral neutrals",
  forest: "Moss, green and amber",
  ocean: "Sea blue and clear teal",
  blossom: "Rose, lavender and fresh green"
}

const APPEARANCES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" }
] as const

// Both versions are rendered so following the system appearance updates the
// swatches immediately through the same .dark class as the rest of the app.
function paletteStyle(flavour: VisualIdentity, appearance: "light" | "dark") {
  const tokens = { ...flavour.tokens, ...flavour[appearance] }
  const defaults =
    appearance === "dark"
      ? ["#a6a6ff", "#66b8ef", "#ef9a68"]
      : ["#5b5bd6", "#1673b1", "#b55324"]
  return {
    "--swatch-training": tokens["--accent-workout"] ?? defaults[0],
    "--swatch-water": tokens["--accent-water"] ?? defaults[1],
    "--swatch-food": tokens["--accent-food"] ?? defaults[2]
  } as CSSProperties
}

export function Flavours({
  closing,
  onClose
}: {
  closing: boolean
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const { identity, setIdentity, identities, theme, setTheme } = useTheme()

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    closeRef.current?.focus()
    return () => {
      if (dialog?.contains(document.activeElement)) previousFocus?.focus()
    }
  }, [])
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
      if (event.key !== "Tab") return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input[type="radio"]:checked'
      )
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="flavours-title"
      data-state={closing ? "closing" : "open"}
      className="quick-add-more flavours-overlay fixed inset-0 z-[61] text-foreground"
    >
      <div className="flavours-page">
        <header className="flavours-header">
          <div>
            <h1 id="flavours-title">Flavours</h1>
            <p>Choose a palette. Changes apply instantly.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Back to settings"
            onClick={() => {
              hapticTap()
              onClose()
            }}
            className="flavours-close motion-tactile"
          >
            <X size={19} weight="bold" />
          </button>
        </header>

        <div className="flavours-content">
          <fieldset className="flavours-appearance">
            <legend>Appearance</legend>
            <div className="flavours-appearance-options">
              {APPEARANCES.map(({ value, label }) => (
                <label key={value}>
                  <input
                    className="sr-only"
                    type="radio"
                    name="flavour-appearance"
                    value={value}
                    checked={theme === value}
                    onChange={() => {
                      hapticTap()
                      setTheme(value)
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flavours-options">
            <legend className="sr-only">Choose flavour</legend>
            {identities.map((flavour) => (
              <label key={flavour.id} className="flavours-option">
                <input
                  className="sr-only"
                  type="radio"
                  name="visual-flavour"
                  value={flavour.id}
                  checked={identity === flavour.id}
                  onChange={() => {
                    hapticTap()
                    setIdentity(flavour.id)
                  }}
                />
                <span className="flavours-option-copy">
                  <span className="flavours-option-name">{flavour.label}</span>
                  <span className="flavours-option-description">
                    {DESCRIPTIONS[flavour.id]}
                  </span>
                </span>
                <span className="flavours-swatches" aria-hidden="true">
                  {(["light", "dark"] as const).map((appearance) => (
                    <span
                      key={appearance}
                      data-appearance={appearance}
                      style={paletteStyle(flavour, appearance)}
                    >
                      <i />
                      <i />
                      <i />
                    </span>
                  ))}
                </span>
                <span className="flavours-check" aria-hidden="true">
                  {identity === flavour.id && <Check size={18} weight="bold" />}
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </div>
    </div>
  )
}
