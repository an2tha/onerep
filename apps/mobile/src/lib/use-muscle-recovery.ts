import { useEffect, useMemo, useRef, useState } from "react"
import { resolveExerciseIds, type Exercise } from "@/lib/exercise-catalog"
import {
  toWorkoutLogRecords,
  type WorkoutHistoryLog,
} from "@/lib/exercise-history"
import {
  buildCatalogMap,
  computeMuscleRecovery,
  type MuscleRecovery,
} from "@/lib/muscle-volume"

export function useMuscleRecovery(
  workoutHistory: WorkoutHistoryLog[] | undefined
): MuscleRecovery[] {
  const [catalog, setCatalog] = useState<Map<string, Exercise>>(new Map())
  const fetchedKey = useRef("")
  const records = useMemo(
    () => toWorkoutLogRecords(workoutHistory ?? []),
    [workoutHistory]
  )
  const ids = useMemo(
    () =>
      Array.from(
        new Set(
          records.flatMap((log) => log.exercises.map((exercise) => exercise.id))
        )
      ).slice(0, 100),
    [records]
  )

  useEffect(() => {
    const key = [...ids].sort().join(",")
    if (!key) {
      fetchedKey.current = ""
      setCatalog(new Map())
      return
    }
    if (key === fetchedKey.current) return
    fetchedKey.current = key
    void resolveExerciseIds(ids).then((result) => {
      setCatalog(
        new Map(
          Object.entries(result).map(([id, exercise]) => [
            id,
            { ...exercise, id },
          ])
        )
      )
    })
  }, [ids])

  return useMemo(() => {
    if (records.length === 0 || catalog.size === 0) return []
    return computeMuscleRecovery(
      records,
      buildCatalogMap(Array.from(catalog.values())),
      new Date()
    )
  }, [catalog, records])
}
