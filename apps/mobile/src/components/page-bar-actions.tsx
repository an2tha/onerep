import { useLayoutEffect, useState, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"

/** Render page-level controls in the persistent toolbar, including before scrolling. */
export function PageBarActions({ children }: { children: ReactNode }) {
  const source = useRef<HTMLDivElement>(null)
  const [destination, setDestination] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>(".collapsing-page-bar")
    if (!bar) return
    const route = source.current?.closest(".app-route-frame")
    const sync = () =>
      setDestination(
        !route || route.classList.contains("app-route-frame-current")
          ? bar.querySelector<HTMLElement>(".page-bar-actions")
          : null
      )
    const observer = new MutationObserver(sync)
    observer.observe(bar, {
      attributes: true,
      attributeFilter: ["data-collapsed"],
    })
    if (route)
      observer.observe(route, { attributes: true, attributeFilter: ["class"] })
    sync()
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={source}
      className="page-heading-actions"
      data-portaled={Boolean(destination)}
    >
      {destination ? createPortal(children, destination) : children}
    </div>
  )
}
