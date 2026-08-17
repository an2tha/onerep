import type { Exercise, ExerciseImage } from "../../core/types.ts";
import type { exerciseImages, exercises } from "./schema.ts";

export type ExerciseRow = typeof exercises.$inferSelect;
export type ImageRow = typeof exerciseImages.$inferSelect;

/**
 * The list columns are stored as JSON text. A row written by an older import
 * could in principle hold anything, so parsing is defensive: a malformed value
 * costs an exercise its equipment list, not the whole request.
 */
function stringList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toImage(row: ImageRow): ExerciseImage {
  return {
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    isMain: row.isMain === 1,
    isAiGenerated: row.isAi === 1,
    licenseAuthor: row.licenseAuthor,
  };
}

export function toExercise(row: ExerciseRow, images: ImageRow[], videos: string[]): Exercise {
  return {
    id: `wger:${row.id}`,
    providerId: "wger",
    uuid: row.uuid,
    name: row.name,
    category: row.category,
    description: row.description,
    equipment: stringList(row.equipment),
    primaryMuscles: stringList(row.primaryMuscles),
    secondaryMuscles: stringList(row.secondaryMuscles),
    images: images.map(toImage),
    videos,
    // CC-BY-SA 4.0 requires these to be shown wherever the content appears.
    license: row.license,
    licenseAuthor: row.licenseAuthor,
  };
}
