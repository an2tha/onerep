import { useLayoutEffect, useState, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"

function PageBarSlot({
  children,
  slot,
}: {
  children: ReactNode
  slot: "actions" | "leading"
}) {
  const source = useRef<HTMLDivElement>(null)
  const [destination, setDestination] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>(".collapsing-page-bar")
    if (!bar) return
    const route = source.current?.closest(".app-route-frame")
    const sync = () =>
      setDestination(
        !route || route.classList.contains("app-route-frame-current")
          ? bar.querySelector<HTMLElement>(`.page-bar-${slot}`)
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
  }, [slot])
  return (
    <div
      ref={source}
      className={`page-heading-${slot}`}
      data-portaled={Boolean(destination)}
    >
      {destination ? createPortal(children, destination) : children}
    </div>
  )
}

/** Render page actions once, in the persistent toolbar when it is available. */
export function PageBarActions({ children }: { children: ReactNode }) {
  return <PageBarSlot slot="actions">{children}</PageBarSlot>
}

/** Keep the page's own destination or dismissal guard in the shared back slot. */
export function PageBarBack({ children }: { children: ReactNode }) {
  return <PageBarSlot slot="leading">{children}</PageBarSlot>
}
