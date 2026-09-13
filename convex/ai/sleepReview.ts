import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUser } from "../lib/auth";
import { consumeAiUsageOrThrow } from "./usage";
import { hasOpenAiApiKey, requestOpenAiJson } from "./provider";

async function reviewSleep(
  ctx: ActionCtx,
  userId: string,
  date: string,
  automatic: boolean,
) {
  const data = await ctx.runQuery(internal.logs.sleep.context, {
    userId,
    date,
  });
  if (!data.sleep || (automatic && !data.preferences.automaticReview))
    return null;
  const id = await ctx.runMutation(internal.logs.sleep.claimReview, {
    userId,
    date,
    fingerprint: data.fingerprint,
    force: !automatic,
  });
  if (!id) return null;
  try {
    const userKey: string | null = await ctx.runQuery(
      internal.ai.byok.getKeyForUser,
      { userId },
    );
    if (!hasOpenAiApiKey(userKey))
      throw new Error(
        "AI is unavailable. Check your AI provider settings and retry.",
      );
    // A generated review is a metered model request of its own. Charging here,
    // immediately before inference, also makes failed provider attempts visible
    // in the user's allowance instead of presenting them as free AI calls.
    const quota = await consumeAiUsageOrThrow(ctx, userId, "sleep_review");
    const response = await requestOpenAiJson({
      apiKey: quota.apiKey,
      label: "sleep_review",
      maxTokens: 1100,
      system: `Review this person's sleep. Return JSON {"review": string}. Use four short paragraphs: What stands out; Pattern worth watching; One experiment tonight; What remains uncertain. Ground every number in supplied data. Distinguish measurements from hypotheses. Wearable stages and wellness scores are estimates, not diagnoses. Do not infer causes, caffeine use, illness, or mental stress from heart rate. Do not invent missing measurements. Account for strain and recovery without recommending maximal exercise. Reuse the deterministic tip unless evidence warrants another experiment. Do not repeat the previous review verbatim. Under 220 words.`,
      user: JSON.stringify({
        night: data.sleep,
        history: data.history,
        strain: data.strain,
        recovery: data.recovery,
        goals: data.goals,
        checkIns: data.checkIns,
        previousReview: data.review?.review ?? data.previousReview,
      }),
    });
    const parsed = JSON.parse(response) as { review?: unknown };
    if (typeof parsed.review !== "string" || !parsed.review.trim())
      throw new Error("Review was empty. Please retry.");
    await ctx.runMutation(internal.logs.sleep.finishReview, {
      id,
      fingerprint: data.fingerprint,
      review: parsed.review.trim().slice(0, 5000),
    });
  } catch (error) {
    await ctx.runMutation(internal.logs.sleep.finishReview, {
      id,
      fingerprint: data.fingerprint,
      error: "Sleep review is unavailable. Check AI access and try again.",
    });
    if (!automatic) throw error;
  }
  return null;
}
export const generate = action({
  args: { date: v.string() },
  handler: async (ctx, { date }): Promise<null> => {
    const user = await getAuthUser(ctx);
    return reviewSleep(ctx, user._id, date, false);
  },
});
export const automatic = internalAction({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, args): Promise<null> =>
    reviewSleep(ctx, args.userId, args.date, true),
});
