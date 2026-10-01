import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { AI_SHARING_VERSION } from "../lib/aiSharing";
vi.mock("../ai/provider", () => ({ hasOpenAiApiKey: () => true, requestOpenAiJson: vi.fn() }));
import { requestOpenAiJson } from "../ai/provider";
const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.resetAllMocks());
for (const kind of ["photo", "text"] as const) {
  test(`${kind} retries once and refunds only the failed request`, async () => {
    const t = convexTest(schema, modules);
    const userId = `test|snap-refund-${kind}`;
    const user = t.withIdentity({ tokenIdentifier: userId });
    await user.mutation(api.ai.usage.setSharingConsent, { granted: true, version: AI_SHARING_VERSION });
    await t.mutation(internal.ai.usage.consumeMonthlyQuota, { userId, source: "food_snap" });
    vi.mocked(requestOpenAiJson).mockRejectedValue(new Error("Provider unavailable"));
    const response = kind === "photo"
      ? user.action(api.logs.snap.snap, { base64Image: "aGVsbG8=", mimeType: "image/jpeg" })
      : user.action(api.logs.snap.describeText, { text: "oats and yogurt" });
    await expect(response).rejects.toThrow("Provider unavailable");
    expect(requestOpenAiJson).toHaveBeenCalledTimes(2);
    expect(await user.query(api.ai.usage.getMonthlyUsage, {})).toMatchObject({ count: 1 });
  });
}
