import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContext } from "../../core/provider.ts";
import { livePath } from "../../core/store.ts";
import { WgerProvider } from "./index.ts";

const dirs: string[] = [];
const open: WgerProvider[] = [];
const realFetch = globalThis.fetch;

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "datasource-wger-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const provider of open.splice(0)) provider.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function context(dataDir: string): BuildContext {
  return { dataDir, cacheDir: join(dataDir, "cache"), log: () => {}, flag: () => undefined };
}

const BENCH = {
  id: 345,
  uuid: "b1d4f0e2-0000-4000-8000-000000000000",
  category: { name: "Chest" },
  equipment: [{ name: "Barbell" }, { name: "Bench" }],
  muscles: [{ name: "Pectoralis major", name_en: "Chest" }],
  muscles_secondary: [{ name: "Triceps brachii", name_en: "Triceps" }],
  license: { short_name: "CC-BY-SA 4" },
  license_author: "wger contributor",
  last_update_global: "2026-01-01T00:00:00Z",
  translations: [
    { language: 1, name: "Bankdrücken", description: "<p>Deutsch</p>" },
    { language: 2, name: "Bench Press", description: "<p>Press the <b>bar</b>.</p>&nbsp;Hard." },
  ],
  images: [
    {
      image: "https://wger.de/media/b.png",
      thumbnails: { medium: "https://wger.de/media/b-m.png" },
      is_main: true,
      is_ai_generated: false,
      license_author: "photographer",
    },
    { image: "https://wger.de/media/b2.png", thumbnails: {}, is_main: false },
  ],
  videos: [{ video: "https://wger.de/media/b.mp4" }],
};

const SQUAT = {
  id: 111,
  uuid: "c2e5f1a3-0000-4000-8000-000000000000",
  category: { name: "Legs" },
  equipment: [],
  muscles: [],
  muscles_secondary: [],
  translations: [{ language: 2, name: "Barbell Squat" }],
  images: [],
  videos: [],
};

/** An entry with no English translation, which the catalog cannot use. */
const UNUSABLE = {
  id: 999,
  uuid: "d3f6a2b4-0000-4000-8000-000000000000",
  translations: [{ language: 1, name: "Nur Deutsch" }],
};

function mockApi(pages: Record<string, unknown>[]) {
  let call = 0;
  globalThis.fetch = (async () => {
    const page = pages[call] ?? { results: [], next: null };
    call += 1;
    return new Response(JSON.stringify(page), {
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return () => call;
}

async function importFixture() {
  const dataDir = tempDir();
  mockApi([
    { results: [BENCH, UNUSABLE], next: "https://wger.de/api/v2/exerciseinfo/?page=2" },
    { results: [SQUAT], next: null },
  ]);
  const summary = await new WgerProvider(dataDir).build(context(dataDir));
  const provider = new WgerProvider(dataDir);
  open.push(provider);
  return { dataDir, summary, provider };
}

test("follows pagination until the catalog is exhausted", async () => {
  const { summary } = await importFixture();
  expect(summary.primary).toBe(2);
  expect(summary.counts).toEqual({ exercises: 2, images: 2, videos: 1 });
});

test("skips exercises with no English name rather than importing a German one", async () => {
  const { provider } = await importFixture();
  expect(provider.byId("999")).toBeNull();
  expect(provider.byId("345")?.name).toBe("Bench Press");
});

test("strips HTML and entities from the description", async () => {
  const { provider } = await importFixture();
  // Each tag becomes a space, so a tag closing right before punctuation leaves
  // one behind ("bar ."). Long-standing behaviour, kept deliberately: changing
  // it would silently reword every description already cached downstream.
  expect(provider.byId("345")?.description).toBe("Press the bar . Hard.");
});

test("prefers the plain-English muscle label over the Latin name", async () => {
  const { provider } = await importFixture();
  const exercise = provider.byId("345");
  expect(exercise?.primaryMuscles).toEqual(["Chest"]);
  expect(exercise?.secondaryMuscles).toEqual(["Triceps"]);
  expect(exercise?.equipment).toEqual(["Barbell", "Bench"]);
});

test("carries the licence, which CC-BY-SA requires be displayed", async () => {
  const { provider } = await importFixture();
  const exercise = provider.byId("345");
  expect(exercise?.license).toBe("CC-BY-SA 4");
  expect(exercise?.licenseAuthor).toBe("wger contributor");
  expect(exercise?.images[0]?.licenseAuthor).toBe("photographer");
});

test("orders images with the main one first", async () => {
  const { provider } = await importFixture();
  const images = provider.byId("345")?.images ?? [];
  expect(images.map((image) => image.isMain)).toEqual([true, false]);
  expect(images[0]?.thumbnailUrl).toBe("https://wger.de/media/b-m.png");
  // An image with no thumbnails at all must not invent one.
  expect(images[1]?.thumbnailUrl).toBeNull();
});

test("resolves by numeric id and by uuid alike", async () => {
  const { provider } = await importFixture();
  expect(provider.byId("345")?.id).toBe("wger:345");
  expect(provider.byId(BENCH.uuid)?.id).toBe("wger:345");
  expect(provider.byId("does-not-exist")).toBeNull();
});

test("searches by name and attaches media to the results", async () => {
  const { provider } = await importFixture();
  const results = provider.search("bench", 10);
  expect(results.map((result) => result.item.name)).toEqual(["Bench Press"]);
  expect(results[0]?.item.videos).toEqual(["https://wger.de/media/b.mp4"]);
  expect(provider.search("   ", 10)).toEqual([]);
});

test("refuses to promote when the API returns nothing usable", async () => {
  const dataDir = tempDir();
  mockApi([{ results: [UNUSABLE], next: null }]);
  await expect(new WgerProvider(dataDir).build(context(dataDir))).rejects.toThrow(
    "no usable exercises",
  );
  expect(await Bun.file(livePath(dataDir, "wger")).exists()).toBe(false);
});

test("fails the build rather than promoting a partial catalog on an API error", async () => {
  const dataDir = tempDir();
  globalThis.fetch = (async () =>
    new Response("nope", { status: 502, statusText: "Bad Gateway" })) as unknown as typeof fetch;
  await expect(new WgerProvider(dataDir).build(context(dataDir))).rejects.toThrow(
    "wger request failed: 502",
  );
  expect(await Bun.file(livePath(dataDir, "wger")).exists()).toBe(false);
});

test("reads as not imported before the first build", () => {
  const provider = new WgerProvider(tempDir());
  open.push(provider);
  expect(provider.stats()).toEqual({ imported: false });
  expect(provider.search("bench", 10)).toEqual([]);
  expect(provider.byId("345")).toBeNull();
});
