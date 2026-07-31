import { useCallback, useContext, useLayoutEffect, useRef } from "react"
import type { ReactNode } from "react"
import { TourAnchorContext } from "./tour-context"

/**
 * Binds a DOM node to a walkthrough step by name.
 *
 * Deliberately inert when no tour is running: it registers an element and
 * renders a plain span, with no observer, portal, or provider per call site.
 */
export function TourAnchor({
  anchor,
  children,
  className,
}: {
  anchor: string
  children: ReactNode
  className?: string
}) {
  const ref = useTourAnchor(anchor)

  return (
    <span ref={ref} data-tour-anchor={anchor} className={className}>
      {children}
    </span>
  )
}

/** Ref form, for when you already control the element and want no extra DOM. */
export function useTourAnchor(anchor: string) {
  const register = useContext(TourAnchorContext)
  const previous = useRef<HTMLElement | null>(null)

  // Layout effect so the element is registered before the provider measures it.
  useLayoutEffect(() => {
    return () => {
      if (previous.current) register?.(anchor, null)
      previous.current = null
    }
  }, [anchor, register])

  return useCallback(
    (node: HTMLElement | null) => {
      previous.current = node
      register?.(anchor, node)
    },
    [anchor, register]
  )
}
