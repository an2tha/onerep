"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "../../lib/utils"

export type SpotlightRect = {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Tracks a padded viewport rect for `target`, recomputed on resize and on any
 * scroll in the capture phase so nested scroll containers stay in sync.
 */
export function useSpotlightRect(
  target: HTMLElement | null,
  active: boolean,
  padding = 6
): SpotlightRect | null {
  const [rect, setRect] = React.useState<SpotlightRect | null>(null)

  React.useEffect(() => {
    if (!active || !target) {
      setRect(null)
      return
    }

    function updateTargetRect() {
      if (!target) return

      const bounds = target.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      setRect({
        top: Math.max(0, bounds.top - padding),
        right: Math.min(viewportWidth, bounds.right + padding),
        bottom: Math.min(viewportHeight, bounds.bottom + padding),
        left: Math.max(0, bounds.left - padding),
      })
    }

    updateTargetRect()
    window.addEventListener("resize", updateTargetRect)
    document.addEventListener("scroll", updateTargetRect, true)

    return () => {
      window.removeEventListener("resize", updateTargetRect)
      document.removeEventListener("scroll", updateTargetRect, true)
    }
  }, [active, padding, target])

  return rect
}

export function spotlightOverlayPieces(rect: SpotlightRect) {
  return [
    { top: 0, left: 0, width: "100%", height: rect.top },
    {
      top: rect.bottom,
      left: 0,
      width: "100%",
      height: `calc(100dvh - ${rect.bottom}px)`,
    },
    {
      top: rect.top,
      left: 0,
      width: rect.left,
      height: Math.max(0, rect.bottom - rect.top),
    },
    {
      top: rect.top,
      left: rect.right,
      width: `calc(100vw - ${rect.right}px)`,
      height: Math.max(0, rect.bottom - rect.top),
    },
  ]
}

/**
 * The four dimmed rects around a spotlit target. Only the first is exposed to
 * assistive tech — four identically labelled buttons is noise, not navigation.
 */
export function SpotlightOverlay({
  rect,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
}: {
  rect: SpotlightRect | null
  onDismiss?: () => void
  dismissLabel?: string
  className?: string
}) {
  const [portalNode, setPortalNode] = React.useState<HTMLElement | null>(null)

  React.useEffect(() => {
    setPortalNode(document.body)
  }, [])

  if (!rect || !portalNode) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40">
      {spotlightOverlayPieces(rect).map((style, index) => (
        <button
          key={index}
          type="button"
          tabIndex={-1}
          aria-label={index === 0 ? dismissLabel : undefined}
          aria-hidden={index === 0 ? undefined : true}
          className={cn(
            "pointer-events-auto absolute cursor-default bg-black/32 backdrop-brightness-75",
            className
          )}
          style={style}
          onClick={onDismiss}
        />
      ))}
    </div>,
    portalNode
  )
}
