import * as z from "zod";
import { MAX_EXERCISES, MAX_SETS_PER_EXERCISE } from "./workoutTextParser";
export const editSetSchema = z.object({
  type: z.enum(["working", "warmup", "failure", "myoreps", "drop"]),
  weight: z.string().max(16).refine(value => value === "" || /^\d+(\.\d+)?$/.test(value)),
  reps: z.string().max(18),
  restSeconds: z.number().int().min(0).max(600),
});
export const editWorkoutSchema = z.object({
  name: z.string().min(1).max(40),
  exercises: z.array(z.object({ id: z.string().max(150), sets: z.array(editSetSchema).min(1).max(MAX_SETS_PER_EXERCISE) })).min(1).max(MAX_EXERCISES),
});
export function parseWorkoutEdit(content: string, existing: z.infer<typeof editWorkoutSchema>, catalog: {id: string; name: string}[]) {
  const result = z.object({
    name: z.string().min(1).max(40), notes: z.string().max(240),
    exercises: z.array(z.object({ id: z.string(), sets: z.array(editSetSchema).min(1).max(MAX_SETS_PER_EXERCISE).nullable() })).min(1).max(MAX_EXERCISES),
  }).parse(JSON.parse(content));
  const byId = new Map(catalog.map(exercise => [exercise.id, exercise.name]));
  const original = new Map(existing.exercises.map(exercise => [exercise.id, exercise.sets]));
  if (new Set(result.exercises.map(exercise => exercise.id)).size !== result.exercises.length) throw new Error("Duplicate exercises");
  return { name: result.name, notes: result.notes, exercises: result.exercises.map(exercise => {
    const name = byId.get(exercise.id);
    const sets = exercise.sets ?? original.get(exercise.id);
    if (!name || !sets) throw new Error("Invalid exercise edit");
    return { id: exercise.id, name, sets };
  }) };
}
