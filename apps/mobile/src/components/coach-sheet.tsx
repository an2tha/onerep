/**
 * The full Coach, as a draggable sheet over whatever you were doing.
 *
 * Not a reduced-capability copy: this is the same screen as the Coach route,
 * modes and memories and history included, rendered in embedded mode. Drag it
 * down to get back to the page, drag it up for the whole conversation. The
 * page keeps its state the entire time, which is the point — a navigation
 * would tear a running workout, or a half-filled diary, down.
 *
 * `activeWorkout` is what makes it the *workout* coach: without it this is the
 * same sheet opened from anywhere else.
 */

import { MobileSheet } from "@/components/mobile-sheet"
import Coach from "@/pages/Coach"
import type { AgentWorkoutDraft } from "@/lib/workout-logging"

export function CoachSheet({
  onClose,
  activeWorkout,
  initialInput,
}: {
  onClose: () => void
  /** An opening line for the composer, left unsent. */
  initialInput?: string
  activeWorkout?: {
    summary: string
    applying: boolean
    onApply: (draft: AgentWorkoutDraft) => Promise<void> | void
  }
}) {
  return (
    <MobileSheet
      ariaLabel="Coach"
      onClose={onClose}
      minHeight="35vh"
      maxHeight="94vh"
      defaultHeight={
        typeof window === "undefined"
          ? undefined
          : Math.round(window.innerHeight * 0.92)
      }
      snapPoints={
        typeof window === "undefined"
          ? undefined
          : [
              Math.round(window.innerHeight * 0.45),
              Math.round(window.innerHeight * 0.92),
            ]
      }
      panelClassName="max-w-3xl"
    >
      <div className="h-full min-h-0">
        <Coach
          embedded
          onClose={onClose}
          activeWorkout={activeWorkout}
          initialInput={initialInput}
        />
      </div>
    </MobileSheet>
  )
}
