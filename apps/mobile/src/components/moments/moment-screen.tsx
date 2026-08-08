import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { hapticSelection } from "@/lib/haptics"

/**
 * The chrome every full-screen moment wears.
 *
 * Portalled to the body for the same reason the coach sheets are: the app is
 * full of `backdrop-filter` and transforms, and any one of them turns an
 * ancestor into the containing block for `position: fixed`, at which point
 * "full screen" means "the card this opened from".
 */
export function MomentScreen({
  title,
  subtitle,
  children,
  actions,
  onClose,
  closeLabel = "Close",
  showClose = true,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
  actions?: ReactNode
  onClose: () => void
  closeLabel?: string
  /**
   * Off when the actions already carry a way out. Two dismissals on one
   * screen reads as an app that expects to be argued with.
   */
  showClose?: boolean
}) {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  // The page underneath must not scroll behind a screen that covers it.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Screen readers otherwise stay parked on whatever page this covered.
  useEffect(() => {
    layerRef.current?.focus()
  }, [])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      ref={layerRef}
      tabIndex={-1}
      className="moment-layer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="moment-screen">
        <div className="flex h-9 justify-end pb-2">
          {showClose && (
            <button
              type="button"
              aria-label={closeLabel}
              onClick={() => {
                hapticSelection()
                onClose()
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors active:bg-muted"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        <div className="moment-body">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-[15px] leading-snug text-muted-foreground">
              {subtitle}
            </p>
          )}
          {children && <div className="mt-6">{children}</div>}
        </div>

        {actions && <div className="moment-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  )
}

/** The one obvious thing to do next. */
export function MomentPrimaryAction({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="motion-tactile flex h-12 w-full items-center justify-center rounded-2xl bg-foreground text-[15px] font-semibold text-background transition-opacity active:opacity-90"
    >
      {children}
    </button>
  )
}

/** Everything else. */
export function MomentSecondaryAction({
  children,
  onClick,
  className,
}: {
  children: ReactNode
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "motion-tactile flex h-12 w-full items-center justify-center rounded-2xl bg-muted/50 text-[15px] font-semibold text-foreground transition-colors active:bg-muted",
        className
      )}
    >
      {children}
    </button>
  )
}
