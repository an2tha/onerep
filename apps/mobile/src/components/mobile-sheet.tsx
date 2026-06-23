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
  showHandle?: boolean
  closeOnBackdrop?: boolean
  dragThreshold?: number
  minHeight?: string
  maxHeight?: string
  snapPoints?: number[]
  defaultHeight?: number
}

const CLOSE_MS = 200

export function MobileSheet({
  children,
  onClose,
  overlayClassName,
  panelClassName,
  panelStyle,
  notchClassName,
  top,
  showHandle = true,
  closeOnBackdrop = true,
  dragThreshold = 100,
  minHeight = "15vh",
  maxHeight = "85vh",
  snapPoints,
  defaultHeight,
}: MobileSheetProps) {
  const [offsetY, setOffsetY] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const [settling, setSettling] = React.useState(false)
  const [isClosing, setIsClosing] = React.useState(false)
  const [currentHeight, setCurrentHeight] = React.useState(defaultHeight ?? 0)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const startY = React.useRef(0)
  const startHeight = React.useRef(0)
  const closingRef = React.useRef(false)

  const normalizedMinHeight = React.useMemo(() => {
    if (typeof minHeight === 'string' && minHeight.endsWith('vh')) {
      return (parseFloat(minHeight) * window.innerHeight) / 100
    }
    return parseFloat(minHeight) || 0
  }, [minHeight])

  const normalizedMaxHeight = React.useMemo(() => {
    if (typeof maxHeight === 'string' && maxHeight.endsWith('vh')) {
      return (parseFloat(maxHeight) * window.innerHeight) / 100
    }
    return parseFloat(maxHeight) || window.innerHeight
  }, [maxHeight])

  const dismiss = React.useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setIsClosing(true)
    setTimeout(onClose, CLOSE_MS)
  }, [onClose])

  React.useEffect(() => {
    if (!dragging || !panelRef.current) return

    const panel = panelRef.current

    function handlePointerMove(e: PointerEvent) {
      const delta = e.clientY - startY.current
      const newOffset = delta < 0 ? delta * 0.3 : delta
      setOffsetY(newOffset)

      const newHeight = Math.max(
        normalizedMinHeight,
        Math.min(normalizedMaxHeight, startHeight.current - delta)
      )
      setCurrentHeight(newHeight)
    }

    function handlePointerEnd() {
      setDragging(false)
      setSettling(true)
      setOffsetY(0)

      if (panel) {
        const newHeight = Math.max(
          normalizedMinHeight,
          Math.min(normalizedMaxHeight, startHeight.current - offsetY)
        )
        setCurrentHeight(newHeight)

        if (snapPoints) {
          const closest = snapPoints.reduce((prev, curr) =>
            Math.abs(curr - newHeight) < Math.abs(prev - newHeight) ? curr : prev
          )
          setCurrentHeight(closest)
        }
      }

      if (offsetY > dragThreshold) {
        void hapticSelection()
        dismiss()
        return
      }

      const id = window.setTimeout(() => setSettling(false), 380)
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
  }, [dragging, dragThreshold, dismiss, offsetY, normalizedMaxHeight, normalizedMinHeight, snapPoints])

  React.useEffect(() => {
    if (!settling) return
    const id = window.setTimeout(() => setSettling(false), 380)
    return () => window.clearTimeout(id)
  }, [settling])

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (panelRef.current) {
      startHeight.current = panelRef.current.offsetHeight
    }
    startY.current = e.clientY
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
            : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        }
      : {}

  const heightStyle: React.CSSProperties = currentHeight
    ? { height: `${currentHeight}px` }
    : {}

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ overflow: "visible" }}
    >
      {/* Backdrop — blur effect */}
      <div
        className={cn(
          "absolute inset-0 bg-background/60 backdrop-blur-md",
          overlayClassName,
          isClosing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
        )}
        onClick={() => {
          if (closeOnBackdrop) dismiss()
        }}
      />

      {/* Panel — slides in/out, centered, resizable */}
      <div
        ref={panelRef}
        className={cn(
          "relative flex flex-col w-full overflow-hidden rounded-3xl bg-card shadow-2xl sm:max-w-lg",
          panelClassName,
          "md:rounded-3xl md:border md:border-border/50 md:shadow-2xl",
          isClosing ? "sheet-panel-exit" : "sheet-panel-enter"
        )}
        style={{
          minHeight,
          maxHeight,
          height: currentHeight || undefined,
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
            className="flex w-full touch-none items-center justify-center pt-3 pb-2 shrink-0"
            aria-label="Drag to resize"
          >
            <div
              className={cn(
                "h-1 w-10 rounded-full bg-foreground/[0.10]",
                notchClassName
              )}
            />
          </button>
        )}
        <div className="flex-1 overflow-y-auto min-h-0 px-1">
          {children}
        </div>
      </div>
    </div>
  )
}