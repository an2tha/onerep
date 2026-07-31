"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"
import { SpotlightOverlay, useSpotlightRect } from "./spotlight"

type GuidedTooltipId = string | number

type GuidedTooltipEntry = {
  id: string
  order: number
  visible: boolean
  completed: boolean
  mountedAt: number
}

const guidedTooltipEntries = new Map<string, GuidedTooltipEntry>()
const guidedTooltipListeners = new Set<() => void>()
let guidedTooltipActiveId: string | null = null
let guidedTooltipMountCounter = 0
let guidedTooltipsSuppressed = false

function emitGuidedTooltipChange() {
  guidedTooltipListeners.forEach((listener) => listener())
}

/**
 * Lets a higher-priority flow (the guided walkthrough) hold the overlay layer
 * exclusively. While suppressed no ambient tooltip can elect itself, so the two
 * systems can never dim the screen at the same time.
 */
function setGuidedTooltipsSuppressed(next: boolean) {
  if (guidedTooltipsSuppressed === next) return

  guidedTooltipsSuppressed = next
  if (next) guidedTooltipActiveId = null

  syncGuidedTooltipActive()
  emitGuidedTooltipChange()
}

function getNextGuidedTooltipId() {
  if (guidedTooltipsSuppressed) return undefined

  return [...guidedTooltipEntries.values()]
    .filter((entry) => entry.visible && !entry.completed)
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.mountedAt - b.mountedAt ||
        a.id.localeCompare(b.id)
    )[0]?.id
}

function syncGuidedTooltipActive() {
  const activeEntry =
    guidedTooltipActiveId && !guidedTooltipsSuppressed
      ? guidedTooltipEntries.get(guidedTooltipActiveId)
      : null

  if (activeEntry?.visible && !activeEntry.completed) return

  guidedTooltipActiveId = getNextGuidedTooltipId() ?? null
}

function subscribeGuidedTooltips(listener: () => void) {
  guidedTooltipListeners.add(listener)
  return () => {
    guidedTooltipListeners.delete(listener)
  }
}

function upsertGuidedTooltip(entry: GuidedTooltipEntry) {
  guidedTooltipEntries.set(entry.id, entry)
  syncGuidedTooltipActive()
  emitGuidedTooltipChange()
}

function removeGuidedTooltip(id: string) {
  guidedTooltipEntries.delete(id)

  if (guidedTooltipActiveId === id) {
    guidedTooltipActiveId = null
  }

  syncGuidedTooltipActive()
  emitGuidedTooltipChange()
}

function completeGuidedTooltip(id: string) {
  const entry = guidedTooltipEntries.get(id)
  if (entry) {
    guidedTooltipEntries.set(id, { ...entry, completed: true })
  }

  if (guidedTooltipActiveId === id) {
    guidedTooltipActiveId = null
  }

  syncGuidedTooltipActive()
  emitGuidedTooltipChange()
}

function requestGuidedTooltipActive(id: string) {
  if (guidedTooltipActiveId === id) return
  if (guidedTooltipActiveId !== null) return
  if (getNextGuidedTooltipId() !== id) return

  guidedTooltipActiveId = id
  emitGuidedTooltipChange()
}

function useGuidedTooltipVersion() {
  const [, setVersion] = React.useState(0)

  React.useEffect(() => {
    return subscribeGuidedTooltips(() => {
      setVersion((version) => version + 1)
    })
  }, [])
}

function toGuidedTooltipKey(id: GuidedTooltipId) {
  return String(id)
}

function vibrateIfAvailable() {
  if (typeof navigator === "undefined") return
  navigator.vibrate?.(12)
}

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[13px] leading-5 text-background shadow-xl has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm motion-reduce:animate-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

type GuidedTooltipProps = Omit<
  React.ComponentProps<typeof TooltipPrimitive.Content>,
  "children" | "className" | "content" | "id" | "sideOffset"
> & {
  id: GuidedTooltipId
  content: React.ReactNode
  children: React.ReactNode
  completed?: boolean
  enabled?: boolean
  order?: number
  className?: string
  targetClassName?: string
  overlayClassName?: string
  sideOffset?: number
  spotlightPadding?: number
  dismissOnTargetClick?: boolean
  onComplete?: (id: GuidedTooltipId) => void | Promise<void>
  onOpenHaptic?: () => void
}

