type SwapItem =
  | { kind: "solo"; exerciseId: string }
  | { kind: "superset"; id: string; color: string; exerciseIds: string[] }

/** Keep performed work under its original exercise identity. */
export function swapExercisePlan<
  S extends { sets: Array<{ id: string; completed?: boolean }> },
>(
  items: SwapItem[],
  data: Record<string, S>,
  oldId: string,
  newId: string,
  replacement: S,
  preserveRecordedCardio = false
): { items: SwapItem[]; exerciseData: Record<string, S> } {
  if (oldId === newId) throw new Error("Choose a different exercise.")
  const ids = items.flatMap((item) =>
    item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
  )
  if (!ids.includes(oldId) || !data[oldId])
    throw new Error("This exercise is no longer in the plan.")
  if (ids.includes(newId))
    throw new Error("That exercise is already in this plan.")
  const completed = data[oldId].sets.filter((set) => set.completed)
  const keepOriginal = completed.length > 0 || preserveRecordedCardio
  const nextItems = items.flatMap((item): SwapItem[] => {
    if (item.kind === "solo") {
      if (item.exerciseId !== oldId) return [item]
      return [
        ...(keepOriginal ? [item] : []),
        { kind: "solo", exerciseId: newId },
      ]
    }
    return [
      {
        ...item,
        exerciseIds: item.exerciseIds.flatMap((id) =>
          id === oldId ? [...(keepOriginal ? [id] : []), newId] : [id]
        ),
      },
    ]
  })
  const exerciseData = { ...data, [newId]: replacement }
  if (keepOriginal) {
    exerciseData[oldId] = preserveRecordedCardio
      ? data[oldId]
      : { ...data[oldId], sets: completed }
  } else {
    delete exerciseData[oldId]
  }
  return { items: nextItems, exerciseData }
}
