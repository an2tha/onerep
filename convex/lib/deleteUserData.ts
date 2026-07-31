import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type DeleteCtx = GenericMutationCtx<DataModel>;

async function deleteFromUserIndex(
  ctx: DeleteCtx,
  table: string,
  userId: string,
  batchSize: number,
  indexName = "by_userId",
  // Sharing tables key on ownerUserId / inviteeUserId rather than userId.
  field = "userId",
) {
  const docs = await (ctx.db.query as any)(table)
    .withIndex(indexName, (q: any) => q.eq(field, userId))
    .take(batchSize);

  for (const doc of docs) {
    if (table === "bodyMeasurements" && doc.photoStorageId) {
      await ctx.storage.delete(doc.photoStorageId);
    }
    if (table === "coachUploads" && doc.storageId) {
      await ctx.storage.delete(doc.storageId);
    }
    await ctx.db.delete(doc._id);
  }

  return {
    deleted: docs.length,
    mayHaveMore: docs.length === batchSize,
  };
}

/**
 * Delete a bounded batch of app-owned data for an authenticated user id.
 *
 * The auth component owns its own tables; this helper only removes OneRep app
 * data keyed by `userId`. Call repeatedly until `remaining` is false before
 * invoking Better Auth account deletion.
 */
export async function deleteUserDataBatch(
  ctx: DeleteCtx,
  userId: string,
  batchSize = 100,
) {
  const tableSpecs = [
    ["userPreferences", "by_userId"],
    ["recipes", "by_userId"],
    ["customFoods", "by_userId"],
    ["mealPrepBatches", "by_userId"],
    ["fastingSessions", "by_userId"],
    ["groceryLists", "by_userId"],
    // Sharing: the account is both an owner and possibly an invitee, and the
    // comments they wrote on other people's diaries must go too.
    ["diaryShares", "by_ownerUserId", "ownerUserId"],
    ["diaryShares", "by_inviteeUserId_and_status", "inviteeUserId"],
    ["diaryComments", "by_ownerUserId_and_createdAt", "ownerUserId"],
    ["diaryComments", "by_authorUserId", "authorUserId"],
    ["diaryCommentReads", "by_userId_and_ownerUserId", "userId"],
    ["recipeRatings", "by_userId_recipeId"],
    ["mealPresets", "by_userId"],
    ["onboardingProfiles", "by_userId"],
    ["healthProfiles", "by_userId"],
    ["presets", "by_userId"],
    ["schedules", "by_userId"],
    ["workoutLogs", "by_userId_date"],
    ["foodLogs", "by_userId_date"],
    ["waterLogs", "by_userId_date"],
    ["supplementLogs", "by_userId_date"],
    ["supplementItems", "by_userId"],
    ["supplementIntakeLogs", "by_userId_and_date"],
    ["bodyMeasurements", "by_userId"],
    ["dailyCheckIns", "by_userId"],
    ["coachMemories", "by_userId"],
    ["coachCheckIns", "by_userId"],
    ["coachActionEvents", "by_userId"],
    ["coachWeeklyPlans", "by_userId"],
    ["coachGoalTasks", "by_userId"],
    ["coachGoals", "by_userId"],
    ["coachUploads", "by_userId"],
    ["aiUsage", "by_userId_month"],
    ["snapUsage", "by_userId_date"],
    ["activeWorkouts", "by_userId"],
    ["exercises", "by_userId"],
    // Billing records. The store subscription itself lives with Apple, Google,
    // or Stripe and is unaffected; this only drops our local mirror of it.
    ["subscriptionStates", "by_userId"],
    ["billingSubscriptions", "by_userId"],
    ["billingCheckouts", "by_userId"],
    ["billingIdentities", "by_userId"],
  ] as const;

  let budget = Math.max(1, Math.min(batchSize, 200));
  let deleted = 0;
  let remaining = false;

  for (const [table, indexName, field] of tableSpecs) {
    if (budget <= 0) {
      remaining = true;
      break;
    }

    const limit = Math.min(25, budget);
    const result = await deleteFromUserIndex(
      ctx,
      table,
      userId,
      limit,
      indexName,
      field ?? "userId",
    );
    deleted += result.deleted;
    budget -= result.deleted;
    if (result.mayHaveMore) remaining = true;
  }

  return { deleted, remaining };
}
