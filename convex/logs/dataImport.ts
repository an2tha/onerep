import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";
import { hasOpenAiApiKey, runOpenAiAgent } from "../ai/provider";
import { renderSystemPrompt } from "../ai/prompts.generated";
import { consumeAiUsageOrThrow } from "../ai/usage";
import { getAuthUser } from "../lib/auth";
import { claimRateLimit } from "../lib/rateLimits";
import { findFreeWorkoutSlot, upsertWorkoutLog } from "../lib/workoutLogs";
import { completedExerciseValidator } from "../lib/workoutValidators";
import {
  IMPORT_MAX_FILES,
  IMPORT_MAX_TOTAL_BYTES,
  IMPORT_MAX_WORKOUTS,
  IMPORT_MAX_MEASUREMENTS,
  applyImportPlan,
  buildPlanRequest,
  extractRecords,
  fallbackPlan,
  headersOf,
  importPlanSchema,
  summarizeApplication,
  type ImportApplication,
  type ImportFileSummary,
  type ImportPlan,
  type ImportedMeasurement,
  type ImportedWorkout,
} from "../lib/dataImport";

/**
 * The onboarding "import your existing data" pipeline.
 *
 * Someone arrives with years of history held hostage in another app's export
 * format. `preview` reads their files, asks the model for a column mapping (a
 * few hundred tokens — never the file), applies that mapping in code, and
 * shows what would be written. `commit` re-applies the same mapping and writes
 * it, in batches, idempotently. Nothing is saved that the user has not seen
 * counted first — the same contract every agent in this codebase honours.
 */

const WORKOUT_BATCH = 40;
const MEASUREMENT_BATCH = 100;
/** Catalog lookups are one query per distinct name; cap what one file can cost. */
const MAX_EXERCISE_LOOKUPS = 100;

type LoadedFile = {
  uploadId: Id<"fileUploads">;
  fileName: string;
  records: Record<string, string>[];
};

export const resolveImportUpload = internalQuery({
  args: { userId: v.string(), uploadId: v.id("fileUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (
      !upload ||
      upload.userId !== args.userId ||
      upload.purpose !== "data_import" ||
      upload.status !== "ready" ||
      upload.expiresAt <= Date.now() ||
      !upload.storageId
    ) {
      return null;
    }
    return {
      storageId: upload.storageId,
      fileName: upload.fileName ?? "upload",
      mimeType: upload.actualMimeType ?? "",
      size: upload.actualSize ?? 0,
    };
  },
});

export const claimImportRun = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await claimRateLimit(ctx, args.userId, "data_import", 10, 60 * 60 * 1000);
    return null;
  },
});

async function loadFiles(
  ctx: ActionCtx,
  userId: string,
  uploadIds: Id<"fileUploads">[],
): Promise<LoadedFile[]> {
  if (uploadIds.length === 0) throw new Error("No files to import");
  if (uploadIds.length > IMPORT_MAX_FILES) {
    throw new Error(`At most ${IMPORT_MAX_FILES} files per import`);
  }
  if (new Set(uploadIds.map(String)).size !== uploadIds.length) {
    throw new Error("Duplicate files in the import");
  }

  const files: LoadedFile[] = [];
  let totalBytes = 0;
  for (const uploadId of uploadIds) {
    const resolved: {
      storageId: Id<"_storage">;
      fileName: string;
      mimeType: string;
      size: number;
    } | null = await ctx.runQuery(
      internal.logs.dataImport.resolveImportUpload,
      { userId, uploadId },
    );
    if (!resolved) throw new Error("Upload not found or access denied");
    totalBytes += resolved.size;
    if (totalBytes > IMPORT_MAX_TOTAL_BYTES) {
      throw new Error("Imports are capped at 5 MB of files in total");
    }
    const blob = await ctx.storage.get(resolved.storageId);
    if (!blob) throw new Error("An uploaded file could not be read");
    files.push({
      uploadId,
      fileName: resolved.fileName,
      records: extractRecords(
        await blob.text(),
        resolved.mimeType,
        resolved.fileName,
      ),
    });
  }
  return files;
}

