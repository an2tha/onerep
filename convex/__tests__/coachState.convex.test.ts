import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const week = {
  weekStart: "2026-07-13",
  title: "Balanced week",
  days: [
    {
      day: "Mon",
      workoutPresetId: "preset-upper",
      workoutLabel: "Upper strength",
      meals: [
        {
          label: "Protein oats",
          recipeId: "recipe-oats",
          note: "Add berries",
        },
      ],
      recoveryNote: "Easy walk after dinner",
    },
    {
      day: "Tue",
      meals: [{ label: "Leftovers" }],
    },
  ],
  assumptions: ["Gym access on Monday", "Meal prep on Sunday"],
};

describe("coachState Convex functions", () => {
  test("unauthenticated reads return empty state and writes throw", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.ai.coachState.listMemories, {})).resolves.toEqual(
      [],
    );
    await expect(t.query(api.ai.coachState.listCheckIns, {})).resolves.toEqual(
      [],
    );
    await expect(
      t.query(api.ai.coachState.getWeeklyPlan, {
        weekStart: week.weekStart,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.ai.coachState.listActionHistory, {}),
    ).resolves.toEqual([]);

    await expect(
      t.mutation(api.ai.coachState.setMemory, {
        key: "diet",
        category: "preference",
        value: "Vegetarian",
      }),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      t.mutation(api.ai.coachState.saveCheckIn, {
        date: "2026-07-13",
        energy: 3,
        soreness: 2,
        sleepQuality: 4,
        mood: 4,
      }),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      t.mutation(api.ai.coachState.saveWeeklyPlan, week),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      t.mutation(api.ai.coachState.recordAction, {
        kind: "test",
        summary: "Test action",
        targetType: "test",
        undoPayload: null,
      }),
    ).rejects.toThrow("Unauthenticated");
  });

  test("sets, replaces, lists, and undoes memories", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|coach-memory" });

    const created = await user.mutation(api.ai.coachState.setMemory, {
      key: "  Training Days  ",
      category: "schedule",
      value: "Monday, Wednesday, Friday",
    });

    let memories = await user.query(api.ai.coachState.listMemories, {});
    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({
      _id: created.memoryId,
      userId: "test|coach-memory",
      key: "training days",
      category: "schedule",
      value: "Monday, Wednesday, Friday",
      source: "coach",
    });

    const replaced = await user.mutation(api.ai.coachState.setMemory, {
      key: "TRAINING DAYS",
      category: "schedule",
      value: "Tuesday and Thursday",
      source: "user",
    });
    expect(replaced.memoryId).toBe(created.memoryId);
    await expect(
      user.query(api.ai.coachState.listMemories, {}),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: created.memoryId,
        value: "Tuesday and Thursday",
        source: "user",
      }),
    ]);

    await expect(
      user.mutation(api.ai.coachState.undoAction, { id: replaced.actionId }),
    ).resolves.toEqual({ ok: true });
    memories = await user.query(api.ai.coachState.listMemories, {});
    expect(memories[0]).toMatchObject({
      value: "Monday, Wednesday, Friday",
      source: "coach",
    });

    await user.mutation(api.ai.coachState.undoAction, {
      id: created.actionId,
    });
    await expect(
      user.query(api.ai.coachState.listMemories, {}),
    ).resolves.toEqual([]);

    const history = await user.query(api.ai.coachState.listActionHistory, {});
    expect(history).toHaveLength(2);
    expect(history.every((event) => event.status === "undone")).toBe(true);
    expect(history.every((event) => typeof event.undoneAt === "number")).toBe(
      true,
    );
  });

  test("memory deletion enforces ownership", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|memory-owner" });
    const other = t.withIdentity({ tokenIdentifier: "test|memory-other" });
    const { memoryId } = await owner.mutation(api.ai.coachState.setMemory, {
      key: "equipment",
      category: "preference",
      value: "Dumbbells only",
    });

    await expect(
      other.mutation(api.ai.coachState.removeMemory, { id: memoryId }),
    ).rejects.toThrow("Memory not found or access denied");
    await expect(
      other.query(api.ai.coachState.listMemories, {}),
    ).resolves.toEqual([]);
    await expect(
      owner.mutation(api.ai.coachState.removeMemory, { id: memoryId }),
    ).resolves.toMatchObject({ actionId: expect.any(String) });
    await expect(
      owner.query(api.ai.coachState.listMemories, {}),
    ).resolves.toEqual([]);
  });

  test("legacy Coach upload endpoints tell the client to update", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|legacy-upload" });

    await expect(
      user.mutation(api.ai.coachState.generateUploadUrl, {}),
    ).rejects.toThrow("APP_UPDATE_REQUIRED");
    await expect(
      t.mutation(api.ai.coachState.generateUploadUrl, {}),
    ).rejects.toThrow();
  });

  test("resolves and deletes Coach image uploads owned through convex/uploads", async () => {
    const t = convexTest(schema, modules);
    const ownerId = "test|upload-owner";
    const owner = t.withIdentity({ tokenIdentifier: ownerId });
    const other = t.withIdentity({ tokenIdentifier: "test|upload-other" });
    const image = new Blob(["coach-image"], { type: "image/jpeg" });

    const intent = await owner.mutation(api.uploads.createIntent, {
      purpose: "coach_image",
      fileName: "meal.jpg",
      mimeType: "image/jpeg",
      size: image.size,
    });
    // convex-test's storage metadata has no contentType, so uploads.finalize
    // can never match the intent's MIME type here. Land the same "ready" row it
    // would have written and test the parts that do run in this harness.
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(image);
      await ctx.db.patch(intent.uploadId, {
        storageId: id,
        status: "ready",
        actualMimeType: "image/jpeg",
        actualSize: image.size,
        expiresAt: Date.now() + 60_000,
      });
      return id;
    });

    await expect(
      t.query(internal.ai.coachState.resolveUploadForModel, {
        id: intent.uploadId,
        userId: ownerId,
      }),
    ).resolves.toMatchObject({
      url: expect.any(String),
      mimeType: "image/jpeg",
      fileName: "meal.jpg",
    });
    await expect(
      t.query(internal.ai.coachState.resolveUploadForModel, {
        id: intent.uploadId,
        userId: "test|upload-other",
      }),
    ).resolves.toBeNull();
    await expect(
      other.mutation(api.uploads.discard, { uploadId: intent.uploadId }),
    ).rejects.toThrow("Upload not found or access denied");
    await expect(
      owner.mutation(api.uploads.discard, { uploadId: intent.uploadId }),
    ).resolves.toEqual({ ok: true });
    await expect(
      t.run(async (ctx) => await ctx.storage.getUrl(storageId)),
    ).resolves.toBeNull();
  });

  test("saves, replaces, lists, and undoes recovery check-ins", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|coach-check-in" });

    const created = await user.mutation(api.ai.coachState.saveCheckIn, {
      date: "2026-07-13",
      energy: 8,
      soreness: 0,
      sleepQuality: 3.4,
      mood: 4,
      note: "  Slept well  ",
    });
    let checkIns = await user.query(api.ai.coachState.listCheckIns, {});
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0]).toMatchObject({
      _id: created.checkInId,
      date: "2026-07-13",
      energy: 5,
      soreness: 1,
      sleepQuality: 3,
      mood: 4,
      note: "Slept well",
    });

    const replaced = await user.mutation(api.ai.coachState.saveCheckIn, {
      date: "2026-07-13",
      energy: 2,
      soreness: 5,
      sleepQuality: 2,
      mood: 2,
      note: "Hard session yesterday",
    });
    expect(replaced.checkInId).toBe(created.checkInId);

    await user.mutation(api.ai.coachState.undoAction, {
      id: replaced.actionId,
    });
    checkIns = await user.query(api.ai.coachState.listCheckIns, {});
    expect(checkIns[0]).toMatchObject({
      energy: 5,
      soreness: 1,
      sleepQuality: 3,
      mood: 4,
      note: "Slept well",
    });

    await expect(
      user.mutation(api.ai.coachState.undoAction, { id: created.actionId }),
    ).resolves.toEqual({ ok: true });
    await expect(
      user.query(api.ai.coachState.listCheckIns, {}),
    ).resolves.toEqual([]);

    // Repeating an undo is intentionally idempotent.
    await expect(
      user.mutation(api.ai.coachState.undoAction, { id: created.actionId }),
    ).resolves.toEqual({ ok: true });
  });

  test("rejects invalid check-in dates", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|check-in-date" });

    await expect(
      user.mutation(api.ai.coachState.saveCheckIn, {
        date: "13-07-2026",
        energy: 3,
        soreness: 3,
        sleepQuality: 3,
        mood: 3,
      }),
    ).rejects.toThrow("Check-in date must use YYYY-MM-DD");
  });

  test("records isolated action history and prevents cross-user undo", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|action-owner" });
    const other = t.withIdentity({ tokenIdentifier: "test|action-other" });

    const actionId = await owner.mutation(api.ai.coachState.recordAction, {
      kind: "nutrition_log",
      summary: "Logged breakfast",
      targetType: "food_entry",
      targetId: "entry-1",
      undoPayload: {
        kind: "restore_memory",
        key: "unused",
        previous: null,
      },
    });
    await other.mutation(api.ai.coachState.recordAction, {
      kind: "workout",
      summary: "Created workout",
      targetType: "preset",
      undoPayload: { kind: "restore_memory", key: "other", previous: null },
    });

    const ownerHistory = await owner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    expect(ownerHistory).toHaveLength(1);
    expect(ownerHistory[0]).toMatchObject({
      _id: actionId,
      userId: "test|action-owner",
      kind: "nutrition_log",
      summary: "Logged breakfast",
      status: "applied",
      targetType: "food_entry",
      targetId: "entry-1",
    });

    await expect(
      other.mutation(api.ai.coachState.undoAction, { id: actionId }),
    ).rejects.toThrow("Coach action not found or access denied");
    await expect(
      t.mutation(api.ai.coachState.undoAction, { id: actionId }),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      owner.mutation(api.ai.coachState.undoAction, { id: actionId }),
    ).resolves.toEqual({ ok: true });
  });

  test("saves, gets, isolates, and undoes a new weekly plan", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|weekly-owner" });
    const other = t.withIdentity({ tokenIdentifier: "test|weekly-other" });

    const created = await owner.mutation(
      api.ai.coachState.saveWeeklyPlan,
      week,
    );
    const plan = await owner.query(api.ai.coachState.getWeeklyPlan, {
      weekStart: week.weekStart,
    });
    expect(plan).toMatchObject({
      _id: created.planId,
      userId: "test|weekly-owner",
      weekStart: week.weekStart,
      title: week.title,
      days: week.days,
      assumptions: week.assumptions,
      status: "active",
    });
    await expect(
      other.query(api.ai.coachState.getWeeklyPlan, {
        weekStart: week.weekStart,
      }),
    ).resolves.toBeNull();
    await expect(
      other.mutation(api.ai.coachState.undoAction, { id: created.actionId }),
    ).rejects.toThrow("Coach action not found or access denied");

    await owner.mutation(api.ai.coachState.undoAction, {
      id: created.actionId,
    });
    await expect(
      owner.query(api.ai.coachState.getWeeklyPlan, {
        weekStart: week.weekStart,
      }),
    ).resolves.toBeNull();
  });

  test("carries per-meal macros, rounded and bounded, and drops the ones absent", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|weekly-macros" });

    await owner.mutation(api.ai.coachState.saveWeeklyPlan, {
      weekStart: "2026-07-13",
      title: "Prescribed week",
      assumptions: [],
      days: [
        {
          day: "Mon",
          meals: [
            {
              label: "Protein oats",
              calories: 519.6,
              protein: 40.2,
              carbs: 55,
              fat: 14,
            },
            { label: "Whatever is left" },
            // A slipped decimal is clamped, not stored as written.
            { label: "Enormous dinner", calories: 99_000, protein: -5 },
          ],
        },
      ],
    });

    const plan = await owner.query(api.ai.coachState.getWeeklyPlan, {
      weekStart: "2026-07-13",
    });
    const meals = (plan!.days as Array<{ meals: unknown[] }>)[0].meals;
    expect(meals[0]).toEqual({
      label: "Protein oats",
      calories: 520,
      protein: 40,
      carbs: 55,
      fat: 14,
    });
    expect(meals[1]).toEqual({ label: "Whatever is left" });
    expect(meals[2]).toEqual({
      label: "Enormous dinner",
      calories: 5000,
      protein: 0,
    });
  });

  test("snaps a weekly plan to the Monday that starts its week", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|weekly-monday" });

    // The model picks weekStart freely; readers anchor on Monday. A Sunday- or
    // midweek-anchored plan must not become invisible to the dashboard.
    for (const anchored of ["2026-07-15", "2026-07-19", "2026-07-13"]) {
      await user.mutation(api.ai.coachState.saveWeeklyPlan, {
        ...week,
        weekStart: anchored,
      });
      const plan = await user.query(api.ai.coachState.getWeeklyPlan, {
        weekStart: "2026-07-13",
      });
      expect(plan).toMatchObject({ weekStart: "2026-07-13" });
    }

    // All three writes collapsed onto the same week, so there is exactly one.
    const plans = await t.run(async (ctx) =>
      ctx.db
        .query("coachWeeklyPlans")
        .withIndex("by_userId", (q) => q.eq("userId", "test|weekly-monday"))
        .collect(),
    );
    expect(plans).toHaveLength(1);
  });

  test("getWeeklyPlan treats an unusable weekStart as a miss, not an error", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|weekly-garbage" });
    await user.mutation(api.ai.coachState.saveWeeklyPlan, week);

    // These used to throw RangeError out of toISOString() on an Invalid Date,
    // turning a lookup miss into a hard query failure.
    for (const weekStart of ["garbage", "", "13/07/2026", "2026-13-45"]) {
      await expect(
        user.query(api.ai.coachState.getWeeklyPlan, { weekStart }),
      ).resolves.toBeNull();
    }

    // A real week still resolves.
    await expect(
      user.query(api.ai.coachState.getWeeklyPlan, {
        weekStart: week.weekStart,
      }),
    ).resolves.toMatchObject({ weekStart: week.weekStart });
  });

  test("saveWeeklyPlan still rejects an unusable weekStart", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|weekly-bad-write" });

    for (const weekStart of ["garbage", "2026-13-45"]) {
      await expect(
        user.mutation(api.ai.coachState.saveWeeklyPlan, { ...week, weekStart }),
      ).rejects.toThrow("Week start must use YYYY-MM-DD");
    }
  });

  test("replaces a weekly plan and undo restores its previous version", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|weekly-replace" });

    const created = await user.mutation(api.ai.coachState.saveWeeklyPlan, week);
    const replaced = await user.mutation(api.ai.coachState.saveWeeklyPlan, {
      ...week,
      title: "Deload week",
      days: [
        {
          day: "Mon",
          workoutLabel: "Mobility",
          meals: [{ label: "Simple meal prep" }],
          recoveryNote: "Keep effort easy",
        },
      ],
      assumptions: ["Fatigue is elevated"],
    });
    expect(replaced.planId).toBe(created.planId);

    await user.mutation(api.ai.coachState.undoAction, {
      id: replaced.actionId,
    });
    const restored = await user.query(api.ai.coachState.getWeeklyPlan, {
      weekStart: week.weekStart,
    });
    expect(restored).toMatchObject({
      _id: created.planId,
      title: week.title,
      days: week.days,
      assumptions: week.assumptions,
      status: "active",
    });

    await expect(
      user.mutation(api.ai.coachState.saveWeeklyPlan, {
        ...week,
        weekStart: "July 13",
      }),
    ).rejects.toThrow("Week start must use YYYY-MM-DD");
    await expect(
      user.mutation(api.ai.coachState.saveWeeklyPlan, {
        ...week,
        days: [],
      }),
    ).rejects.toThrow("A weekly plan must contain 1 to 7 days");
  });
});
