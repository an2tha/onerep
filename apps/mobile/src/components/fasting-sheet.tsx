/**
 * The fasting timer as a drawer.
 *
 * Starting or ending a fast used to cost a route change each way — two page
 * transitions to press one button, with the nutrition page tearing down and
 * rebuilding around it. The same screen in a sheet keeps the page underneath
 * exactly where it was, so the timer opens over the diary and closes back onto
 * it. Same component as the route, so there is one fasting screen, not two.
 */

import { MobileSheet } from "@/components/mobile-sheet"
import Fasting from "@/pages/Fasting"

export function FastingSheet({ onClose }: { onClose: () => void }) {
  return (
    <MobileSheet
      ariaLabel="Fasting"
      onClose={onClose}
      minHeight="42vh"
      maxHeight="92vh"
      defaultHeight={
        typeof window === "undefined"
          ? undefined
          : Math.round(window.innerHeight * 0.72)
      }
      snapPoints={
        typeof window === "undefined"
          ? undefined
          : [
              Math.round(window.innerHeight * 0.5),
              Math.round(window.innerHeight * 0.92),
            ]
      }
    >
      <Fasting embedded onClose={onClose} />
    </MobileSheet>
  )
}
