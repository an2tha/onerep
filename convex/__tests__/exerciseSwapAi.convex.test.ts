import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
vi.mock("../ai/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/provider")>()),
  requestOpenAiJson: vi.fn(),
}));
import { requestOpenAiJson } from "../ai/provider";
const modules = import.meta.glob("../**/*.ts");
const args = {
  original: {
    id: "squat",
    name: "Squat",
    category: "strength",
    muscle: "Quads",
  },
  candidates: [
    { id: "lunge", name: "Lunge", category: "strength", muscle: "Quads" },
  ],
  reason: "Dumbbells available",
  sessionExercises: ["Squat"],
};
afterEach(() => vi.clearAllMocks());
test("failed or invented Coach recommendations refund their credit and successful retries cost one", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ tokenIdentifier: "test|swap-ai" });
  vi.mocked(requestOpenAiJson).mockRejectedValueOnce(
    new Error("Provider unavailable"),
  );
  await expect(
    user.action(api.ai.exerciseSwap.recommend, args),
  ).rejects.toThrow("Provider unavailable");
  expect(await user.query(api.ai.usage.getMonthlyUsage, {})).toMatchObject({
    count: 0,
  });
  vi.mocked(requestOpenAiJson).mockResolvedValueOnce(
    JSON.stringify({
      recommendations: [
        {
          exerciseId: "invented",
          explanation: "Try this",
          sets: 3,
          reps: "8",
          restSeconds: 90,
        },
      ],
    }),
  );
  await expect(
    user.action(api.ai.exerciseSwap.recommend, args),
  ).rejects.toThrow("invalid recommendation");
  expect(await user.query(api.ai.usage.getMonthlyUsage, {})).toMatchObject({
    count: 0,
  });
  vi.mocked(requestOpenAiJson).mockResolvedValueOnce(
    JSON.stringify({
      recommendations: [
        {
          exerciseId: "lunge",
          explanation: "Fits the available equipment and lower-body focus.",
          sets: 3,
          reps: "8",
          restSeconds: 90,
        },
      ],
    }),
  );
  expect(await user.action(api.ai.exerciseSwap.recommend, args)).toHaveLength(
    1,
  );
  expect(await user.query(api.ai.usage.getMonthlyUsage, {})).toMatchObject({
    count: 1,
  });
});
test("explicit AI opt-out prevents provider calls and charges", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ tokenIdentifier: "test|swap-private" });
  await user.mutation(api.ai.usage.setSharingConsent, {
    granted: false,
    version: 4,
  });
  await expect(
    user.action(api.ai.exerciseSwap.recommend, args),
  ).rejects.toThrow("Allow AI data sharing");
  expect(requestOpenAiJson).not.toHaveBeenCalled();
  expect(await user.query(api.ai.usage.getMonthlyUsage, {})).toMatchObject({
    count: 0,
  });
});
