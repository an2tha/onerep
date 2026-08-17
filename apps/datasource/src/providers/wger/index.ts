import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { readMeta } from "../../core/meta.ts";
import type {
  BuildContext,
  BuildSummary,
  ExerciseProvider,
  Ranked,
} from "../../core/provider.ts";
import { LiveStore, livePath } from "../../core/store.ts";
import { relevance, toMatchExpression } from "../../core/text.ts";
import type { Exercise } from "../../core/types.ts";
import { build } from "./import.ts";
import { toExercise } from "./normalize.ts";
import { exerciseImages, exercises, exerciseVideos, schema } from "./schema.ts";

const SEARCH_SQL = `
SELECT rowid AS id, bm25(exercises_fts) AS score
FROM exercises_fts
WHERE exercises_fts MATCH :match
ORDER BY score ASC
LIMIT :limit
`;

export class WgerProvider implements ExerciseProvider {
  readonly id = "wger";
  readonly kind = "exercise" as const;
  readonly attribution = "wger (CC-BY-SA 4.0)";
  readonly buildFlags = [];

  private readonly store: LiveStore<typeof schema>;

  constructor(dataDir: string) {
    this.store = new LiveStore(livePath(dataDir, "wger"), schema);
  }

  build(context: BuildContext): Promise<BuildSummary> {
    return build(context);
  }

  stats(): { imported: boolean } & Record<string, unknown> {
    const db = this.store.get();
    if (!db) return { imported: false };
    return { imported: true, ...readMeta(db) };
  }

  close(): void {
    this.store.close();
  }

  search(query: string, limit: number): Ranked<Exercise>[] {
    const db = this.store.get();
    const raw = this.store.rawHandle();
    const match = toMatchExpression(query);
    if (!db || !raw || !match) return [];

    const ranked = raw.query(SEARCH_SQL).all({ ":match": match, ":limit": limit }) as {
      id: number;
      score: number;
    }[];
    if (ranked.length === 0) return [];

    const ids = ranked.map((row) => row.id);
    const rows = new Map(
      db.select().from(exercises).where(inArray(exercises.id, ids)).all().map((r) => [r.id, r]),
    );
    const media = this.mediaFor(ids);

    // The `IN` lookup loses the ranking, so order is restored from the FTS pass.
    return ranked.flatMap(({ id, score }) => {
      const row = rows.get(id);
      if (!row) return [];
      const attached = media.get(id);
      return [
        {
          item: toExercise(row, attached?.images ?? [], attached?.videos ?? []),
          score: relevance(score),
        },
      ];
    });
  }

  byId(id: string): Exercise | null {
    const db = this.store.get();
    if (!db) return null;

    const numeric = Number.parseInt(id, 10);
    // wger exposes both a numeric id and a stable uuid; accept either.
    const row = db
      .select()
      .from(exercises)
      .where(
        Number.isFinite(numeric) ? or(eq(exercises.id, numeric), eq(exercises.uuid, id)) : eq(exercises.uuid, id),
      )
      .get();
    if (!row) return null;

    const media = this.mediaFor([row.id]).get(row.id);
    return toExercise(row, media?.images ?? [], media?.videos ?? []);
  }

  /**
   * Images and videos for a whole result page in two queries, rather than two
   * per exercise.
   */
  private mediaFor(ids: number[]) {
    const db = this.store.get();
    const media = new Map<
      number,
      { images: (typeof exerciseImages.$inferSelect)[]; videos: string[] }
    >();
    if (!db || ids.length === 0) return media;

    const entry = (id: number) => {
      const existing = media.get(id);
      if (existing) return existing;
      const created = { images: [], videos: [] as string[] };
      media.set(id, created);
      return created;
    };

    for (const image of db
      .select()
      .from(exerciseImages)
      .where(inArray(exerciseImages.exerciseId, ids))
      .orderBy(desc(exerciseImages.isMain))
      .all()) {
      entry(image.exerciseId).images.push(image);
    }
    for (const video of db
      .select()
      .from(exerciseVideos)
      .where(inArray(exerciseVideos.exerciseId, ids))
      .all()) {
      entry(video.exerciseId).videos.push(video.url);
    }
    return media;
  }
}
