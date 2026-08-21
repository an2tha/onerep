import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";
import { MAX_EPISODES } from "../lib/memoryConsolidation";

const modules = import.meta.glob("../**/*.ts");

const TODAY = "2026-08-09";
const USER = "user_history";

async function seedMonth(
  t: ReturnType<typeof convexTest>,
  {
    userId = USER,
    dates,
    weightKg,
  }: { userId?: string; dates: string[]; weightKg?: number },
) {
  await t.run(async (ctx) => {
    for (const date of dates) {
      await ctx.db.insert("foodLogs", {
        userId,
        date,
        entries: [{ calories: 2000, protein: 150 }],
        updatedAt: Date.now(),
      });
      await ctx.db.insert("workoutLogs", {
        userId,
        date,
        exercises: [
          {
            id: "ex",
            name: "Squat",
            sets: [
              { type: "warmup", reps: 5, weight: 60, completed: true },
              { type: "normal", reps: 5, weight: 100, completed: true },
            ],
          },
        ],
        durationSeconds: 3600,
        completedAt: Date.now(),
      });
    }
    if (weightKg !== undefined) {
      await ctx.db.insert("bodyMeasurements", {
        userId,
        clientId: `${userId}-${dates[0]}`,
        loggedAt: `${dates[0]}T08:00:00Z`,
        weightKg,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  });
}

describe("recomputing the long view", () => {
  test("stores a row per month and counts only working sets", async () => {
    const t = convexTest(schema, modules);
    await seedMonth(t, { dates: ["2026-08-01", "2026-08-04"], weightKg: 80 });
    await seedMonth(t, { dates: ["2026-07-06"], weightKg: 82 });

    await t.mutation(internal.ai.coachHistory.recomputeMonths, {
      userId: USER,
      today: TODAY,
    });

    const rows = await t.run((ctx) =>
      ctx.db.query("coachMonthlySummaries").collect(),
    );
    expect(rows.map((row) => row.month).sort()).toEqual(["2026-07", "2026-08"]);

    const august = rows.find((row) => row.month === "2026-08")!;
    expect(august.sessions).toBe(2);
    // One working set each; the warm-ups do not count.
    expect(august.sets).toBe(2);
    expect(august.loggedFoodDays).toBe(2);
    expect(august.daysInMonth).toBe(31);
  });

  test("recomputing is idempotent rather than duplicating", async () => {
    const t = convexTest(schema, modules);
    await seedMonth(t, { dates: ["2026-08-01"] });

    for (let run = 0; run < 3; run += 1) {
      await t.mutation(internal.ai.coachHistory.recomputeMonths, {
        userId: USER,
        today: TODAY,
      });
    }

    const rows = await t.run((ctx) =>
      ctx.db.query("coachMonthlySummaries").collect(),
    );
    expect(rows).toHaveLength(1);
  });

  test("a month emptied by deletions loses its row", async () => {
    const t = convexTest(schema, modules);
    await seedMonth(t, { dates: ["2026-08-01"] });
    await t.mutation(internal.ai.coachHistory.recomputeMonths, {
      userId: USER,
      today: TODAY,
    });

    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("foodLogs").collect()) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("workoutLogs").collect()) {
        await ctx.db.delete(row._id);
      }
    });

    await t.mutation(internal.ai.coachHistory.recomputeMonths, {
      userId: USER,
      today: TODAY,
    });

    // A gap, not a row of zeroes the coach might read as a month of nothing.
    expect(
      await t.run((ctx) => ctx.db.query("coachMonthlySummaries").collect()),
    ).toEqual([]);
  });

  test("only the two most recent months are touched", async () => {
    const t = convexTest(schema, modules);
    await seedMonth(t, { dates: ["2026-04-02"] });

    await t.mutation(internal.ai.coachHistory.recomputeMonths, {
      userId: USER,
      today: TODAY,
    });

    // April is outside the recompute window; paying to re-derive a months-old
    // answer every week is the cost this design exists to avoid.
    expect(
      await t.run((ctx) => ctx.db.query("coachMonthlySummaries").collect()),
    ).toEqual([]);
  });

  test("one user's months never reach another's history", async () => {
    const t = convexTest(schema, modules);
    await seedMonth(t, { userId: "user_a", dates: ["2026-08-01"] });

    await t.mutation(internal.ai.coachHistory.recomputeMonths, {
      userId: "user_b",
      today: TODAY,
    });

    expect(
      await t.run((ctx) => ctx.db.query("coachMonthlySummaries").collect()),
    ).toEqual([]);
  });

  test("the workspace carries the block once it exists", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId: USER,
        lastActiveTimezone: "UTC",
        updatedAt: Date.now(),
      });
    });
    await seedMonth(t, { dates: ["2026-08-01"], weightKg: 80 });
    await seedMonth(t, { dates: ["2026-07-01"], weightKg: 83 });
    await t.mutation(internal.ai.coachHistory.recomputeMonths, {
      userId: USER,
      today: TODAY,
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: USER,
      today: TODAY,
    });

    expect(workspace.history.months).toHaveLength(2);
    expect(workspace.history.weightTrendKgPerMonth).toBe(-3);
  });
});

