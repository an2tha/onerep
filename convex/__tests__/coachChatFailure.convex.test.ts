import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { AI_SHARING_VERSION } from "../lib/aiSharing";

vi.mock("../ai/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/provider")>()),
  hasOpenAiApiKey: vi.fn(() => true),
  requestOpenAiJson: vi.fn(),
}));
import { hasOpenAiApiKey, requestOpenAiJson } from "../ai/provider";

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

afterEach(() => vi.clearAllMocks());

describe("Coach chat provider failures", () => {
  for (const failure of ["missing key", "exception", "empty reply"] as const) {
    test(`reports ${failure} instead of answering with personalized templates`, async () => {
      vi.mocked(hasOpenAiApiKey).mockReturnValue(failure !== "missing key");
      if (failure === "exception") {
        vi.mocked(requestOpenAiJson).mockRejectedValue(
          new Error("Provider unavailable"),
        );
      } else {
        vi.mocked(requestOpenAiJson).mockResolvedValue(null);
      }
      const t = convexTest(schema, modules);
      const user = t.withIdentity({
        tokenIdentifier: `test|coach-failure-${failure}`,
      });
      await user.mutation(api.ai.usage.setSharingConsent, {
        granted: true,
        version: AI_SHARING_VERSION,
      });
      await expect(
        user.action(api.ai.metricGeneration.generateCoachChatMessage, {
          context,
          message: "I had white sauce snack",
          coachMode: "chef",
          history: [],
          today: "2026-09-17",
        }),
      ).rejects.toThrow("Coach couldn’t answer your message right now");
    });
  }
});
