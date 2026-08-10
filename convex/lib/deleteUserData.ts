import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";
import type { TableNamesInDataModel } from "convex/server";

type DeleteCtx = GenericMutationCtx<DataModel>;

async function deleteFromUserIndex(
  ctx: DeleteCtx,
  table: TableNamesInDataModel<DataModel>,
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
    // Storage deletion is allowed only after reaching the blob through an
    // ownership row selected by the authenticated user's index.
    if (
      (table === "fileUploads" || table === "coachUploads") &&
      doc.storageId
    ) {
      await ctx.storage.delete(doc.storageId);
    }
    await ctx.db.delete(doc._id);
  }

  return {
    deleted: docs.length,
    mayHaveMore: docs.length === batchSize,
  };
}

async function deleteOwnedRecipes(
  ctx: DeleteCtx,
  userId: string,
  limit: number,
) {
  const recipes = await ctx.db
    .query("recipes")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(1);
  const recipe = recipes[0];
  if (!recipe) return { deleted: 0, mayHaveMore: false };

  const ratings = await ctx.db
    .query("recipeRatings")
    .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
    .take(limit);
  if (ratings.length > 0) {
    for (const child of ratings) await ctx.db.delete(child._id);
    return { deleted: ratings.length, mayHaveMore: true };
  }
  const reports = await ctx.db
    .query("recipeReports")
    .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
    .take(limit);
  if (reports.length > 0) {
    for (const child of reports) await ctx.db.delete(child._id);
    return { deleted: reports.length, mayHaveMore: true };
  }
  const shares = await ctx.db
    .query("recipeCommunityShareEvents")
    .withIndex("by_userId_sharedAt", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("recipeId"), recipe._id))
    .take(limit);
  if (shares.length > 0) {
    for (const child of shares) await ctx.db.delete(child._id);
    return { deleted: shares.length, mayHaveMore: true };
  }
  await ctx.db.delete(recipe._id);
  return { deleted: 1, mayHaveMore: true };
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
    // Owned files first. No feature record can cause deletion by raw ID.
    ["fileUploads", "by_userId"],
    ["coachUploads", "by_userId"],
    // Child records before their parent content.
    ["formCoachPins", "by_userId"],
    ["formCoachReports", "by_userId"],
    ["formCoachSessions", "by_userId"],
    ["dashboardWidgets", "by_userId"],
    ["customProgressMetricEntries", "by_userId_and_metricId"],
    ["customProgressMetrics", "by_userId"],
    ["recipeRatings", "by_userId_recipeId"],
    ["recipeReports", "by_reporterId_recipeId", "reporterId"],
    ["recipeCommunityShareEvents", "by_userId_sharedAt"],
    // Sharing: the account is both an owner and possibly an invitee, and the
    // comments they wrote on other people's diaries must go too.
    ["diaryComments", "by_authorUserId", "authorUserId"],
    ["diaryComments", "by_ownerUserId_and_createdAt", "ownerUserId"],
    ["diaryCommentReads", "by_userId_and_ownerUserId", "userId"],
    ["diaryShares", "by_inviteeUserId_and_status", "inviteeUserId"],
    ["diaryShares", "by_ownerUserId", "ownerUserId"],
    // Health, nutrition, training, Coach, and onboarding state.
    ["healthWorkouts", "by_userId_and_externalId"],
    ["healthMetrics", "by_userId"],
    ["healthProfiles", "by_userId"],
    ["bodyMeasurements", "by_userId"],
    ["dailyCheckIns", "by_userId"],
    ["momentEvents", "by_userId"],
    ["restDays", "by_userId"],
    ["weeklyTargets", "by_userId"],
    ["mcpTokens", "by_userId"],
    ["mcpAuthCodes", "by_userId"],
    ["mcpRefreshTokens", "by_userId"],
    ["mcpOauthClients", "by_createdByUserId", "createdByUserId"],
    ["foodLogs", "by_userId_date"],
    ["waterLogs", "by_userId_date"],
    ["supplementLogs", "by_userId_date"],
    ["supplementItems", "by_userId"],
    ["supplementIntakeLogs", "by_userId_and_date"],
    ["customFoods", "by_userId"],
    ["mealPresets", "by_userId"],
    ["mealPrepBatches", "by_userId"],
    ["fastingSessions", "by_userId"],
    ["groceryLists", "by_userId"],
    ["workoutLogs", "by_userId_date"],
    ["presets", "by_userId"],
    ["schedules", "by_userId"],
    ["activeWorkouts", "by_userId"],
    ["exercises", "by_userId"],
    ["customExercises", "by_userId"],
    ["coachMemories", "by_userId"],
    ["coachCheckIns", "by_userId"],
    ["coachActionEvents", "by_userId"],
    ["coachOperationRuns", "by_userId"],
    ["coachWeeklyPlans", "by_userId"],
    ["coachMonthlySummaries", "by_userId"],
    ["coachReviews", "by_userId"],
    ["coachTouches", "by_userId"],
    // The device rows go with the account: a token left behind is a phone that
    // keeps getting coached for someone who deleted themselves.
    ["pushTokens", "by_userId"],
    ["coachGoalTasks", "by_userId"],
    ["coachGoals", "by_userId"],
    ["walkthroughProgress", "by_userId"],
    ["onboardingProfiles", "by_userId"],
    ["userPreferences", "by_userId"],
    ["aiUsage", "by_userId_month"],
    ["rateLimitBuckets", "by_userId"],
    ["snapUsage", "by_userId_date"],
    // Local billing mirrors and application identities are removed. The
    // platform/audit event ledger follows the existing legal retention policy.
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

  if (budget > 0) {
    const result = await deleteOwnedRecipes(ctx, userId, Math.min(10, budget));
    deleted += result.deleted;
    budget -= result.deleted;
    if (result.mayHaveMore) remaining = true;
  } else {
    remaining = true;
  }

  return { deleted, remaining };
}
