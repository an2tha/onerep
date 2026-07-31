"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "../../lib/utils"
import type { SpotlightRect } from "./spotlight"

export type TourPopoverLink = {
  label: string
  detail?: string
  onSelect: () => void
}

export type TourPopoverProps = {
  chapterTitle: string
  title: string
  body: string
  /** 1-based. */
  stepNumber: number
  stepCount: number
  canGoBack: boolean
  isLastStep: boolean
  links?: TourPopoverLink[]
  rect: SpotlightRect | null
  side?: "top" | "bottom"
  onNext: () => void
  onBack: () => void
  onSkipChapter: () => void
}

const POPOVER_MAX_WIDTH = 320
const VIEWPORT_MARGIN = 16
const SIDE_OFFSET = 12

/**
 * Places the card just outside the spotlit rect, flipping to whichever side has
 * more room and clamping to the viewport. With no rect it centers itself, which
 * is the graceful path when a step's anchor never mounted.
 */
function usePopoverPosition(
  rect: SpotlightRect | null,
  preferredSide: "top" | "bottom" | undefined,
  height: number
): React.CSSProperties {
  return React.useMemo(() => {
    if (typeof window === "undefined") return {}
    if (!rect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: POPOVER_MAX_WIDTH,
      }
    }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const side =
      preferredSide === "top"
        ? spaceAbove >= height + SIDE_OFFSET
          ? "top"
          : "bottom"
        : spaceBelow >= height + SIDE_OFFSET
          ? "bottom"
          : "top"

    const width = Math.min(
      POPOVER_MAX_WIDTH,
      viewportWidth - VIEWPORT_MARGIN * 2
    )
    const center = (rect.left + rect.right) / 2
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, center - width / 2),
      viewportWidth - width - VIEWPORT_MARGIN
    )

    return {
      left,
      width,
      top:
        side === "bottom"
          ? Math.min(
              rect.bottom + SIDE_OFFSET,
              viewportHeight - height - VIEWPORT_MARGIN
            )
          : Math.max(VIEWPORT_MARGIN, rect.top - height - SIDE_OFFSET),
    }
  }, [height, preferredSide, rect])
}

export function TourPopover({
  chapterTitle,
  title,
  body,
  stepNumber,
  stepCount,
  canGoBack,
  isLastStep,
  links,
  rect,
  side,
  onNext,
  onBack,
  onSkipChapter,
}: TourPopoverProps) {
  const cardRef = React.useRef<HTMLDivElement>(null)
  const [portalNode, setPortalNode] = React.useState<HTMLElement | null>(null)
  const [height, setHeight] = React.useState(180)
  const titleId = React.useId()
  const bodyId = React.useId()
  const position = usePopoverPosition(rect, side, height)

  React.useEffect(() => {
    setPortalNode(document.body)
  }, [])

  React.useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const sync = () => setHeight(card.offsetHeight)
    sync()

    const observer = new ResizeObserver(sync)
    observer.observe(card)
    return () => observer.disconnect()
  }, [portalNode])

  // Focus the card itself, not the Next button, so a screen reader reads
  // title -> body -> controls in order on every step change.
  React.useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
  }, [stepNumber])

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault()
      onNext()
      return
    }
    if (event.key === "ArrowLeft" && canGoBack) {
      event.preventDefault()
      onBack()
    }
  }

  if (!portalNode) return null

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={position}
      className="fixed z-[70] max-w-[min(20rem,calc(100vw-2rem))] rounded-[1rem] border border-border bg-[var(--surface-raised)] p-4 text-left shadow-2xl duration-200 outline-none motion-reduce:animate-none data-open:animate-in data-open:fade-in-0"
      data-open
    >
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {chapterTitle}
        <span className="sr-only">
          {" "}
          — step {stepNumber} of {stepCount}
        </span>
        <span aria-hidden className="ml-1.5 normal-case">
          {stepNumber}/{stepCount}
        </span>
      </p>

      <h2
        id={titleId}
        className="mt-1.5 text-[16px] leading-tight font-semibold tracking-[-0.02em]"
      >
        {title}
      </h2>
      <p
        id={bodyId}
        className="mt-1.5 text-[13px] leading-5 text-muted-foreground"
      >
        {body}
      </p>

      {links && links.length > 0 && (
        <ul className="mt-3 grid gap-1">
          {links.map((link) => (
            <li key={link.label}>
              <button
                type="button"
                onClick={link.onSelect}
                className="flex min-h-9 w-full items-center justify-between gap-3 rounded-[0.6rem] px-2 py-1.5 text-left text-[13px] font-medium transition-colors hover:bg-[var(--surface-pressed)]"
              >
                <span>{link.label}</span>
                {link.detail && (
                  <span className="text-[12px] text-muted-foreground">
                    {link.detail}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        role="progressbar"
        aria-valuenow={stepNumber}
        aria-valuemin={1}
        aria-valuemax={stepCount}
        aria-label={`${chapterTitle} walkthrough progress`}
        className="mt-3.5 flex gap-1"
      >
        {Array.from({ length: stepCount }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-0.5 flex-1 rounded-full",
              index < stepNumber ? "bg-foreground" : "bg-border"
            )}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSkipChapter}
          className="min-h-9 px-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip
        </button>
        <div className="flex items-center gap-2">
          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              className="native-secondary-button min-h-9 rounded-[0.65rem] px-3 text-[13px]"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="native-primary-button min-h-9 rounded-[0.65rem] px-3.5 text-[13px]"
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    portalNode
  )
}
