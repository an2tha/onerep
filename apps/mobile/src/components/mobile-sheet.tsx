import * as React from "react"
import { cn } from "@/lib/utils"
import { hapticSelection, hapticTap } from "@/lib/haptics"

type MobileSheetProps = {
  children: React.ReactNode
  onClose: () => void
  overlayClassName?: string
  panelClassName?: string
  panelStyle?: React.CSSProperties
  notchClassName?: string
  top?: React.ReactNode
  bottom?: React.ReactNode
  showHandle?: boolean
  closeOnBackdrop?: boolean
  dragThreshold?: number
  minHeight?: string
  maxHeight?: string
  snapPoints?: number[]
  defaultHeight?: number
  ariaLabel?: string
}

// Keep the component mounted for the full CSS exit animation. This must match
// `panel-out` in index.css or the sheet disappears part-way through closing.
const CLOSE_MS = 320

export function MobileSheet({
  children,
  onClose,
  overlayClassName,
  panelClassName,
  panelStyle,
  notchClassName,
  top,
  bottom,
  showHandle = true,
  closeOnBackdrop = true,
  dragThreshold = 100,
  minHeight = "15vh",
  maxHeight = "85vh",
  snapPoints,
  defaultHeight,
  ariaLabel = "Sheet",
}: MobileSheetProps) {
  const [offsetY, setOffsetY] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const [settling, setSettling] = React.useState(false)
  const [isClosing, setIsClosing] = React.useState(false)
  const [currentHeight, setCurrentHeight] = React.useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 768px)").matches
      ? 0
      : (defaultHeight ?? 0)
  )
  const panelRef = React.useRef<HTMLDivElement>(null)
  const startY = React.useRef(0)
  const startHeight = React.useRef(0)
  const offsetYRef = React.useRef(0)
  const closingRef = React.useRef(false)
  const closeTimerRef = React.useRef<number | null>(null)

  const normalizedMinHeight = React.useMemo(() => {
    if (typeof minHeight === "string" && minHeight.endsWith("vh")) {
      return (parseFloat(minHeight) * window.innerHeight) / 100
    }
    return parseFloat(minHeight) || 0
  }, [minHeight])

  const normalizedMaxHeight = React.useMemo(() => {
    if (typeof maxHeight === "string" && maxHeight.endsWith("vh")) {
      return (parseFloat(maxHeight) * window.innerHeight) / 100
    }
    return parseFloat(maxHeight) || window.innerHeight
  }, [maxHeight])

  const dismiss = React.useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setIsClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, CLOSE_MS)
  }, [onClose])

  React.useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    },
    []
  )

  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (!panel) return

    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.getClientRects().length > 0
      )

    const frame = requestAnimationFrame(() => {
      ;(focusables()[0] ?? panel).focus({ preventScroll: true })
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        dismiss()
        return
      }
      if (event.key !== "Tab") return

      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("keydown", handleKeyDown)
      previousFocus?.focus({ preventScroll: true })
    }
  }, [dismiss])

  React.useEffect(() => {
    if (!dragging || !panelRef.current) return

    const panel = panelRef.current

    function handlePointerMove(e: PointerEvent) {
      const delta = e.clientY - startY.current
      const newOffset = delta < 0 ? delta * 0.3 : delta
      offsetYRef.current = newOffset
      setOffsetY(newOffset)

      const newHeight = Math.max(
        normalizedMinHeight,
        Math.min(normalizedMaxHeight, startHeight.current - delta)
      )
      setCurrentHeight(newHeight)
    }

    function handlePointerEnd() {
      const finalOffsetY = offsetYRef.current
      setDragging(false)
      setSettling(true)
      setOffsetY(0)
      offsetYRef.current = 0

      if (panel) {
        const newHeight = Math.max(
          normalizedMinHeight,
          Math.min(normalizedMaxHeight, startHeight.current - finalOffsetY)
        )
        setCurrentHeight(newHeight)

        if (snapPoints) {
          const closest = snapPoints.reduce((prev, curr) =>
            Math.abs(curr - newHeight) < Math.abs(prev - newHeight)
              ? curr
              : prev
          )
          setCurrentHeight(closest)
        }
      }

      if (finalOffsetY > dragThreshold) {
        void hapticSelection()
        dismiss()
        return
      }

      const id = window.setTimeout(() => setSettling(false), 300)
      return () => window.clearTimeout(id)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
    }
  }, [
    dragging,
    dragThreshold,
    dismiss,
    normalizedMaxHeight,
    normalizedMinHeight,
    snapPoints,
  ])

  React.useEffect(() => {
    if (!settling) return
    const id = window.setTimeout(() => setSettling(false), 300)
    return () => window.clearTimeout(id)
  }, [settling])

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (panelRef.current) {
      startHeight.current = panelRef.current.offsetHeight
    }
    startY.current = e.clientY
    offsetYRef.current = 0
    setSettling(false)
    setDragging(true)
    void hapticTap()
  }

  const dragStyle: React.CSSProperties =
    dragging || settling
      ? {
          transform: `translateY(${offsetY}px)`,
          transition: dragging
            ? "none"
            : "transform var(--motion-panel) var(--motion-ease-out), height var(--motion-panel) var(--motion-ease-out)",
        }
      : {}

  const heightStyle: React.CSSProperties = currentHeight
    ? { height: `${currentHeight}px` }
    : {}

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ overflow: "visible" }}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/45",
          overlayClassName,
          isClosing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
        )}
        onClick={() => {
          if (closeOnBackdrop) dismiss()
        }}
      />

      {/* Panel — slides in/out from the bottom, resizable */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          "app-sheet-panel relative flex w-full max-w-lg flex-col overflow-hidden will-change-transform md:border md:border-border/50",
          panelClassName,
          "max-sm:!rounded-b-none",
          isClosing ? "sheet-panel-exit" : "sheet-panel-enter"
        )}
        style={{
          minHeight,
          maxHeight,
          height: currentHeight || undefined,
          transformOrigin: "bottom center",
          ...panelStyle,
          ...dragStyle,
          ...heightStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {top}
        {showHandle && (
          <button
            type="button"
            onPointerDown={handlePointerDown}
            className="flex h-11 w-full shrink-0 touch-none items-center justify-center md:hidden"
            aria-label="Drag down to close or up to resize sheet"
          >
            <div className={cn("app-sheet-handle", notchClassName)} />
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
        {bottom && <div className="shrink-0">{bottom}</div>}
      </div>
    </div>
  )
}
