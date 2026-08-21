/**
 * Custom metrics on the Health page: which dial they land on, and what a dial
 * is allowed to claim about them.
 *
 * The test that matters most here is the one asserting `null`. A dial with
 * nothing to say used to be the sort of thing that quietly became a zero on the
 * way through a `??`, and a zero on a ring is a grade the user did not earn.
 */

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import {
  healthDialForCustomMetric,
  healthDialForMetricKey,
  HEALTH_DIAL_KEYS,
} from "../lib/healthMetricCatalog";
import { PLATFORM_METRICS } from "../lib/platformHealthMetrics";
import { scoreCustomMetric, scoreDial } from "../lib/customMetricScoring";

const modules = import.meta.glob("../**/*.ts");
const TODAY = "2026-08-09";

function asUser(t: ReturnType<typeof convexTest>, subject = "user_dials") {
  return t.withIdentity({ subject, issuer: "test", tokenIdentifier: subject });
}

/** `days` before TODAY, so a window can be filled without a date library. */
function daysAgo(n: number) {
  const d = new Date(Date.parse(`${TODAY}T12:00:00Z`));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("dial classification", () => {
  test("every catalogue metric lands on a dial that exists", () => {
    for (const metric of PLATFORM_METRICS) {
      const dial = healthDialForMetricKey(metric.key);
      expect(dial, `${metric.key} has no dial`).not.toBeNull();
      expect(HEALTH_DIAL_KEYS).toContain(dial as string);
    }
  });

  test("vitals split: the heart family on Heart, the rest on Vitals", () => {
    expect(healthDialForMetricKey("restingHeartRateBpm")).toBe("heart");
    expect(healthDialForMetricKey("walkingHeartRateAvgBpm")).toBe("heart");
    // Filing a finger-prick behind a ring labelled "Heart" is a lie the user
    // has to undo in their head every time they open it.
    expect(healthDialForMetricKey("bloodGlucoseMmolL")).toBe("vitals");
    expect(healthDialForMetricKey("dietarySodiumMg")).toBe("nutrition");
    expect(healthDialForMetricKey("mindfulMinutes")).toBe("mindfulness");
    expect(healthDialForMetricKey("menstruationFlow")).toBe("reproductive");
  });

  test("an unknown key is null rather than filed somewhere plausible", () => {
    expect(healthDialForMetricKey("bloodUnicornCount")).toBeNull();
    expect(healthDialForMetricKey(undefined)).toBeNull();
  });

  test("an unbound metric falls back to the tab the user chose", () => {
    expect(healthDialForCustomMetric({ tab: "training" })).toBe("activity");
    expect(healthDialForCustomMetric({ tab: "nutrition" })).toBe("nutrition");
    // A bound key outranks the tab: the catalogue knows what the signal is.
    expect(
      healthDialForCustomMetric({
        tab: "body",
        healthMetricKey: "mindfulMinutes",
      }),
    ).toBe("mindfulness");
  });
});

describe("scoring", () => {
  const metric = {
    metricId: "m1",
    title: "Blood glucose",
    unit: "mmol/L",
    kind: "number" as const,
  };

  test("no readings scores null, not zero", () => {
    const scored = scoreCustomMetric({ ...metric, entries: [] }, TODAY);
    expect(scored.score).toBeNull();
    expect(scored.basis).toBeNull();
    expect(scored.hasData).toBe(false);
  });

  test("too few readings for a baseline scores null", () => {
    const entries = [0, 1, 2].map((n) => ({ date: daysAgo(n), value: 5 }));
    const scored = scoreCustomMetric({ ...metric, entries }, TODAY);
    expect(scored.score).toBeNull();
    expect(scored.hasData).toBe(true);
  });

  test("steady against your own median scores full marks", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      date: daysAgo(i),
      value: 5,
    }));
    const scored = scoreCustomMetric({ ...metric, entries }, TODAY);
    expect(scored.basis).toBe("baseline");
    expect(scored.score).toBe(100);
    expect(scored.baseline).toBe(5);
    expect(scored.latest).toEqual({ date: TODAY, value: 5 });
  });

  test("drifting off your own baseline costs, in either direction", () => {
    const build = (recentValue: number) =>
      Array.from({ length: 12 }, (_, i) => ({
        date: daysAgo(i),
        value: i < 3 ? recentValue : 5,
      }));
    const up = scoreCustomMetric({ ...metric, entries: build(6.25) }, TODAY);
    const down = scoreCustomMetric({ ...metric, entries: build(3.75) }, TODAY);
    // 25% off the median, half of the 50% that scores zero.
    expect(up.score).toBe(50);
    expect(down.score).toBe(50);
  });

  test("a target the user set beats the baseline, and is symmetric", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      date: daysAgo(i),
      value: i < 3 ? 100 : 200,
    }));
    const on = scoreCustomMetric({ ...metric, target: 100, entries }, TODAY);
    expect(on.basis).toBe("target");
    expect(on.score).toBe(100);

    // Double the target is a miss, because this file does not know whether the
    // target was a floor or a ceiling and will not guess.
    const over = scoreCustomMetric({ ...metric, target: 50, entries }, TODAY);
    expect(over.score).toBe(0);

    // Unless it is a counter, where doing more of a thing you set out to do is
    // not a failure. That comes from the data model, not from an opinion.
    const counter = scoreCustomMetric(
      { ...metric, kind: "counter", target: 50, entries },
      TODAY,
    );
    expect(counter.score).toBe(100);
  });

  test("a dial averages only the metrics it could score", () => {
    const scorable = scoreCustomMetric(
      {
        ...metric,
        target: 10,
        entries: [{ date: TODAY, value: 5 }],
      },
      TODAY,
    );
    const unscorable = scoreCustomMetric(
      { ...metric, metricId: "m2", entries: [{ date: TODAY, value: 5 }] },
      TODAY,
    );
    const dial = scoreDial("vitals", [scorable, unscorable]);
    // 50, not 25: the unscorable one is a gap in the evidence, not a zero.
    expect(dial.score).toBe(50);
    expect(dial.hasData).toBe(true);

    expect(scoreDial("vitals", [unscorable]).score).toBeNull();
    expect(scoreDial("vitals", []).hasData).toBe(false);
  });
});