async function planWithModel(
  file: LoadedFile,
  apiKey: string | null,
): Promise<ImportPlan> {
  const result = await runOpenAiAgent({
    apiKey,
    system: renderSystemPrompt("data_import", {}),
    user: buildPlanRequest(file.fileName, file.records),
    tools: {},
    schema: importPlanSchema,
    maxSteps: 1,
    maxTokens: 900,
  });
  return result.output;
}

export type ImportPreviewFile = ImportFileSummary & {
  uploadId: Id<"fileUploads">;
  fileName: string;
  /** Echoed back verbatim to `commit`, so the write applies exactly the
   * mapping the preview counted — no second model call, no drift. */
  plan: ImportPlan;
};

export type ImportPreview = {
  files: ImportPreviewFile[];
  totals: { workouts: number; measurements: number; skippedRows: number };
};

export const preview = action({
  args: { uploadIds: v.array(v.id("fileUploads")) },
  handler: async (ctx, args): Promise<ImportPreview> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.runMutation(internal.logs.dataImport.claimImportRun, {
      userId: user._id,
    });

    const files = await loadFiles(ctx, user._id, args.uploadIds);

    // One credit spend covers every file in the batch — it is one import to
    // the user, however many exports the other app made them download.
    const userKey: string | null = await ctx.runQuery(
      internal.ai.byok.getKeyForUser,
      { userId: user._id },
    );
    const useModel = hasOpenAiApiKey(userKey);
    let apiKey: string | null = null;
    if (useModel) {
      const quota = await consumeAiUsageOrThrow(ctx, user._id, "data_import");
      apiKey = quota.apiKey;
    }

    const previews: ImportPreviewFile[] = [];
    const totals = { workouts: 0, measurements: 0, skippedRows: 0 };
    for (const file of files) {
      let plan: ImportPlan;
      if (file.records.length === 0) {
        plan = {
          kind: "unsupported",
          note: "The file was empty, or not something I could parse.",
          columns: {},
        };
      } else if (useModel) {
        try {
          plan = await planWithModel(file, apiKey);
        } catch (error) {
          console.warn("Falling back to header-based import plan", error);
          plan = fallbackPlan(headersOf(file.records));
        }
      } else {
        plan = fallbackPlan(headersOf(file.records));
      }

      const application = applyImportPlan(file.records, plan);
      const summary = summarizeApplication(plan, application);
      totals.workouts += summary.workouts;
      totals.measurements += summary.measurements;
      totals.skippedRows += summary.skippedRows;
      previews.push({
        ...summary,
        uploadId: file.uploadId,
        fileName: file.fileName,
        plan,
      });
    }

    return { files: previews, totals };
  },
});