function GuidedTooltip({
  id,
  content,
  children,
  completed = false,
  enabled = true,
  order,
  className,
  targetClassName,
  overlayClassName,
  side = "bottom",
  align = "center",
  sideOffset = 10,
  spotlightPadding = 6,
  dismissOnTargetClick = true,
  onComplete,
  onOpenHaptic,
  ...contentProps
}: GuidedTooltipProps) {
  useGuidedTooltipVersion()

  const key = toGuidedTooltipKey(id)
  const targetRef = React.useRef<HTMLSpanElement>(null)
  const mountedAtRef = React.useRef(++guidedTooltipMountCounter)
  const completionStartedRef = React.useRef(false)
  const wasOpenRef = React.useRef(false)
  const [isVisible, setIsVisible] = React.useState(false)
  const [locallyCompleted, setLocallyCompleted] = React.useState(false)
  const isCompleted = completed || locallyCompleted

  React.useEffect(() => {
    const target = targetRef.current
    if (!target || typeof IntersectionObserver === "undefined") {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(Boolean(entry?.isIntersecting))
      },
      { threshold: 0.35 }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!enabled) {
      removeGuidedTooltip(key)
      return
    }

    upsertGuidedTooltip({
      id: key,
      order: order ?? (Number(id) || mountedAtRef.current),
      visible: isVisible,
      completed: isCompleted,
      mountedAt: mountedAtRef.current,
    })

    return () => removeGuidedTooltip(key)
  }, [enabled, id, isCompleted, isVisible, key, order])

  React.useEffect(() => {
    if (enabled && isVisible && !isCompleted) {
      requestGuidedTooltipActive(key)
    }
  }, [enabled, isCompleted, isVisible, key])

  const open =
    enabled && isVisible && !isCompleted && guidedTooltipActiveId === key

  // State, not the ref, so the rect recomputes on the render that mounts the
  // target rather than silently measuring null on first open.
  const [targetEl, setTargetEl] = React.useState<HTMLSpanElement | null>(null)
  const targetRect = useSpotlightRect(targetEl, open, spotlightPadding)

  const complete = React.useCallback(() => {
    if (completionStartedRef.current) return
    completionStartedRef.current = true
    setLocallyCompleted(true)
    completeGuidedTooltip(key)
    void Promise.resolve(onComplete?.(id))
      .catch(() => {})
      .finally(() => {
        completionStartedRef.current = false
      })
  }, [id, key, onComplete])

  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      if (onOpenHaptic) {
        onOpenHaptic()
      } else {
        vibrateIfAvailable()
      }
    }

    wasOpenRef.current = open
  }, [onOpenHaptic, open])

  React.useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") complete()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [complete, open])

  function onTargetClick() {
    if (!dismissOnTargetClick || !open) return
    window.setTimeout(complete, 0)
  }

  return (
    <>
      {open && (
        <SpotlightOverlay
          rect={targetRect}
          onDismiss={complete}
          dismissLabel="Dismiss tooltip"
          className={overlayClassName}
        />
      )}
      <TooltipPrimitive.Provider delayDuration={0}>
        <TooltipPrimitive.Root open={open}>
          <TooltipPrimitive.Trigger asChild>
            <span
              ref={(node) => {
                targetRef.current = node
                setTargetEl(node)
              }}
              className={cn(
                "relative inline-flex w-fit",
                open && "isolate z-[60]",
                targetClassName
              )}
              onClickCapture={onTargetClick}
            >
              {children}
            </span>
          </TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              data-slot="guided-tooltip-content"
              side={side}
              align={align}
              sideOffset={sideOffset}
              className={cn(
                "z-[70] max-w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-foreground px-3.5 py-2.5 text-left text-[13px] leading-5 font-medium text-background shadow-2xl data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none data-open:animate-in data-open:fade-in-0",
                className
              )}
              {...contentProps}
            >
              {content}
              <TooltipPrimitive.Arrow className="z-[70] size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    </>
  )
}

export {
  GuidedTooltip,
  setGuidedTooltipsSuppressed,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
}
