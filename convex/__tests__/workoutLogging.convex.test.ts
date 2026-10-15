import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
const modules = import.meta.glob("../**/*.ts");

describe("workout logging preference", () => {
  test("requires authentication for both changes and introduction bookkeeping", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.users.setRelaxedWorkoutLogging, { enabled: true })).rejects.toThrow();
    await expect(t.mutation(api.users.users.acknowledgeRelaxedWorkoutLogging, {})).rejects.toThrow();
  });
  test("persists both directions, isolates accounts, and remembers the first actual introduction", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ name: "relaxed-alice" });
    const bob = t.withIdentity({ name: "relaxed-bob" });
    await alice.mutation(api.users.users.setRelaxedWorkoutLogging, { enabled: true });
    expect((await alice.query(api.users.users.getPreferences, {}))?.relaxedWorkoutLoggingIntroducedAt).toBeUndefined();
    await alice.mutation(api.users.users.acknowledgeRelaxedWorkoutLogging, {});
    const first = await alice.query(api.users.users.getPreferences, {});
    await alice.mutation(api.users.users.setRelaxedWorkoutLogging, { enabled: false });
    await alice.mutation(api.users.users.acknowledgeRelaxedWorkoutLogging, {});
    expect(await alice.query(api.users.users.getPreferences, {})).toMatchObject({ relaxedWorkoutLogging: false, relaxedWorkoutLoggingIntroducedAt: first!.relaxedWorkoutLoggingIntroducedAt });
    expect(await bob.query(api.users.users.getPreferences, {})).toBeNull();
  });
  test("Coach changes the same setting and undo restores it without resetting the introduction", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "relaxed-coach" });
    await as.mutation(api.users.users.acknowledgeRelaxedWorkoutLogging, {});
    const result = await as.action(api.ai.coachOperations.applyApproved, { requestId: "relaxed-on", operations: [{ type: "set_workout_logging", enabled: true, confirmation: "auto", summary: "Turn on relaxed logging", assumptions: [], warnings: [] }] }) as Array<{ actionId: string }>;
    expect((await as.query(api.users.users.getPreferences, {}))?.relaxedWorkoutLogging).toBe(true);
    await as.mutation(api.ai.coachState.undoAction, { id: result[0].actionId as Id<"coachActionEvents"> });
    const preferences = await as.query(api.users.users.getPreferences, {});
    expect(preferences?.relaxedWorkoutLogging).toBe(false);
    expect(preferences?.relaxedWorkoutLoggingIntroducedAt).toBeTypeOf("number");
  });
  test("completed sets with optional reps save and retain their meaning in history", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "relaxed-log" });
    await as.mutation(api.logs.workouts.completion, { date: "2026-10-15", sessionId: "relaxed-session", durationSeconds: 600, exercises: [{ id: "squat", name: "Squat", sets: [{ type: "normal", weight: 0, reps: 0, completed: true, loggingMode: "relaxed" }] }] });
    const history = await as.query(api.logs.workouts.historyForExercise, { exerciseId: "squat" });
    expect(history[0].sets[0]).toMatchObject({ completed: true, loggingMode: "relaxed", weight: 0, reps: 0 });
  });
});
