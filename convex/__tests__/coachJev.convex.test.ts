import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { AI_SHARING_VERSION } from "../lib/aiSharing";
import type { JevHandoff } from "../../packages/models/src/coachPreparation";

vi.mock("../ai/jev", () => ({ prepareWithJev: vi.fn() }));
vi.mock("../ai/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/provider")>()),
  hasOpenAiApiKey: vi.fn(() => true),
  requestOpenAiJson: vi.fn(),
}));
import { prepareWithJev } from "../ai/jev";
import { requestOpenAiJson } from "../ai/provider";

const modules = import.meta.glob("../**/*.ts");
const context = {
  goal: "build",
  experienceLevel: null,
  safetyMode: "standard",
  safetyFlags: [],
  nutritionGuidance: [],
  weightPaceKgPerWeek: null,
  weightStatus: "stable",
  calorieTarget: 2400,
  averageCalories: 2389,
  averageProtein: 92,
  proteinTarget: 161,
  proteinAdherence: 57,
  calorieAccuracy: 90,
  macroConsistency: 80,
  workoutDays7: 3,
  volumeChange7Pct: null,
  hardSets7: 30,
  selectedExerciseName: null,
  selectedLiftPaceKgPerWeek: null,
  selectedLiftFrequency: null,
  dataConfidence: 90,
  weekDays: [],
  todayProtein: 92,
  todayCalories: 2389,
  lastWorkout: null,
  hasAnyData: true,
  existingInsights: [],
};
const reply = JSON.stringify({
  reply: "Here is your answer.",
  operations: [],
  artifacts: [],
});
const prepared: JevHandoff = {
  state: "handoff",
  reason: "prepared",
  elapsedMs: 80,
  preparation: {
    id: "nutrition_targets",
    title: "Your nutrition targets",
    detail: "Saved targets",
    rows: [{ label: "Protein", value: "130 g" }],
  },
};
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("Jev to Luna coach pipeline", () => {
  test("preparation participates in account export and deletion", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|jev-lifecycle";
    const user = t.withIdentity({ tokenIdentifier: userId });
    await t.mutation(internal.ai.coachPreparations.publish, {
      userId, requestId: "lifecycle", handoff: prepared,
    });
    await t.mutation(internal.ai.coachPreparations.publish, {
      userId: "test|other-lifecycle", requestId: "lifecycle", handoff: prepared,
    });
    const exported = await user.query(api.users.users.exportMyData, {});
    expect(exported.data.coachPreparations).toHaveLength(1);
    const id = exported.data.coachPreparations[0]._id;
    await user.mutation(api.users.users.deleteMyDataBatch, { batchSize: 50 });
    expect(await user.query(api.ai.coachPreparations.get, { requestId: "lifecycle" })).toBeNull();
    // A cleanup scheduled before account deletion is harmless afterwards.
    await t.mutation(internal.ai.coachPreparations.remove, { id });
    expect(await t.run(async (ctx) => ctx.db.query("coachPreparations").collect())).toHaveLength(1);
  });
  for (const reason of [
    "prepared",
    "needs_reasoning",
    "uncertain",
    "no_matching_ui",
    "timeout",
    "error",
    "unavailable",
  ] as const) {
    test(`${reason} hands off once, preserving the original request and history`, async () => {
      const user = convexTest(schema, modules).withIdentity({
        tokenIdentifier: `test|jev-${reason}`,
      });
      await user.mutation(api.ai.usage.setSharingConsent, {
        granted: true,
        version: AI_SHARING_VERSION,
      });
      const handoff: JevHandoff = {
        ...prepared,
        reason,
        preparation: reason === "prepared" ? prepared.preparation : null,
      };
      vi.mocked(prepareWithJev).mockResolvedValue(handoff);
      vi.mocked(requestOpenAiJson).mockImplementation(async (request) => {
        expect(prepareWithJev).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(request.user);
        expect(payload.message).toBe("Help me plan tomorrow");
        expect(payload.recentConversation).toEqual([
          { role: "user", content: "I have 30 minutes" },
        ]);
        expect(payload.jevHandoff).toEqual(handoff);
        return reply;
      });
      const result = await user.action(
        api.ai.metricGeneration.generateCoachChatMessage,
        {
          context,
          message: "Help me plan tomorrow",
          coachMode: "chat",
          history: [{ role: "user", content: "I have 30 minutes" }],
          today: "2026-09-22",
        },
      );
      expect(result.reply).toBe("Here is your answer.");
      expect(requestOpenAiJson).toHaveBeenCalledTimes(1);
      expect(prepareWithJev).toHaveBeenCalledTimes(1);
    });
  }

  for (const coachMode of ["chef", "personal_trainer"] as const) {
    test(`${coachMode} also goes through Jev first`, async () => {
      const user = convexTest(schema, modules).withIdentity({
        tokenIdentifier: `test|jev-${coachMode}`,
      });
      await user.mutation(api.ai.usage.setSharingConsent, {
        granted: true,
        version: AI_SHARING_VERSION,
      });
      vi.mocked(prepareWithJev).mockResolvedValue(prepared);
      vi.mocked(requestOpenAiJson).mockResolvedValue(reply);
      await user.action(api.ai.metricGeneration.generateCoachChatMessage, {
        context,
        message: "Help me plan tomorrow",
        coachMode,
        history: [],
        today: "2026-09-22",
      });
      expect(prepareWithJev).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ coachMode }),
      );
      expect(requestOpenAiJson).toHaveBeenCalledTimes(1);
    });
  }

  test("publishes a user-scoped preview before Luna finishes and expires it", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|jev-preview" });
    const other = t.withIdentity({ tokenIdentifier: "test|jev-other" });
    await user.mutation(api.ai.usage.setSharingConsent, {
      granted: true,
      version: AI_SHARING_VERSION,
    });
    vi.mocked(prepareWithJev).mockResolvedValue(prepared);
    let release!: (value: string) => void;
    let started!: () => void;
    const lunaStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(requestOpenAiJson).mockImplementation(async () => {
      started();
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    });
    const result = user.action(
      api.ai.metricGeneration.generateCoachChatMessage,
      {
        context,
        message: "Show my protein target",
        coachMode: "chat",
        history: [],
        today: "2026-09-22",
        requestId: "preview-1",
      },
    );
    await Promise.race([
      lunaStarted,
      result.then(() => {
        throw new Error("Luna was never started");
      }),
    ]);
    try {
      expect(
        await user.query(api.ai.coachPreparations.get, {
          requestId: "preview-1",
        }),
      ).toEqual(prepared);
      expect(
        await user.query(api.ai.coachPreparations.get, {
          requestId: "another-turn",
        }),
      ).toBeNull();
      expect(
        await other.query(api.ai.coachPreparations.get, {
          requestId: "preview-1",
        }),
      ).toBeNull();
      expect(
        await t.query(api.ai.coachPreparations.get, { requestId: "preview-1" }),
      ).toBeNull();
    } finally {
      release(reply);
      await result;
    }
    await t.run(async (ctx) => {
      const row = await ctx.db.query("coachPreparations").first();
      await ctx.db.patch("coachPreparations", row!._id, {
        expiresAt: Date.now() - 1,
      });
    });
    expect(
      await user.query(api.ai.coachPreparations.get, {
        requestId: "preview-1",
      }),
    ).toBeNull();
    const id = await t.run(
      async (ctx) => (await ctx.db.query("coachPreparations").first())!._id,
    );
    await t.mutation(internal.ai.coachPreparations.remove, { id });
    expect(
      await t.run(async (ctx) => ctx.db.query("coachPreparations").collect()),
    ).toEqual([]);
  });

  test("prior recipient consent cannot send a request to Jev or Luna", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|jev-stale-consent";
    const user = t.withIdentity({ tokenIdentifier: userId });
    await user.mutation(api.ai.usage.setSharingConsent, {
      granted: true,
      version: AI_SHARING_VERSION,
    });
    await t.run(async (ctx) => {
      const preferences = await ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      await ctx.db.patch("userPreferences", preferences!._id, {
        aiSharingConsent: { granted: true, version: 2, updatedAt: Date.now() },
      });
    });
    await expect(
      user.action(api.ai.metricGeneration.generateCoachChatMessage, {
        context,
        message: "Help me plan tomorrow",
        coachMode: "chat",
        history: [],
        today: "2026-09-22",
      }),
    ).rejects.toThrow("Allow AI data sharing");
    expect(prepareWithJev).not.toHaveBeenCalled();
    expect(requestOpenAiJson).not.toHaveBeenCalled();
  });
});
