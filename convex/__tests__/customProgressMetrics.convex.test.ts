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

  test("updates a definition in place, keeping the values logged against it", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "metric-editor" });
    const metricId = await as.mutation(
      api.customProgressMetrics.saveDefinition,
      {
        title: "Migranes",
        description: "Typo and all",
        tab: "body",
        kind: "counter",
        unit: "",
        step: 1,
        target: 3,
        accent: "progress",
      },
    );
    await as.mutation(api.customProgressMetrics.setValue, {
      metricId,
      date: "2026-07-20",
      value: 2,
    });

    await as.mutation(api.customProgressMetrics.updateDefinition, {
      metricId,
      title: "Migraines",
      target: null,
      healthMetricKey: "bloodGlucoseMmolL",
    });

    const [metric] = await as.query(api.customProgressMetrics.list, {});
    expect(metric.title).toBe("Migraines");
    // A partial edit leaves everything it did not name alone.
    expect(metric.description).toBe("Typo and all");
    expect(metric.target).toBeUndefined();
    expect(metric.healthMetricKey).toBe("bloodGlucoseMmolL");
    // The point of editing rather than recreating: the history survives.
    expect(metric.entries).toHaveLength(1);
    expect(metric.entries[0].value).toBe(2);
  });

  test("refuses an unknown health metric key instead of storing it", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "metric-binder" });
    const metricId = await as.mutation(
      api.customProgressMetrics.saveDefinition,
      {
        title: "Glucose",
        description: "",
        tab: "body",
        kind: "number",
        unit: "mg/dL",
        step: 1,
        accent: "progress",
      },
    );
    await expect(
      as.mutation(api.customProgressMetrics.updateDefinition, {
        metricId,
        healthMetricKey: "vibes",
      }),
    ).rejects.toThrow(/Unknown health metric key/);
  });

  test("refuses to edit somebody else's metric", async () => {
    const t = convexTest(schema, modules);
    const metricId = await t
      .withIdentity({ name: "metric-owner" })
      .mutation(api.customProgressMetrics.saveDefinition, {
        title: "Steps to the fridge",
        description: "",
        tab: "training",
        kind: "counter",
        unit: "",
        step: 1,
        accent: "workout",
      });
    await expect(
      t
        .withIdentity({ name: "metric-stranger" })
        .mutation(api.customProgressMetrics.updateDefinition, {
          metricId,
          title: "Mine now",
        }),
    ).rejects.toThrow(/not found/i);
  });
});
