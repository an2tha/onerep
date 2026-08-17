import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { meta } from "../../core/meta.ts";

/**
 * wger's catalog is CC-BY-SA 4.0, so `license` and `licenseAuthor` are imported
 * alongside the content and must be surfaced wherever an image or description
 * is displayed.
 */

export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey(),
  uuid: text("uuid").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  description: text("description"),
  // JSON arrays: SQLite has no array type and nothing joins against these.
  equipment: text("equipment").notNull(),
  primaryMuscles: text("primary_muscles").notNull(),
  secondaryMuscles: text("secondary_muscles").notNull(),
  license: text("license"),
  licenseAuthor: text("license_author"),
  lastUpdate: text("last_update"),
});

export const exerciseImages = sqliteTable(
  "exercise_images",
  {
    exerciseId: integer("exercise_id").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    isMain: integer("is_main").notNull().default(0),
    isAi: integer("is_ai").notNull().default(0),
    licenseAuthor: text("license_author"),
  },
  (table) => [index("exercise_images_exercise_id").on(table.exerciseId)],
);

export const exerciseVideos = sqliteTable(
  "exercise_videos",
  {
    exerciseId: integer("exercise_id").notNull(),
    url: text("url").notNull(),
  },
  (table) => [index("exercise_videos_exercise_id").on(table.exerciseId)],
);

export const schema = { exercises, exerciseImages, exerciseVideos, meta };
export type Schema = typeof schema;

export const FTS_DDL = `
CREATE VIRTUAL TABLE exercises_fts USING fts5(
  name, content='exercises', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO exercises_fts (rowid, name) SELECT id, name FROM exercises;
`;
