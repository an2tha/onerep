import { tr } from "@repo/ui/i18n"
/**
 * The catalog page's photos, facts, and instructions — as a sheet, because
 * mid-workout nobody wants to navigate away and find their place again. The
 * full ExerciseDetail page still exists for the library.
 */

import { X } from "@phosphor-icons/react"
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
    <MobileSheet
      onClose={onClose}
      ariaLabel={tr("{{value0}} instructions", { value0: exerciseName })}
    >
      <div className="px-6 pt-2 pb-[max(2rem,env(safe-area-inset-bottom,2rem))]">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-[20px] font-semibold tracking-tight">
            {exercise?.name ?? exerciseName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr("Close instructions")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        {exercise && (
          <p className="mt-1 text-[14px] text-muted-foreground">
            {muscleSummary(exercise.primaryMuscles)}
          </p>
        )}
        <div className="mt-5">
          {resolved === undefined ? (
            <p
              role="status"
              className="py-12 text-center text-[14px] text-muted-foreground"
            >
              {tr("Loading instructions...")}
            </p>
          ) : !exercise ? (
            <p className="py-12 text-center text-[14px] text-muted-foreground">
              {tr(
                "This exercise is not in the catalog. No photos or instructions are available."
              )}
            </p>
          ) : (
            <InstructionsPane exercise={exercise} />
          )}
        </div>
      </div>
    </MobileSheet>
  )
}
