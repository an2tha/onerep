import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.ts");

describe("custom progress metrics", () => {
  test("requires authentication for writes and returns no public data", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.customProgressMetrics.list, {})).resolves.toEqual(
      [],
    );
    await expect(
      t.mutation(api.customProgressMetrics.saveDefinition, {
        title: "Caffeine",
        description: "Daily intake",
        tab: "nutrition",
        kind: "counter",
        unit: "mg",
        step: 50,
        target: 400,
        accent: "food",
      }),
    ).rejects.toThrow();
  });

  test("creates an interactive metric and upserts one value per day", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "metric-user" }, async () => {
      const metricId = await t.mutation(
        api.customProgressMetrics.saveDefinition,
        {
          title: "Caffeine",
          description: "Daily intake",
          tab: "nutrition",
          kind: "counter",
          unit: "mg",
          step: 50,
          target: 400,
          accent: "food",
        },
      );
      await t.mutation(api.customProgressMetrics.setValue, {
        metricId,
        date: "2026-07-20",
        value: 50,
      });
      await t.mutation(api.customProgressMetrics.setValue, {
        metricId,
        date: "2026-07-20",
        value: 100,
      });
      const metrics = await t.query(api.customProgressMetrics.list, {
        tab: "nutrition",
      });
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        title: "Caffeine",
        kind: "counter",
        step: 50,
      });
      expect(metrics[0].entries).toHaveLength(1);
      expect(metrics[0].entries[0].value).toBe(100);
    });
  });

  test("Coach can implement and undo a generated metric", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "coach-metric-user" }, async () => {
      const results = (await t.action(api.ai.coachOperations.applyApproved, {
        requestId: "metric-run-1",
        operations: [
          {
            type: "save_progress_metric",
            confirmation: "auto",
            summary: "Add caffeine tracking",
            assumptions: ["Track a daily total"],
            warnings: [],
            title: "Caffeine",
            description: "Track daily caffeine intake.",
            tab: "nutrition",
            kind: "counter",
            unit: "mg",
            step: 50,
            target: 400,
            accent: "food",
          },
        ],
      })) as Array<{ actionId: string }>;
      expect(await t.query(api.customProgressMetrics.list, {})).toHaveLength(1);
      await t.mutation(api.ai.coachState.undoAction, {
        id: results[0].actionId as Id<"coachActionEvents">,
      });
      expect(await t.query(api.customProgressMetrics.list, {})).toHaveLength(0);
    });
  });

  test("keeps each user's definitions private", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "owner" }, async () => {
      await t.mutation(api.customProgressMetrics.saveDefinition, {
        title: "Mobility",
        description: "Daily mobility minutes",
        tab: "training",
        kind: "counter",
        unit: "min",
        step: 5,
        accent: "workout",
      });
    });
    await t.withIdentity({ name: "other" }, async () => {
      await expect(
        t.query(api.customProgressMetrics.list, {}),
      ).resolves.toEqual([]);
    });
  });
});
