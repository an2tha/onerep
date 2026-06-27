import React, { type ReactNode } from "react"
import { Trash } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

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
  const startX = React.useRef(0)
  const txRef = React.useRef(0)
  const dragging = React.useRef(false)

  function setTranslate(next: number) {
    const clamped = Math.max(-actionWidth, Math.min(0, next))
    txRef.current = clamped
    setTx(clamped)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return
    startX.current = e.clientX - txRef.current
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    setTranslate(e.clientX - startX.current)
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setTranslate(txRef.current <= -actionWidth / 2 ? -actionWidth : 0)
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
        style={{ width: actionWidth }}
      >
        <Trash size={14} weight="fill" className="text-white" />
      </button>

      <div
        className={cn(
          "relative touch-pan-y transition-transform duration-150 ease-out",
          rowClassName
        )}
        style={{ transform: `translateX(${tx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  )
}
