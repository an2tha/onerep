import { v } from "convex/values";

export const coachPreparationValidator = v.object({
  id: v.union(
    v.literal("nutrition_targets"),
    v.literal("recent_training"),
    v.literal("saved_meals"),
  ),
  title: v.string(),
  detail: v.string(),
  rows: v.array(v.object({ label: v.string(), value: v.string() })),
});

export const jevHandoffValidator = v.object({
  state: v.literal("handoff"),
  reason: v.union(
    v.literal("prepared"),
    v.literal("needs_reasoning"),
    v.literal("uncertain"),
    v.literal("no_matching_ui"),
    v.literal("timeout"),
    v.literal("error"),
    v.literal("unavailable"),
  ),
  elapsedMs: v.number(),
  preparation: v.union(coachPreparationValidator, v.null()),
});
