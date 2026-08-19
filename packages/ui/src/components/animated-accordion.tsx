import { CaretDown } from "@phosphor-icons/react"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { cn } from "../lib/utils"

export type AnimatedAccordionProps = {
  summary: ReactNode | ((open: boolean) => ReactNode)
  children: ReactNode
  className?: string
  triggerClassName?: string
  contentClassName?: string
  defaultOpen?: boolean
}

export function AnimatedAccordion({
  summary,
  children,
  className,
  triggerClassName,
  contentClassName,
  defaultOpen = false,
}: AnimatedAccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  // `grid-template-rows: 0fr -> 1fr` is the tidy way to write this and the
  // one WebKit still refuses to interpolate, which is why these drawers were
  // snapping open on the phone. Measured pixels animate everywhere; a
  // ResizeObserver keeps the number honest when the contents grow.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [bodyHeight, setBodyHeight] = useState(0)

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const measure = () => setBodyHeight(body.scrollHeight)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  // The first paint of an open drawer should be open, not an animation of one.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const summaryContent = typeof summary === "function" ? summary(open) : summary

  return (
    <section
      className={className}
      data-accordion-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-3 text-left",
          triggerClassName
        )}
      >
        <span className="min-w-0 flex-1">{summaryContent}</span>
        <CaretDown
          size={18}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-[var(--motion-medium)] ease-[var(--motion-ease-standard)] motion-reduce:transition-none",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      <div
        id={contentId}
        aria-hidden={!open}
        inert={!open ? true : undefined}
        style={{ height: open ? bodyHeight : 0 }}
        className={cn(
          "accordion-drawer overflow-hidden",
          open ? "opacity-100" : "opacity-0",
          ready && "accordion-drawer-animated"
        )}
      >
        <div ref={bodyRef} className={contentClassName}>
          {children}
        </div>
      </div>
    </section>
  )
}
