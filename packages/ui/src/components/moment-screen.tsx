import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "@phosphor-icons/react"
import { cn } from "../lib/utils"

/**
 * The chrome a full-screen moment wears.
 *
 * Portalled to the body for the same reason the coach sheets are: the app is
 * full of `backdrop-filter` and transforms, and any one of them turns an
 * ancestor into the containing block for `position: fixed`, at which point
 * "full screen" means "the card this opened from".
 *
 * Presentational, like every other primitive here: haptics and the decision
 * about what closing means belong to the caller.
 */
export function MomentScreen({
  title,
  subtitle,
  children,
  actions,
  onClose,
  closeLabel = "Close",
  showClose = true,
  yielded = false,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
  actions?: React.ReactNode
  onClose: () => void
  closeLabel?: string
  /**
   * Off when the actions already carry a way out. Two dismissals on one
   * screen reads as an app that expects to be argued with.
   */
  showClose?: boolean
  /**
   * Drops the layer below the app's sheets while one is open on top of it.
   * A moment sits above everything by default, which is right until it opens
   * something of its own and then covers it.
   */
  yielded?: boolean
}) {
  const layerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  // The page underneath must not scroll behind a screen that covers it.
  React.useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Screen readers otherwise stay parked on whatever page this covered.
  React.useEffect(() => {
    layerRef.current?.focus()
  }, [])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      ref={layerRef}
      tabIndex={-1}
      className="moment-layer"
      data-yielded={yielded ? "true" : undefined}
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
              onClick={onClose}
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
  children: React.ReactNode
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
  children: React.ReactNode
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

/** One tappable row of a moment's answer list. */
export function MomentRow({
  icon,
  title,
  detail,
  disabled,
  onClick,
}: {
  icon?: React.ReactNode
  title: string
  detail: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-muted/40 disabled:opacity-45"
    >
      {icon && (
        <span className="app-icon-button pointer-events-none h-9 w-9 shrink-0 bg-muted/55 text-muted-foreground/70">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">
          {title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
          {detail}
        </span>
      </span>
      <MomentRowCaret />
    </button>
  )
}

function MomentRowCaret() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 256 256"
      aria-hidden
      className="shrink-0 text-muted-foreground"
    >
      <path
        fill="currentColor"
        d="M181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32Z"
      />
    </svg>
  )
}
