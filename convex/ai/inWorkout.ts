/**
 * The coach between sets.
 *
 * A different animal from Coach chat: the person asking is mid-session with
 * ninety seconds of rest on the clock, so latency is the whole product. The
 * model is the same one chat uses — there is nothing cheaper to reach for —
 * so all the speed comes from the request being small: a deliberately thin
 * slice of context (the live session, the per-lift analysis, measured
 * recovery, safety flags), a tight token ceiling, and one sentence back. No
 * operations, no UI blocks, no history: a spotter, not a strategist.
 */

import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUser } from "../lib/auth";
import { hasOpenAiApiKey, requestOpenAiJson } from "./provider";
import { renderSystemPrompt } from "./prompts.generated";
import { consumeAiUsageOrThrow } from "./usage";
import {
  PROGRAMMING_WINDOW_DAYS,
  summarizeProgramming,
} from "../lib/programming";
import { listRecoveryWindow } from "../lib/healthMetrics";
import { summarizeRecovery } from "../lib/recovery";
import { getLatestOnboardingProfile } from "../lib/onboardingProfiles";

const MAX_QUESTION_CHARS = 300;
const MAX_REPLY_TOKENS = 220;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The thin context slice. Deliberately not `buildCoachWorkspace`: that is
 * nineteen queries and up to 60k characters in service of questions this
 * surface will never be asked. Speed here is worth more than breadth.
 */
export const loadContext = internalQuery({
  args: { userId: v.string(), today: v.string(), slot: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const since = new Date(`${args.today}T12:00:00Z`);
    since.setUTCDate(since.getUTCDate() - (PROGRAMMING_WINDOW_DAYS - 1));
    const programmingSince = since.toISOString().slice(0, 10);

    const [active, programmingLogs, recoveryRows, onboarding, preferences] =
      await Promise.all([
        ctx.db
          .query("activeWorkouts")
          .withIndex("by_userId_slot", (q) =>
            q
              .eq("userId", args.userId)
              .eq("slot", (args.slot === 2 ? 2 : 1) as 1 | 2),
          )
          .unique(),
        ctx.db
          .query("workoutLogs")
          .withIndex("by_userId_date", (q) =>
            q.eq("userId", args.userId).gte("date", programmingSince),
          )
          .order("desc")
          .take(200),
        listRecoveryWindow(ctx, args.userId, args.today),
        getLatestOnboardingProfile(ctx, args.userId),
        ctx.db
          .query("userPreferences")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .unique(),
      ]);

    const personalized =
      preferences?.privacySettings?.personalizedInsightsEnabled ?? true;
    const recovery = summarizeRecovery(recoveryRows, args.today);

    // The live session, projected to what a spotter can see: which exercises,
    // and each completed set's load and reps. `exerciseData` is v.any() with
    // per-set state keyed by exercise id.
    const exerciseData = isRecord(active?.exerciseData)
      ? active.exerciseData
      : {};
    const session = active
      ? {
          startedAt: active.startedAt,
          elapsedMinutes: Math.round(active.elapsedSeconds / 60),
          exercises: (Array.isArray(active.items) ? active.items : [])
            .flatMap((item) => {
              if (!isRecord(item)) return [];
              const ids =
                item.kind === "superset" && Array.isArray(item.exerciseIds)
                  ? item.exerciseIds
                  : [item.exerciseId];
              return ids.filter(
                (id): id is string => typeof id === "string",
              );
            })
            .slice(0, 12)
            .map((exerciseId) => {
              const state = exerciseData[exerciseId];
              const sets = isRecord(state) && Array.isArray(state.sets)
                ? state.sets
                : [];
              return {
                exerciseId,
                sets: sets
                  .filter((set) => isRecord(set))
                  .map((set) => ({
                    reps: (set as { reps?: unknown }).reps,
                    weight: (set as { weight?: unknown }).weight,
                    completed: (set as { completed?: unknown }).completed === true,
                  }))
                  .slice(0, 10),
              };
            }),
        }
      : null;

    return {
      session,
      programming: personalized
        ? summarizeProgramming(
            programmingLogs.map((log) => ({
              date: log.date,
              exercises: Array.isArray(log.exercises) ? log.exercises : [],
            })),
            args.today,
            PROGRAMMING_WINDOW_DAYS,
            recovery,
          )
        : null,
      recovery: personalized ? recovery : null,
      safety: {
        safetyFlags: onboarding?.safetyFlags ?? [],
        safetyMode: onboarding?.safetyMode ?? "standard",
        experienceLevel: onboarding?.experienceLevel ?? null,
      },
    };
  },
});

export const ask = action({
  args: {
    question: v.string(),
    today: v.string(),
    slot: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ reply: string; suggestion: string | null; source: string }> => {
    const user = await getAuthUser(ctx);
    const question = args.question.trim().slice(0, MAX_QUESTION_CHARS);
    if (question.length < 2) throw new Error("Ask a question.");
    if (!hasOpenAiApiKey()) {
      return {
        reply: "Coach is offline right now. Trust the plan you walked in with.",
        suggestion: null,
        source: "fallback",
      };
    }

    await consumeAiUsageOrThrow(ctx, user._id, "in_workout");

    const context = await ctx.runQuery(internal.ai.inWorkout.loadContext, {
      userId: user._id,
      today: args.today.slice(0, 10),
      slot: args.slot,
    });

    try {
      const content = await requestOpenAiJson({
        system: renderSystemPrompt("coach_in_workout"),
        user: JSON.stringify({ question, context }),
        maxTokens: MAX_REPLY_TOKENS,
      });
      const parsed = JSON.parse(content) as {
        reply?: unknown;
        suggestion?: unknown;
      };
      const reply =
        typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 220) : "";
      if (!reply) throw new Error("empty reply");
      return {
        reply,
        suggestion:
          typeof parsed.suggestion === "string" && parsed.suggestion.trim()
            ? parsed.suggestion.trim().slice(0, 160)
            : null,
        source: "openai",
      };
    } catch (error) {
      console.warn("In-workout coach failed", error);
      // The person is mid-set; an error dialog is worse than a plain answer.
      return {
        reply:
          "Couldn't reach your coach just now. Keep the load where it was and finish the plan.",
        suggestion: null,
        source: "fallback",
      };
    }
  },
});