describe("the dashboard payload", () => {
  test("carries dials, their metrics, and whether they hold anything", async () => {
    const t = convexTest(schema, modules);
    const user = asUser(t);
    const userId = "user_dials";

    await t.run(async (ctx) => {
      const glucose = await ctx.db.insert("customProgressMetrics", {
        userId,
        title: "Blood glucose",
        description: "Morning reading",
        tab: "body",
        kind: "number",
        unit: "mmol/L",
        step: 0.1,
        accent: "progress",
        healthMetricKey: "bloodGlucoseMmolL",
        createdAt: 0,
        updatedAt: 0,
      });
      for (let i = 0; i < 10; i += 1) {
        await ctx.db.insert("customProgressMetricEntries", {
          userId,
          metricId: glucose,
          date: daysAgo(i),
          value: 5,
          updatedAt: 0,
        });
      }
      // Filed under a dial but never logged: the page needs to know it exists
      // and has nothing, so it can send it to Trends instead of a ring.
      await ctx.db.insert("customProgressMetrics", {
        userId,
        title: "Meditation",
        description: "Minutes sat still",
        tab: "training",
        kind: "counter",
        unit: "min",
        step: 5,
        accent: "progress",
        healthMetricKey: "mindfulMinutes",
        createdAt: 0,
        updatedAt: 0,
      });
    });

    const dashboard = await user.query(api.logs.healthMetrics.dashboard, {
      today: TODAY,
    });

    const vitals = dashboard!.customDials.find((d) => d.dial === "vitals");
    expect(vitals!.score).toBe(100);
    expect(vitals!.hasData).toBe(true);
    expect(vitals!.metrics[0].latest).toEqual({ date: TODAY, value: 5 });
    expect(vitals!.metrics[0].unit).toBe("mmol/L");

    const mind = dashboard!.customDials.find((d) => d.dial === "mindfulness");
    expect(mind!.hasData).toBe(false);
    expect(mind!.score).toBeNull();

    // Dials nobody filed a metric under are absent rather than empty.
    expect(dashboard!.customDials.some((d) => d.dial === "reproductive")).toBe(
      false,
    );
    expect(dashboard!.dials.map((d) => d.key)).toContain("vitals");
  });
});