describe("episodes", () => {
  test("writes the week's digest as an ordinary memory", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ai.coachHistory.recordEpisode, {
      userId: USER,
      weekKey: "2026-W32",
      digest: "First week back after the shoulder flare-up. Kept it light.",
    });

    const memory = await t.run((ctx) => ctx.db.query("coachMemories").first());
    expect(memory!.key).toBe("episode:2026-w32");
    expect(memory!.category).toBe("episode");
    expect(memory!.source).toBe("weekly_review");
  });

  test("re-running a week overwrites rather than accumulating", async () => {
    const t = convexTest(schema, modules);
    for (const digest of ["First take.", "Second take."]) {
      await t.mutation(internal.ai.coachHistory.recordEpisode, {
        userId: USER,
        weekKey: "2026-W32",
        digest,
      });
    }

    const rows = await t.run((ctx) => ctx.db.query("coachMemories").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("Second take.");
  });

  test("an empty digest writes nothing", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.ai.coachHistory.recordEpisode, {
      userId: USER,
      weekKey: "2026-W32",
      digest: "   ",
    });
    expect(result.stored).toBe(false);
    expect(
      await t.run((ctx) => ctx.db.query("coachMemories").collect()),
    ).toEqual([]);
  });

  test("a season of episodes never evicts what the user wrote", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("coachMemories", {
        userId: USER,
        key: "shoulder",
        category: "injury",
        value: "Left shoulder flares up on overhead work",
        source: "user",
        updatedAt: 1,
      });
    });

    for (let week = 1; week <= MAX_EPISODES + 5; week += 1) {
      await t.mutation(internal.ai.coachHistory.recordEpisode, {
        userId: USER,
        weekKey: `2026-W${String(week).padStart(2, "0")}`,
        digest: `Week ${week} happened.`,
      });
    }

    const rows = await t.run((ctx) => ctx.db.query("coachMemories").collect());
    const kept = rows.filter((row) => row.category === "episode");
    expect(kept).toHaveLength(MAX_EPISODES);
    // The whole point: the oldest thing in the table is the one that survives.
    expect(rows.some((row) => row.key === "shoulder")).toBe(true);
  });
});

describe("what reaches the model", () => {
  test("an old constraint survives a flood of newer memories", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId: USER,
        lastActiveTimezone: "UTC",
        updatedAt: Date.now(),
      });
      // Written a year ago, and then buried under fifty newer notes. Taking
      // the newest 40 would drop it entirely; ranking a pre-filtered list
      // would not save it either.
      await ctx.db.insert("coachMemories", {
        userId: USER,
        key: "shoulder",
        category: "injury",
        value: "Left shoulder flares up on overhead work",
        source: "user",
        updatedAt: 1,
      });
      for (let index = 0; index < 50; index += 1) {
        await ctx.db.insert("coachMemories", {
          userId: USER,
          key: `noise-${index}`,
          category: "preference",
          value: `Observation ${index}`,
          source: "coach",
          updatedAt: 1_700_000_000_000 + index,
        });
      }
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: USER,
      today: TODAY,
    });

    expect(workspace.memories[0].key).toBe("shoulder");
    expect(workspace.memories.length).toBeLessThanOrEqual(40);
  });
});
