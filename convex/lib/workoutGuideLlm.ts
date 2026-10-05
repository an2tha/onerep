import * as z from "zod";
import { ConvexError } from "convex/values";

const evaluation = z.object({
  status: z.enum(["ready", "needs_details"]),
  name: z.string().min(1).max(40),
  notes: z.string().max(240),
  message: z.string().max(240),
  exercises: z.array(z.object({
    id: z.string(),
    sets: z.number().int().min(1).max(6),
    reps: z.number().int().min(1).max(30),
    restSeconds: z.number().int().min(15).max(300),
  })).max(8),
});

export function parseGuidedEvaluation(content: string, catalog: { id: string; name: string }[]) {
  const result = evaluation.parse(JSON.parse(content));
  if (result.status === "needs_details")
    throw new ConvexError({ code: "GUIDE_DETAILS", message: result.message || "Add more detail about your equipment or restrictions, then try again." });
  const byId = new Map(catalog.map(exercise => [exercise.id, exercise.name]));
  const ids = result.exercises.map(exercise => exercise.id);
  if (ids.length < 2 || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id)))
    throw new Error("Invalid guided exercise selection");
  return {
    name: result.name,
    notes: result.notes,
    exercises: result.exercises.map(exercise => ({
      name: byId.get(exercise.id)!,
      sets: Array.from({ length: exercise.sets }, () => ({
        type: "working" as const, weight: "", reps: String(exercise.reps), restSeconds: exercise.restSeconds,
      })),
    })),
  };
}
