import * as React from "react"
import { pushDismissHandler } from "../lib/dismiss-stack"

const layers: symbol[] = []
let originalOverflow = ""
let lastPointerTarget: HTMLElement | null = null
// Safari does not focus buttons on touch, so activeElement alone loses the
// opener. One document listener records the user's latest focus intent.
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerTarget =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              "button, a[href], input, select, textarea, [tabindex]"
            )
          : null
    },
    true
  )
  document.addEventListener(
    "keydown",
    (event) => {
      lastPointerTarget =
        event.target instanceof HTMLElement ? event.target : null
    },
    true
  )
}

/** Shared focus, back, scroll and keyboard behavior for portaled dialogs. */
export function useModalLayer(
  panelRef: React.RefObject<HTMLElement | null>,
  onDismiss: () => void
) {
  const dismissRef = React.useRef(onDismiss)
  React.useLayoutEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])
  const [viewport, setViewport] = React.useState<React.CSSProperties>({})

  React.useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const layer = Symbol("dialog")
    const active = document.activeElement as HTMLElement | null
    const opener =
      lastPointerTarget?.isConnected && !panel.contains(lastPointerTarget)
        ? lastPointerTarget
        : active
    if (layers.length === 0) {
      originalOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
    }
    layers.push(layer)
    const isTop = () => layers[layers.length - 1] === layer
    const removeDismiss = pushDismissHandler(() => dismissRef.current())
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (element) =>
          element.getClientRects().length && !element.closest("[inert]")
      )
    const focusFirst = () =>
      (focusables()[0] ?? panel).focus({ preventScroll: true })
    const frame = requestAnimationFrame(() => {
      if (isTop() && !panel.contains(document.activeElement)) focusFirst()
    })
    function onKeyDown(event: KeyboardEvent) {
      if (!isTop() || event.defaultPrevented) return
      if (event.key === "Escape") {
        event.preventDefault()
        dismissRef.current()
      } else if (event.key === "Tab") {
        const items = focusables()
        const first = items[0]
        if (!first) {
          event.preventDefault()
          panel.focus()
        } else {
          // Safari's native Tab order can skip buttons depending on keyboard
          // settings. Keep every visible dialog control in a predictable loop.
          event.preventDefault()
          const current = items.indexOf(document.activeElement as HTMLElement)
          const next = event.shiftKey
            ? current <= 0
              ? items.length - 1
              : current - 1
            : (current + 1) % items.length
          items[next]?.focus()
        }
      }
    }
    function onFocus(event: FocusEvent) {
      if (isTop() && !panel.contains(event.target as Node)) focusFirst()
    }
    const visualViewport = window.visualViewport
    function resize() {
      if (!visualViewport) return
      setViewport({
        top: visualViewport.offsetTop,
        bottom: "auto",
        height: visualViewport.height,
        "--sheet-viewport-height": `${visualViewport.height}px`,
      } as React.CSSProperties)
    }
    resize()
    visualViewport?.addEventListener("resize", resize)
    visualViewport?.addEventListener("scroll", resize)
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("focusin", onFocus)
    return () => {
      const wasTop = isTop()
      layers.splice(layers.indexOf(layer), 1)
      removeDismiss()
      cancelAnimationFrame(frame)
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("focusin", onFocus)
      visualViewport?.removeEventListener("resize", resize)
      visualViewport?.removeEventListener("scroll", resize)
      if (layers.length === 0) document.body.style.overflow = originalOverflow
      if (wasTop && opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [panelRef])

  return viewport
}
