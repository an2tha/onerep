import { tr } from "@repo/ui/i18n"
import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "../lib/utils"
import { useModalLayer } from "../hooks/use-modal-layer"
import { useBackdropDismiss } from "../lib/backdrop-dismiss"

export type MobileSheetProps = {
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
  dismissible?: boolean
  dragThreshold?: number
  minHeight?: string
  maxHeight?: string
  snapPoints?: number[]
  defaultHeight?: number
  ariaLabel?: string
  onDragStart?: () => void
  onDismissGesture?: () => void
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
  dismissible = true,
  dragThreshold = 100,
  minHeight = "15vh",
  maxHeight = "85dvh",
  snapPoints,
  defaultHeight,
  ariaLabel = tr("Sheet"),
  onDragStart,
  onDismissGesture,
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
    if (!dismissible || closingRef.current) return
    closingRef.current = true
    setIsClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, CLOSE_MS)
  }, [dismissible, onClose])

  React.useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    },
    []
  )

  const viewportStyle = useModalLayer(panelRef, dismiss)
  const backdropDismiss = useBackdropDismiss(() => {
    if (closeOnBackdrop) dismiss()
  })

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
      if (snapPoints || defaultHeight) setCurrentHeight(newHeight)
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
        if (snapPoints || defaultHeight) setCurrentHeight(newHeight)

        if (snapPoints?.length) {
          const closest = snapPoints.reduce((prev, curr) =>
            Math.abs(curr - newHeight) < Math.abs(prev - newHeight)
              ? curr
              : prev
          )
          setCurrentHeight(closest)
        }
      }

      if (finalOffsetY > dragThreshold) {
        onDismissGesture?.()
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
    defaultHeight,
    onDismissGesture,
  ])

  React.useEffect(() => {
    if (!settling) return
    const id = window.setTimeout(() => setSettling(false), 300)
    return () => window.clearTimeout(id)
  }, [settling])

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dismissible) return
    e.preventDefault()
    if (panelRef.current) {
      startHeight.current = panelRef.current.offsetHeight
    }
    startY.current = e.clientY
    offsetYRef.current = 0
    setSettling(false)
    setDragging(true)
    onDragStart?.()
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

  // Portaled to <body>: the route frames animate with transforms and sit in
  // low z-index stacking contexts, so a sheet rendered in place gets clipped
  // to the content pane and paints beneath the desktop sidebar.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ overflow: "visible", ...viewportStyle }}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/45",
          overlayClassName,
          isClosing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
        )}
        {...backdropDismiss}
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
          backgroundColor: "var(--background)",
          height: currentHeight || undefined,
          transformOrigin: "bottom center",
          ...panelStyle,
          ...dragStyle,
          ...heightStyle,
          minHeight: `min(${panelStyle?.minHeight ?? minHeight}, calc(var(--sheet-viewport-height, 100dvh) - 1rem))`,
          maxHeight: `min(${panelStyle?.maxHeight ?? maxHeight}, calc(var(--sheet-viewport-height, 100dvh) - 1rem))`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {top}
        {showHandle && (
          <button
            type="button"
            onPointerDown={handlePointerDown}
            disabled={!dismissible}
            className="flex h-11 w-full shrink-0 touch-none items-center justify-center md:hidden"
            aria-label={tr("Drag down to close or up to expand this panel")}
          >
            <div className={cn("app-sheet-handle", notchClassName)} />
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
        {bottom && <div className="shrink-0">{bottom}</div>}
      </div>
    </div>,
    document.body
  )
}