export const commit = action({
  args: {
    files: v.array(
      v.object({ uploadId: v.id("fileUploads"), plan: v.any() }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ workouts: number; workoutsSkipped: number; measurements: number }> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.runMutation(internal.logs.dataImport.claimImportRun, {
      userId: user._id,
    });

    const plans = new Map<string, ImportPlan>();
    for (const file of args.files) {
      const parsed = importPlanSchema.safeParse(file.plan);
      if (!parsed.success) throw new Error("The import plan is not valid");
      plans.set(String(file.uploadId), parsed.data);
    }

    const files = await loadFiles(
      ctx,
      user._id,
      args.files.map((file) => file.uploadId),
    );

    const workouts: ImportedWorkout[] = [];
    const measurements: ImportedMeasurement[] = [];
    for (const file of files) {
      const plan = plans.get(String(file.uploadId))!;
      const application: ImportApplication = applyImportPlan(
        file.records,
        plan,
      );
      workouts.push(...application.workouts);
      measurements.push(...application.measurements);
    }
    workouts.splice(IMPORT_MAX_WORKOUTS);
    measurements.splice(IMPORT_MAX_MEASUREMENTS);
    if (workouts.length === 0 && measurements.length === 0) {
      throw new Error("There is nothing in these files I can import");
    }

    // Swap the placeholder exercise ids for catalog ids where an exact name
    // match exists, so imported history joins the same per-exercise charts as
    // everything logged in the app. Anything unmatched keeps its `import:` id:
    // still grouped with itself, honestly outside the catalog.
    const idsByName = new Map<string, string>();
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        const key = exercise.name.trim().toLowerCase();
        if (idsByName.has(key) || idsByName.size >= MAX_EXERCISE_LOOKUPS) {
          continue;
        }
        const matches = await ctx.runQuery(api.exercises.search, {
          query: exercise.name,
          limit: 3,
        });
        const exact = matches.find(
          (item: { id: string; name: string }) =>
            item.name.trim().toLowerCase() === key,
        );
        idsByName.set(key, exact ? exact.id : exercise.id);
      }
    }
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        exercise.id =
          idsByName.get(exercise.name.trim().toLowerCase()) ?? exercise.id;
      }
    }

    let imported = 0;
    let skipped = 0;
    for (let start = 0; start < workouts.length; start += WORKOUT_BATCH) {
      const result: { imported: number; skipped: number } =
        await ctx.runMutation(internal.logs.dataImport.commitWorkouts, {
          userId: user._id,
          workouts: workouts.slice(start, start + WORKOUT_BATCH),
        });
      imported += result.imported;
      skipped += result.skipped;
    }

    let importedMeasurements = 0;
    for (
      let start = 0;
      start < measurements.length;
      start += MEASUREMENT_BATCH
    ) {
      const result: { imported: number } = await ctx.runMutation(
        internal.logs.dataImport.commitMeasurements,
        {
          userId: user._id,
          measurements: measurements.slice(start, start + MEASUREMENT_BATCH),
        },
      );
      importedMeasurements += result.imported;
    }

    // The blobs have served their purpose; reclaim the upload quota now
    // rather than waiting a day for the janitor. Best effort only — a failed
    // discard costs nothing but patience.
    for (const file of args.files) {
      try {
        await ctx.runMutation(api.uploads.discard, {
          uploadId: file.uploadId,
        });
      } catch {
        // The 24h TTL sweep will get it.
      }
    }

    return {
      workouts: imported,
      workoutsSkipped: skipped,
      measurements: importedMeasurements,
    };
  },
});

export const commitWorkouts = internalMutation({
  args: {
    userId: v.string(),
    workouts: v.array(
      v.object({
        date: v.string(),
        sessionId: v.string(),
        exercises: v.array(completedExerciseValidator),
        durationSeconds: v.number(),
        completedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let imported = 0;
    let skipped = 0;
    for (const workout of args.workouts) {
      // A day already holding two hand-logged sessions keeps them; the import
      // never displaces something the user wrote. Re-importing the same file
      // lands on its own sessionId and is an update, not a duplicate.
      const slot = await findFreeWorkoutSlot(
        ctx,
        args.userId,
        workout.date,
        workout.sessionId,
      );
      if (slot === null) {
        skipped += 1;
        continue;
      }
      await upsertWorkoutLog(ctx, args.userId, {
        date: workout.date,
        sessionId: workout.sessionId,
        slot,
        exercises: workout.exercises,
        durationSeconds: workout.durationSeconds,
        completedAt: workout.completedAt,
      });
      imported += 1;
    }
    return { imported, skipped };
  },
});

export const commitMeasurements = internalMutation({
  args: {
    userId: v.string(),
    measurements: v.array(
      v.object({
        clientId: v.string(),
        loggedAt: v.string(),
        weightKg: v.optional(v.number()),
        bodyFatPct: v.optional(v.number()),
        waistCm: v.optional(v.number()),
        hipsCm: v.optional(v.number()),
        chestCm: v.optional(v.number()),
        armsCm: v.optional(v.number()),
        thighsCm: v.optional(v.number()),
        calvesCm: v.optional(v.number()),
        neckCm: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let imported = 0;
    for (const measurement of args.measurements) {
      const { clientId, loggedAt, ...fields } = measurement;
      const existing = await ctx.db
        .query("bodyMeasurements")
        .withIndex("by_userId_clientId", (q) =>
          q.eq("userId", args.userId).eq("clientId", clientId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          loggedAt,
          ...fields,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("bodyMeasurements", {
          userId: args.userId,
          clientId,
          loggedAt,
          ...fields,
          createdAt: now,
          updatedAt: now,
        });
      }
      imported += 1;
    }
    return { imported };
  },
});
