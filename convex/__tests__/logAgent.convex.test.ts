import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { AI_FREE_MONTHLY_REQUEST_LIMIT } from "../ai/usage";

const modules = import.meta.glob("../**/*.ts");

/**
 * No OpenRouter key is configured in CI, so every case here exercises the
 * deterministic parser. That is deliberate: the fallback is what runs whenever
 * the model is unavailable, and it is the only part of the path that must never
 * silently produce a wrong log.
 */
describe("logs.logAgent.draftLogFromText", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.logs.logAgent.draftLogFromText, {
        text: "bench 3x8 at 185",
      }),
    ).rejects.toThrow();
  });

  test("rejects a description with nothing in it", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|log-agent-empty" });
    await expect(
      user.action(api.logs.logAgent.draftLogFromText, { text: "hi" }),
    ).rejects.toThrow(/at least one exercise/i);
  });

  test("parses a dictated recap into completed sets", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|log-agent" });

    const draft = await user.action(api.logs.logAgent.draftLogFromText, {
      text: "bench 3x8 at 185, then rows 3x10 at 60",
      unit: "lbs",
    });

    expect(draft.exercises).toHaveLength(2);
    expect(draft.exercises.map((exercise) => exercise.name)).toEqual([
      "bench",
      "rows",
    ]);
    for (const exercise of draft.exercises) {
      expect(exercise.sets).toHaveLength(3);
      expect(exercise.sets.every((set) => set.completed)).toBe(true);
    }
    // 185 lb, in the unit the user actually uses.
    expect(draft.exercises[0].sets[0]).toMatchObject({
      type: "working",
      weightKg: 83.91,
      reps: 8,
    });
    expect(draft.exercises[1].sets[0]).toMatchObject({
      weightKg: 27.22,
      reps: 10,
    });
  });

  test("reads an unqualified weight in the user's own unit", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|log-agent-kg" });

    const draft = await user.action(api.logs.logAgent.draftLogFromText, {
      text: "squat 5x5 at 100",
      unit: "kg",
    });
    expect(draft.exercises[0].sets[0].weightKg).toBe(100);
  });

  test("leaves an open-ended set for the user to fill in", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|log-agent-amrap" });

    const draft = await user.action(api.logs.logAgent.draftLogFromText, {
      text: "pull ups 3 x amrap",
    });
    expect(draft.exercises[0].sets[0]).toMatchObject({
      type: "failure",
      reps: 0,
    });
  });

  test("takes the low end of a rep range and picks up the session length", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|log-agent-range" });

    const draft = await user.action(api.logs.logAgent.draftLogFromText, {
      text: "took about an hour\\ndeadlift 4x8-10 at 140kg",
    });
    expect(draft.durationMinutes).toBe(60);
    expect(draft.exercises[0].sets[0]).toMatchObject({
      reps: 8,
      weightKg: 140,
    });
  });

  test("says so rather than inventing a workout it could not read", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|log-agent-noise" });

    const draft = await user.action(api.logs.logAgent.draftLogFromText, {
      text: "!!!! ????",
    });
    expect(draft.exercises).toEqual([]);
    expect(draft.notes).toMatch(/no exercises/i);
  });

  test("spends the monthly AI allowance and stops when it runs out", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|log-agent-quota" });

    await user.action(api.logs.logAgent.draftLogFromText, {
      text: "bench 3x8 at 60kg",
    });
    const usage = await user.query(api.ai.usage.getMonthlyUsage, {});
    expect(usage.count).toBe(1);
    expect(usage.remaining).toBe(AI_FREE_MONTHLY_REQUEST_LIMIT - 1);

    for (let i = usage.count; i < AI_FREE_MONTHLY_REQUEST_LIMIT; i += 1) {
      await user.action(api.logs.logAgent.draftLogFromText, {
        text: "bench 3x8 at 60kg",
      });
    }

    await expect(
      user.action(api.logs.logAgent.draftLogFromText, {
        text: "bench 3x8 at 60kg",
      }),
    ).rejects.toThrow(/limit/i);
  });
});
