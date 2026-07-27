/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

async function createCaffeineMetric(t: ReturnType<typeof convexTest>) {
  return await t.mutation(api.customProgressMetrics.saveDefinition, {
    title: "Caffeine",
    description: "Daily caffeine intake",
    tab: "nutrition",
    kind: "counter",
    unit: "mg",
    step: 50,
    target: 400,
    accent: "food",
  });
}

describe("Coach dashboard widgets", () => {
  test("creates widgets outside the dashboard until the user opts in", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "widget-user" }, async () => {
      const metricId = await createCaffeineMetric(t);
      await t.mutation(api.customProgressMetrics.setValue, {
        metricId,
        date: "2026-03-15",
        value: 190,
      });
      const saved = await t.mutation(api.dashboardWidgets.saveFromCoach, {
        title: "Caffeine today",
        description: "Current daily total",
        kind: "stat",
        sourceMetricId: metricId,
        sourceMetricTitle: "Caffeine",
        unit: "mg",
        accent: "food",
        target: 400,
      });

      expect(
        await t.query(api.dashboardWidgets.listPinnedWithData, {
          beforeOrOn: "2026-03-15",
        }),
      ).toEqual([]);

      await t.mutation(api.dashboardWidgets.setPinned, {
        widgetId: saved.widgetId,
        pinned: true,
      });
      const pinned = await t.query(api.dashboardWidgets.listPinnedWithData, {
        beforeOrOn: "2026-03-15",
      });
      expect(pinned).toHaveLength(1);
      expect(pinned[0].entries[0].value).toBe(190);

      await t.mutation(api.customProgressMetrics.remove, { metricId });
      expect(await t.query(api.dashboardWidgets.list, {})).toEqual([]);
    });
  });

  test("supports a follow-up decay widget linked to its parent", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "follow-up-user" }, async () => {
      const metricId = await createCaffeineMetric(t);
      const parent = await t.mutation(api.dashboardWidgets.saveFromCoach, {
        title: "Caffeine today",
        description: "Current total",
        kind: "stat",
        sourceMetricId: metricId,
        unit: "mg",
        accent: "food",
      });
      const followUp = await t.mutation(api.dashboardWidgets.saveFromCoach, {
        title: "Estimated caffeine decay",
        description: "Estimated remaining caffeine",
        kind: "decay",
        sourceMetricId: metricId,
        unit: "mg",
        accent: "food",
        halfLifeHours: 5,
        parentWidgetId: parent.widgetId,
      });
      const widgets = await t.query(api.dashboardWidgets.list, {});
      expect(
        widgets.find((widget) => widget._id === followUp.widgetId)
          ?.parentWidgetId,
      ).toBe(parent.widgetId);
    });
  });

  test("Coach creation returns an opt-in widget and a useful follow-up", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "coach-widget-user" }, async () => {
      await createCaffeineMetric(t);
      const results = (await t.action(api.ai.coachOperations.applyApproved, {
        requestId: "widget-run-1",
        operations: [
          {
            type: "save_dashboard_widget",
            confirmation: "auto",
            summary: "Create caffeine widget",
            assumptions: [],
            warnings: [],
            title: "Caffeine today",
            description: "Today’s logged caffeine total.",
            kind: "counter",
            sourceMetricTitle: "Caffeine",
            unit: "mg",
            accent: "food",
            target: 400,
          },
        ],
      })) as Array<{
        widgetId: string;
        pinned: boolean;
        followUpKind?: string;
      }>;
      expect(results[0].pinned).toBe(false);
      expect(results[0].followUpKind).toBe("decay");
      expect(
        await t.query(api.dashboardWidgets.listPinnedWithData, {
          beforeOrOn: "2026-03-15",
        }),
      ).toEqual([]);
    });
  });

  test("keeps widget definitions isolated per user", async () => {
    const t = convexTest(schema, modules);
    let widgetId: Id<"dashboardWidgets"> | undefined;
    await t.withIdentity({ name: "owner" }, async () => {
      const metricId = await createCaffeineMetric(t);
      widgetId = (
        await t.mutation(api.dashboardWidgets.saveFromCoach, {
          title: "Private widget",
          description: "Owner only",
          kind: "stat",
          sourceMetricId: metricId,
          unit: "mg",
          accent: "food",
        })
      ).widgetId;
    });
    await t.withIdentity({ name: "other" }, async () => {
      expect(await t.query(api.dashboardWidgets.list, {})).toEqual([]);
      await expect(
        t.mutation(api.dashboardWidgets.setPinned, {
          widgetId: widgetId!,
          pinned: true,
        }),
      ).rejects.toThrow("Widget not found");
    });
  });
});
