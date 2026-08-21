import React, { type ReactNode } from "react"
import { Trash } from "@phosphor-icons/react"
import { cn } from "../lib/utils"

const DEFAULT_ACTION_WIDTH = 72

type SlideToDeleteRowProps = {
  children: ReactNode
  deleteLabel: string
  onDelete: () => void
  className?: string
  rowClassName?: string
  actionClassName?: string
  actionWidth?: number
  disabled?: boolean
}

export function SlideToDeleteRow({
  children,
  deleteLabel,
  onDelete,
  className,
  rowClassName,
  actionClassName,
  actionWidth = DEFAULT_ACTION_WIDTH,
  disabled = false,
}: SlideToDeleteRowProps) {
  const [tx, setTx] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const startX = React.useRef(0)
  const txRef = React.useRef(0)
  const dragRef = React.useRef(false)

  // Swiping well past the button commits the delete on release, so the whole
  // interaction can be one gesture. The two-step swipe-then-tap version kept
  // failing on Android: Chrome's scroll heuristic fires pointercancel readily,
  // and a snapped-shut row disables its own button.
  const commitPoint = actionWidth * 1.8
  const maxDrag = actionWidth * 2.25

  function setTranslate(next: number) {
    const clamped = Math.max(-maxDrag, Math.min(0, next))
    txRef.current = clamped
    setTx(clamped)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return
    startX.current = e.clientX - txRef.current
    dragRef.current = true
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    setTranslate(e.clientX - startX.current)
  }

  function settle(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    dragRef.current = false
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (txRef.current <= -commitPoint) {
      setTranslate(0)
      onDelete()
      return
    }
    // A third is enough to reveal: half assumed a full confident drag, which
    // Android's scroll claim rarely allows to finish.
    setTranslate(txRef.current <= -actionWidth / 3 ? -actionWidth : 0)
  }

  const revealed = tx <= -actionWidth + 0.5

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      data-slide-delete={revealed ? "open" : "closed"}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          setTranslate(0)
          onDelete()
        }}
        disabled={disabled || !revealed}
        tabIndex={revealed && !disabled ? 0 : -1}
        aria-label={deleteLabel}
        className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-center bg-destructive/90 text-white transition-opacity disabled:pointer-events-none disabled:opacity-0",
          actionClassName
        )}
        style={{ width: Math.max(actionWidth, -tx) }}
      >
        <Trash size={14} weight="fill" className="text-white" />
      </button>

      <div
        className={cn(
          "relative touch-pan-y ease-out",
          // No transition mid-drag: the row must track the finger exactly, or
          // the gesture reads as scroll jank and gets abandoned.
          !dragging && "transition-transform duration-150",
          rowClassName
        )}
        style={{ transform: `translateX(${tx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        // A pointercancel past the threshold still reveals or commits —
        // Chrome Android cancels aggressively, and snapping shut on cancel is
        // what made rows feel undeletable.
        onPointerCancel={settle}
      >
        {children}
      </div>
    </div>
  )
}
