import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type DeleteCtx = GenericMutationCtx<DataModel>;

async function deleteFromUserIndex(
  ctx: DeleteCtx,
  table: string,
  userId: string,
  batchSize: number,
  indexName = "by_userId",
) {
  const docs = await (ctx.db.query as any)(table)
    .withIndex(indexName, (q: any) => q.eq("userId", userId))
    .take(batchSize);

  for (const doc of docs) {
    if (table === "bodyMeasurements" && doc.photoStorageId) {
      await ctx.storage.delete(doc.photoStorageId);
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
 * invoking Clerk account deletion.
 */
export async function deleteUserDataBatch(
  ctx: DeleteCtx,
  userId: string,
  batchSize = 100,
) {
  const tableSpecs = [
    ["userPreferences", "by_userId"],
    ["recipes", "by_userId"],
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
    ["aiUsage", "by_userId_month"],
    ["snapUsage", "by_userId_date"],
    ["activeWorkouts", "by_userId"],
    ["exercises", "by_userId"],
  ] as const;

  let budget = Math.max(1, Math.min(batchSize, 200));
  let deleted = 0;
  let remaining = false;

  for (const [table, indexName] of tableSpecs) {
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
    );
    deleted += result.deleted;
    budget -= result.deleted;
    if (result.mayHaveMore) remaining = true;
  }

  return { deleted, remaining };
}
