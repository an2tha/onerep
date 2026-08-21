/**
 * The catalog page's photos, facts, and instructions — as a sheet, because
 * mid-workout nobody wants to navigate away and find their place again. The
 * full ExerciseDetail page still exists for the library.
 */

import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import type { ClientExercise } from "../../../../../convex/lib/exerciseShape"
import { MobileSheet } from "@/components/mobile-sheet"
import { muscleSummary } from "@/lib/exercise-display"
import { InstructionsPane } from "../ExerciseDetail"

export function ExerciseInfoSheet({
  exerciseId,
  exerciseName,
  onClose,
}: {
  exerciseId: string
  exerciseName: string
  onClose: () => void
}) {
  const resolved = useQuery(api.exercises.resolve, { ids: [exerciseId] }) as
    Record<string, ClientExercise> | undefined
  const exercise = resolved?.[exerciseId]

  return (
    <MobileSheet onClose={onClose} ariaLabel={`${exerciseName} instructions`}>
      <div className="max-h-[78dvh] min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-[max(2rem,env(safe-area-inset-bottom,2rem))]">
        <h2 className="text-[20px] font-semibold tracking-tight">
          {exercise?.name ?? exerciseName}
        </h2>
        {exercise && (
          <p className="mt-1 text-[14px] text-muted-foreground">
            {muscleSummary(exercise.primaryMuscles)}
          </p>
        )}
        <div className="mt-5">
          {resolved === undefined ? (
            <p className="py-12 text-center text-[14px] text-muted-foreground">
              Loading…
            </p>
          ) : !exercise ? (
            <p className="py-12 text-center text-[14px] text-muted-foreground">
              This one is not in the catalog — no photos or instructions to
              show.
            </p>
          ) : (
            <InstructionsPane exercise={exercise} />
          )}
        </div>
      </div>
    </MobileSheet>
  )
}
