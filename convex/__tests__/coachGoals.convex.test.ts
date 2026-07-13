/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const goal = {
  title: "Habit-first reset",
  description: "Make training and meals easier to repeat.",
  startDate: "2026-07-13",
  durationDays: 7,
  pinned: true,
  sourceMode: "chat",
  tasks: [
    {
      title: "Training minimum",
      detail: "Two full-body sessions this week",
    },
    {
      title: "Nutrition anchor",
      detail: "One protein-centered meal each day",
    },
  ],
};

describe("Coach goals", () => {
  test("requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.ai.coachGoals.listPinned, {})).resolves.toEqual([]);
    await expect(t.query(api.ai.coachGoals.listActive, {})).resolves.toEqual([]);
    await expect(t.mutation(api.ai.coachGoals.save, goal)).rejects.toThrow(
      "Unauthenticated",
    );
  });

  test("creates a scheduled pinned goal and tracks task completion", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|coach-goals" });
    const created = await user.mutation(api.ai.coachGoals.save, goal);

    let pinned = await user.query(api.ai.coachGoals.listPinned, {});
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).toMatchObject({
      _id: created.goalId,
      title: goal.title,
      startDate: "2026-07-13",
      endDate: "2026-07-19",
      durationDays: 7,
      status: "active",
      pinned: true,
      tasks: [
        expect.objectContaining({ title: "Training minimum", completed: false }),
        expect.objectContaining({ title: "Nutrition anchor", completed: false }),
      ],
    });

    await user.mutation(api.ai.coachGoals.setTaskCompleted, {
      id: pinned[0].tasks[0]._id,
      completed: true,
    });
    pinned = await user.query(api.ai.coachGoals.listPinned, {});
    expect(pinned[0].status).toBe("active");

    await user.mutation(api.ai.coachGoals.setTaskCompleted, {
      id: pinned[0].tasks[1]._id,
      completed: true,
    });
    pinned = await user.query(api.ai.coachGoals.listPinned, {});
    expect(pinned[0].status).toBe("completed");
    expect(pinned[0].tasks.every((task) => task.completed)).toBe(true);
  });

  test("edits duration and tasks, then unpins without deleting", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|coach-goal-edit" });
    const { goalId } = await user.mutation(api.ai.coachGoals.save, goal);

    await user.mutation(api.ai.coachGoals.save, {
      id: goalId,
      ...goal,
      durationDays: 14,
      tasks: [{ title: "Daily walk", completed: true }],
    });
    let active = await user.query(api.ai.coachGoals.listActive, {});
    expect(active).toEqual([]);

    await user.mutation(api.ai.coachGoals.setTaskCompleted, {
      id: (await user.query(api.ai.coachGoals.listPinned, {}))[0].tasks[0]._id,
      completed: false,
    });
    active = await user.query(api.ai.coachGoals.listActive, {});
    expect(active[0]).toMatchObject({
      endDate: "2026-07-26",
      durationDays: 14,
      status: "active",
    });
    expect(active[0].tasks).toHaveLength(1);

    await user.mutation(api.ai.coachGoals.setPinned, {
      id: goalId,
      pinned: false,
    });
    await expect(
      user.query(api.ai.coachGoals.listPinned, {}),
    ).resolves.toEqual([]);
    expect(await user.query(api.ai.coachGoals.listActive, {})).toHaveLength(1);
  });

  test("enforces ownership and duration bounds", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|goal-owner" });
    const other = t.withIdentity({ tokenIdentifier: "test|goal-other" });
    const { goalId } = await owner.mutation(api.ai.coachGoals.save, goal);

    await expect(
      other.mutation(api.ai.coachGoals.setPinned, {
        id: goalId,
        pinned: false,
      }),
    ).rejects.toThrow("Goal not found or access denied");
    await expect(
      owner.mutation(api.ai.coachGoals.save, { ...goal, durationDays: 0 }),
    ).rejects.toThrow("Goal duration must be between 1 and 365 days");
  });
});
