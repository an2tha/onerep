import { v } from "convex/values";
export const centerKind = v.union(
  v.literal("review"),
  v.literal("progress"),
  v.literal("plan"),
  v.literal("meals"),
);
export const centerContent = v.object({
  title: v.string(),
  summary: v.string(),
  observations: v.array(v.object({ title: v.string(), detail: v.string() })),
  nextSteps: v.array(v.string()),
  limitations: v.array(v.string()),
  sessions: v.array(
    v.object({
      day: v.string(),
      title: v.string(),
      durationMinutes: v.number(),
      exercises: v.array(
        v.object({
          name: v.string(),
          sets: v.number(),
          reps: v.string(),
          restSeconds: v.number(),
          note: v.string(),
        }),
      ),
    }),
  ),
  meals: v.array(
    v.object({
      name: v.string(),
      meal: v.string(),
      minutes: v.number(),
      ingredients: v.array(v.string()),
      steps: v.array(v.string()),
    }),
  ),
});
export const centerResult = v.object({
  kind: centerKind,
  today: v.string(),
  createdAt: v.number(),
  content: centerContent,
  series: v.optional(
    v.array(
      v.object({
        title: v.string(),
        unit: v.string(),
        points: v.array(v.object({ date: v.string(), value: v.number() })),
      }),
    ),
  ),
  activity: v.array(v.object({ date: v.string(), sessions: v.number() })),
});
