import { createContext, useContext } from "react"
import type {
  ChapterId,
  TourContext as TourFeatureContext,
  WalkthroughProgress,
} from "@/lib/walkthrough/types"

export type TourAnchorRegister = (
  anchor: string,
  element: HTMLElement | null
) => void

/**
 * Split from the provider so `TourAnchor` subscribes only to the registration
 * callback, which never changes identity, rather than re-rendering every
 * anchored element on each step change.
 */
export const TourAnchorContext = createContext<TourAnchorRegister | null>(null)

export type TourApi = {
  progress: WalkthroughProgress
  /** Shared so Settings shows the same step counts the tour will use. */
  featureContext: TourFeatureContext
  isRunning: boolean
  startChapter: (id: ChapterId) => void
  resetChapter: (id?: ChapterId) => Promise<void>
}

export const TourApiContext = createContext<TourApi | null>(null)

export function useTour() {
  const api = useContext(TourApiContext)
  if (!api) throw new Error("useTour must be used inside a TourProvider")
  return api
}
