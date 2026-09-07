import { useEffect, useRef } from "react"
import { X } from "@phosphor-icons/react"
import { hapticTap } from "@/lib/haptics"
import { useTheme } from "@repo/ui"
import { FlavourCarousel } from "@/components/flavour-carousel"

const TITLE = "Flavours"

export function Flavours({
  closing,
  onClose,
}: {
  closing: boolean
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const { identity, setIdentity, identities, theme } = useTheme()

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TITLE}
      data-state={closing ? "closing" : "open"}
      className="quick-add-more flavours-overlay fixed inset-0 z-[61] text-foreground"
    >
      <div className="quick-add-page">
        <div className="mx-auto flex h-full w-full max-w-[34rem] flex-col gap-5">
          <header className="flex shrink-0 items-start justify-between gap-4">
            <h1
              className="text-[32px] leading-[1.05] font-semibold tracking-[-0.035em]"
            >
              {TITLE}
            </h1>
            <button
              ref={closeRef}
              type="button"
              aria-label="Back to settings"
              onClick={() => {
                hapticTap()
                onClose()
              }}
              className="quick-add-chip motion-tactile inline-flex size-11 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              <X size={17} weight="bold" />
            </button>
          </header>

          <section
            aria-label="Flavours"
            className="flex min-h-0 flex-1 flex-col gap-5"
          >
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Choose a flavour to change the overall character of the app.
            </p>

            <FlavourCarousel
              identities={identities}
              identity={identity}
              appearance={theme}
              onChange={setIdentity}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
