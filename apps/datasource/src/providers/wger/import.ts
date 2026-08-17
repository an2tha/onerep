import { sql } from "drizzle-orm";
import { writeMeta } from "../../core/meta.ts";
import type { BuildContext, BuildSummary } from "../../core/provider.ts";
import { createIndexes, openStaged, promote } from "../../core/store.ts";
import { exerciseImages, exercises, exerciseVideos, FTS_DDL, schema } from "./schema.ts";

const API_BASE = "https://wger.de/api/v2";
const ENGLISH = 2;
const PAGE_SIZE = 100;

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

export async function build(context: BuildContext): Promise<BuildSummary> {
  const { dataDir, log } = context;
  const staged = openStaged(dataDir, "wger", schema);

  try {
    const insertExercise = staged.db
      .insert(exercises)
      .values({
        id: sql.placeholder("id"),
        uuid: sql.placeholder("uuid"),
        name: sql.placeholder("name"),
        category: sql.placeholder("category"),
        description: sql.placeholder("description"),
        equipment: sql.placeholder("equipment"),
        primaryMuscles: sql.placeholder("primaryMuscles"),
        secondaryMuscles: sql.placeholder("secondaryMuscles"),
        license: sql.placeholder("license"),
        licenseAuthor: sql.placeholder("licenseAuthor"),
        lastUpdate: sql.placeholder("lastUpdate"),
      })
      .onConflictDoNothing()
      .prepare();
    const insertImage = staged.db
      .insert(exerciseImages)
      .values({
        exerciseId: sql.placeholder("exerciseId"),
        url: sql.placeholder("url"),
        thumbnailUrl: sql.placeholder("thumbnailUrl"),
        isMain: sql.placeholder("isMain"),
        isAi: sql.placeholder("isAi"),
        licenseAuthor: sql.placeholder("licenseAuthor"),
      })
      .prepare();
    const insertVideo = staged.db
      .insert(exerciseVideos)
      .values({ exerciseId: sql.placeholder("exerciseId"), url: sql.placeholder("url") })
      .prepare();

    let url: string | null = `${API_BASE}/exerciseinfo/?limit=${PAGE_SIZE}&format=json`;
    let count = 0;
    let images = 0;
    let videos = 0;
    let skipped = 0;

    staged.raw.exec("BEGIN");
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

        insertExercise.run({
          id,
          uuid: text(entry.uuid) ?? String(id),
          name,
          category: text(record(entry.category).name),
          description: stripHtml(translation?.description),
          equipment: JSON.stringify(
            list(entry.equipment)
              .map((item) => text(item.name))
              .filter(Boolean),
          ),
          primaryMuscles: JSON.stringify(muscleNames(entry.muscles)),
          secondaryMuscles: JSON.stringify(muscleNames(entry.muscles_secondary)),
          license: text(record(entry.license).short_name),
          licenseAuthor: text(entry.license_author),
          lastUpdate: text(entry.last_update_global) ?? text(entry.last_update),
        });
        count += 1;

        for (const image of list(entry.images)) {
          const imageUrl = text(image.image);
          if (!imageUrl) continue;
          const thumbnails = record(image.thumbnails);
          insertImage.run({
            exerciseId: id,
            url: imageUrl,
            thumbnailUrl: text(thumbnails.medium) ?? text(thumbnails.small),
            isMain: image.is_main ? 1 : 0,
            isAi: image.is_ai_generated ? 1 : 0,
            licenseAuthor: text(image.license_author),
          });
          images += 1;
        }

        for (const video of list(entry.videos)) {
          const videoUrl = text(video.video);
          if (!videoUrl) continue;
          insertVideo.run({ exerciseId: id, url: videoUrl });
          videos += 1;
        }
      }

      url = text(page.next);
      log(`exercises: ${count}`);
    }
    staged.raw.exec("COMMIT");

    if (count === 0) throw new Error("wger returned no usable exercises");
    if (skipped > 0) log(`skipped ${skipped} exercises without an English name`);

    createIndexes(staged, schema);
    staged.raw.exec(FTS_DDL);

    // Counted from the table rather than the loop: pagination can hand back an
    // exercise twice if the upstream catalog shifts mid-crawl, and the metadata
    // should describe what actually landed.
    const stored =
      staged.db.select({ n: sql<number>`count(*)` }).from(exercises).get()?.n ?? 0;

    writeMeta(staged.db, {
      exercises: stored,
      images,
      videos,
      imported_at: new Date().toISOString(),
    });
    staged.raw.close();

    promote(dataDir, "wger", stored);
    log(`promoted wger database with ${stored} exercises and ${images} images`);
    return { primary: stored, counts: { exercises: stored, images, videos } };
  } catch (error) {
    staged.raw.close();
    throw error;
  }
}
