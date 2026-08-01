import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.ts");

/**
 * Seeds one session plus one report, with a deliberately heavy `pose` and
 * `toolCalls` payload so the projection assertions mean something.
 */
async function seedReport(
  t: ReturnType<typeof convexTest>,
  userId: string,
  overrides: {
    exerciseId?: string;
    exerciseName?: string;
    date?: string;
    summary?: string;
    severities?: string[];
  } = {},
) {
  const exerciseId = overrides.exerciseId ?? "back-squat";
  const severities = overrides.severities ?? ["major", "minor"];
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(["{}"], { type: "application/json" }),
    );
    const sessionId = await ctx.db.insert("formCoachSessions", {
      userId,
      exerciseId,
      exerciseName: overrides.exerciseName ?? "Back Squat",
      slug: exerciseId,
      date: overrides.date ?? "2026-07-01",
      capturedAt: Date.now(),
      landmarksStorageId: storageId,
      repCount: 5,
      angles: [],
    });
    return await ctx.db.insert("formCoachReports", {
      userId,
      sessionId,
      exerciseId,
      exerciseName: overrides.exerciseName ?? "Back Squat",
      date: overrides.date ?? "2026-07-01",
      createdAt: Date.now(),
      summary: overrides.summary ?? "Depth is consistent; knees drift inward.",
      findings: severities.map((severity, index) => ({
        title: `Finding ${index}`,
        detail: "Detail",
        severity,
        confidence: "high",
        evidence: { measurement: "knee valgus", value: "12deg" },
      })),
      drills: [{ name: "Band walks", reason: "Glute medius" }],
      notMeasured: ["Bar path"],
      corrections: [
        {
          joint: "knee",
          side: "left",
          phase: "turnaround",
          targetDegrees: 8,
          reason: "Track over the toes",
        },
      ],
      pose: [
        {
          timeMs: 0,
          worldLandmarks: Array.from({ length: 33 }, () => ({
            x: 0.1,
            y: 0.2,
            z: 0.3,
            visibility: 1,
          })),
        },
      ],
      toolCalls: [
        { tool: "measureJointAngle", input: "{}", output: "{".repeat(200) },
      ],
    });
  });
}

describe("formCoachAgent report history", () => {
  test("listReports rejects when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.ai.formCoachAgent.listReports, {}),
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("listReports never ships pose frames or tool calls", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "form-history-user" }, async () => {
      const user = await t.query(api.users.users.getCurrentUser, {});
      await seedReport(t, user!._id);

      const rows = await t.query(api.ai.formCoachAgent.listReports, {});

      expect(rows).toHaveLength(1);
      const row = rows[0];
      // The whole point of the projection: these fields are megabytes and must
      // never enter a list subscription.
      expect(row).not.toHaveProperty("pose");
      expect(row).not.toHaveProperty("toolCalls");
      expect(row).not.toHaveProperty("findings");
      expect(row).not.toHaveProperty("corrections");
      expect(row).toMatchObject({
        exerciseName: "Back Squat",
        summary: "Depth is consistent; knees drift inward.",
        findingCount: 2,
        majorCount: 1,
        drillCount: 1,
        hasPose: true,
        hasCorrections: true,
        topFinding: { title: "Finding 0", severity: "major" },
      });
    });
  });

  test("listReports omits topFinding when nothing is major", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "form-history-minor-user" }, async () => {
      const user = await t.query(api.users.users.getCurrentUser, {});
      await seedReport(t, user!._id, { severities: ["minor", "strength"] });

      const rows = await t.query(api.ai.formCoachAgent.listReports, {});
      expect(rows[0]).not.toHaveProperty("topFinding");
      expect(rows[0]).toMatchObject({ findingCount: 2, majorCount: 0 });
    });
  });

  test("listReports filters by exerciseId", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "form-history-filter-user" }, async () => {
      const user = await t.query(api.users.users.getCurrentUser, {});
      await seedReport(t, user!._id, { exerciseId: "back-squat" });
      await seedReport(t, user!._id, {
        exerciseId: "deadlift",
        exerciseName: "Deadlift",
      });

      await expect(
        t.query(api.ai.formCoachAgent.listReports, {}),
      ).resolves.toHaveLength(2);
      const filtered = await t.query(api.ai.formCoachAgent.listReports, {
        exerciseId: "deadlift",
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].exerciseName).toBe("Deadlift");
    });
  });

  test("getReport and listReports never cross user boundaries", async () => {
    const t = convexTest(schema, modules);

    let ownerReportId: Id<"formCoachReports"> | null = null;
    await t.withIdentity({ name: "form-owner" }, async () => {
      const user = await t.query(api.users.users.getCurrentUser, {});
      ownerReportId = await seedReport(t, user!._id);
    });

    await t.withIdentity({ name: "form-stranger" }, async () => {
      await expect(
        t.query(api.ai.formCoachAgent.listReports, {}),
      ).resolves.toHaveLength(0);
      await expect(
        t.query(api.ai.formCoachAgent.getReport, {
          reportId: ownerReportId!,
        }),
      ).resolves.toBeNull();
    });
  });
});
