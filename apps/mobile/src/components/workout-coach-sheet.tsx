/**
 * The full Coach, mounted inside the live workout as a draggable sheet.
 *
 * Not a reduced-capability copy: this is the same screen as the Coach route,
 * modes and memories and history included, rendered in embedded mode. Drag it
 * down to get back to your sets, drag it up for the whole conversation. The
 * workout keeps running underneath the entire time, which is the point — a
 * navigation would tear the session down.
 */

import { MobileSheet } from "@/components/mobile-sheet"
import Coach from "@/pages/Coach"
import type { AgentWorkoutDraft } from "@/lib/workout-logging"

export function WorkoutCoachSheet({
  onClose,
  activeWorkout,
}: {
  onClose: () => void
  activeWorkout: {
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
        <Coach embedded onClose={onClose} activeWorkout={activeWorkout} />
      </div>
    </MobileSheet>
  )
}
