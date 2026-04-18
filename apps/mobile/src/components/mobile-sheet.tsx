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
  dragThreshold = 120,
}: MobileSheetProps) {
  const [offsetY, setOffsetY] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const [settling, setSettling] = React.useState(false)
  const [isClosing, setIsClosing] = React.useState(false)
  const startY = React.useRef(0)
  const closingRef = React.useRef(false)

  const dismiss = React.useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setIsClosing(true)
    setTimeout(onClose, CLOSE_MS)
  }, [onClose])

  React.useEffect(() => {
    if (!dragging) return

    function handlePointerMove(e: PointerEvent) {
      const delta = e.clientY - startY.current
      setOffsetY(delta < 0 ? delta * 0.18 : delta)
    }

    function handlePointerEnd() {
      setDragging(false)
      if (offsetY > dragThreshold) {
        void hapticSelection()
        dismiss()
        return
      }
      setSettling(true)
      setOffsetY(0)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
    }
  }, [dragThreshold, dragging, offsetY, dismiss])

  React.useEffect(() => {
    if (!settling) return
    const id = window.setTimeout(() => setSettling(false), 380)
    return () => window.clearTimeout(id)
  }, [settling])

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    startY.current = e.clientY - offsetY
    setSettling(false)
    setDragging(true)
    void hapticTap()
  }

  // Drag/settle feedback on the panel only
  const dragStyle: React.CSSProperties =
    dragging || settling
      ? {
          transform: `translateY(${offsetY}px)`,
          transition: dragging
            ? "none"
            : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        }
      : {}

  return (
    // Neutral positioner — no opacity, no animation
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ overflow: "visible" }}
    >
      {/* Backdrop — fades in/out independently */}
      <div
        className={cn(
          "absolute inset-0",
          overlayClassName,
          isClosing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
        )}
        onClick={() => {
          if (closeOnBackdrop) dismiss()
        }}
      />

      {/* Panel — slides in/out independently */}
      <div
        className={cn(
          "relative w-full",
          panelClassName,
          isClosing ? "sheet-panel-exit" : "sheet-panel-enter"
        )}
        style={{ ...panelStyle, ...dragStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        {top}
        {showHandle && (
          <button
            type="button"
            onPointerDown={handlePointerDown}
            className="flex w-full touch-none items-center justify-center pt-3 pb-1"
            aria-label="Drag sheet"
          >
            <div
              className={cn(
                "h-1 w-10 rounded-full bg-foreground/[0.10]",
                notchClassName
              )}
            />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
