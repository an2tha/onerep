import { openStaged, promote } from "./db.ts";
import type { ImportProgress } from "./usda.ts";

/**
 * wger's catalog is CC-BY-SA 4.0, so `license` and `license_author` are
 * imported alongside the content and must be surfaced wherever an image or
 * description is displayed.
 */
const API_BASE = "https://wger.de/api/v2";
const ENGLISH = 2;
const PAGE_SIZE = 100;

const SCHEMA = `
CREATE TABLE exercises (
  id                INTEGER PRIMARY KEY,
  uuid              TEXT NOT NULL,
  name              TEXT NOT NULL,
  category          TEXT,
  description       TEXT,
  equipment         TEXT NOT NULL,
  primary_muscles   TEXT NOT NULL,
  secondary_muscles TEXT NOT NULL,
  license           TEXT,
  license_author    TEXT,
  last_update       TEXT
);
CREATE TABLE exercise_images (
  exercise_id    INTEGER NOT NULL,
  url            TEXT NOT NULL,
  thumbnail_url  TEXT,
  is_main        INTEGER NOT NULL DEFAULT 0,
  is_ai          INTEGER NOT NULL DEFAULT 0,
  license_author TEXT
);
CREATE TABLE exercise_videos (
  exercise_id INTEGER NOT NULL,
  url         TEXT NOT NULL
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const INDEXES = `
CREATE INDEX exercise_images_exercise_id ON exercise_images (exercise_id);
CREATE INDEX exercise_videos_exercise_id ON exercise_videos (exercise_id);
CREATE VIRTUAL TABLE exercises_fts USING fts5(
  name, content='exercises', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO exercises_fts (rowid, name) SELECT id, name FROM exercises;
`;

type Json = Record<string, unknown>;

function record(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** wger stores descriptions as HTML; the app renders plain text. */
function stripHtml(html: unknown): string | null {
  const value = text(html);
  if (!value) return null;
  const plain = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return plain || null;
}

/** Prefers wger's plain-English muscle label over the anatomical Latin name. */
function muscleNames(values: unknown): string[] {
  return list(values)
    .map((muscle) => text(muscle.name_en) ?? text(muscle.name))
    .filter((name): name is string => name !== null);
}

async function fetchPage(url: string): Promise<Json> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`wger request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return record(await response.json());
}

export async function importWger(options: {
  dataDir: string;
  onProgress?: ImportProgress;
}): Promise<{ exercises: number; images: number }> {
  const log = options.onProgress ?? (() => {});
  const db = openStaged(options.dataDir, "wger");

  try {
    db.exec(SCHEMA);
    const insertExercise = db.query(
      `INSERT OR REPLACE INTO exercises
         (id, uuid, name, category, description, equipment,
          primary_muscles, secondary_muscles, license, license_author, last_update)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertImage = db.query(
      `INSERT INTO exercise_images (exercise_id, url, thumbnail_url, is_main, is_ai, license_author)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertVideo = db.query(
      "INSERT INTO exercise_videos (exercise_id, url) VALUES (?, ?)",
    );

    let url: string | null = `${API_BASE}/exerciseinfo/?limit=${PAGE_SIZE}&format=json`;
    let exercises = 0;
    let images = 0;
    let skipped = 0;

    db.exec("BEGIN");
    while (url) {
      const page = await fetchPage(url);
      for (const entry of list(page.results)) {
        const id = typeof entry.id === "number" ? entry.id : null;
        const translation = list(entry.translations).find(
          (item) => item.language === ENGLISH && text(item.name),
        );
        const name = text(translation?.name);
        // Records without an English name are unusable for this catalog.
        if (id === null || !name) {
          skipped += 1;
          continue;
        }

        insertExercise.run(
          id,
          text(entry.uuid) ?? String(id),
          name,
          text(record(entry.category).name),
          stripHtml(translation?.description),
          JSON.stringify(
            list(entry.equipment)
              .map((item) => text(item.name))
              .filter(Boolean),
          ),
          JSON.stringify(muscleNames(entry.muscles)),
          JSON.stringify(muscleNames(entry.muscles_secondary)),
          text(record(entry.license).short_name),
          text(entry.license_author),
          text(entry.last_update_global) ?? text(entry.last_update),
        );
        exercises += 1;

        for (const image of list(entry.images)) {
          const imageUrl = text(image.image);
          if (!imageUrl) continue;
          insertImage.run(
            id,
            imageUrl,
            text(record(image.thumbnails).medium) ?? text(record(image.thumbnails).small),
            image.is_main ? 1 : 0,
            image.is_ai_generated ? 1 : 0,
            text(image.license_author),
          );
          images += 1;
        }

        for (const video of list(entry.videos)) {
          const videoUrl = text(video.video);
          if (videoUrl) insertVideo.run(id, videoUrl);
        }
      }

      url = text(page.next);
      log(`exercises: ${exercises}`);
    }
    db.exec("COMMIT");

    if (exercises === 0) throw new Error("wger returned no usable exercises");
    if (skipped > 0) log(`skipped ${skipped} exercises without an English name`);

    db.exec(INDEXES);
    const meta = db.query("INSERT INTO meta (key, value) VALUES (?, ?)");
    meta.run("exercises", String(exercises));
    meta.run("images", String(images));
    meta.run("imported_at", new Date().toISOString());
    db.close();

    promote(options.dataDir, "wger", exercises);
    log(`promoted wger database with ${exercises} exercises and ${images} images`);
    return { exercises, images };
  } catch (error) {
    db.close();
    throw error;
  }
}
