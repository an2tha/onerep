import { describe, expect, test } from "bun:test";
import {
  MAX_EPISODES,
  orderMemoriesForContext,
  selectMemoriesToEvict,
  type StoredMemory,
} from "../memoryConsolidation";

let clock = 1_700_000_000_000;

function memory(overrides: Partial<StoredMemory> = {}): StoredMemory {
  clock += 1000;
  return {
    id: `m${clock}`,
    key: `key-${clock}`,
    category: "preference",
    value: "something",
    source: "coach",
    updatedAt: clock,
    ...overrides,
  };
}

function episodes(count: number) {
  return Array.from({ length: count }, (_, index) =>
    memory({
      id: `episode-${index}`,
      key: `episode:2026-w${index}`,
      category: "episode",
      source: "weekly_review",
    }),
  );
}

describe("what survives", () => {
  test("a small memory set is left entirely alone", () => {
    const memories = Array.from({ length: 10 }, () => memory());
    expect(selectMemoriesToEvict(memories)).toEqual([]);
  });

  test("the user's own words are never evicted, however old", () => {
    const theirs = memory({
      id: "user-note",
      source: "user",
      updatedAt: 1,
      value: "I have a bad shoulder",
    });
    const noise = Array.from({ length: 80 }, () => memory());

    const evicted = selectMemoriesToEvict([theirs, ...noise]);
    expect(evicted).not.toContain("user-note");
    expect(evicted.length).toBeGreaterThan(0);
  });

  test("safety-shaped memories survive whoever wrote them", () => {
    const injury = memory({
      id: "injury",
      category: "injury",
      source: "coach",
      updatedAt: 1,
    });
    const noise = Array.from({ length: 80 }, () => memory());
    expect(selectMemoriesToEvict([injury, ...noise])).not.toContain("injury");
  });

  test("a user with sixty hand-written notes keeps all sixty", () => {
    // The ceiling bends rather than discarding somebody's own words.
    const theirs = Array.from({ length: 70 }, (_, index) =>
      memory({ id: `u${index}`, source: "user" }),
    );
    expect(selectMemoriesToEvict(theirs)).toEqual([]);
  });
});

describe("episodes are capped on their own terms", () => {
  test("beyond the cap, the oldest weeks go", () => {
    const rows = episodes(MAX_EPISODES + 4);
    const evicted = selectMemoriesToEvict(rows);
    expect(evicted).toHaveLength(4);
    // Oldest four, by construction of the ids.
    expect(evicted.sort()).toEqual(
      ["episode-0", "episode-1", "episode-2", "episode-3"].sort(),
    );
  });

  test("a season of diary never crowds out a preference", () => {
    // The exact failure the whole module exists to prevent: the overall
    // ceiling is not reached, but episodes would still dominate the context.
    const preference = memory({
      id: "keeper",
      source: "user",
      updatedAt: 1,
      value: "vegetarian",
    });
    const rows = [preference, ...episodes(MAX_EPISODES + 6)];

    const evicted = new Set(selectMemoriesToEvict(rows));
    expect(evicted.has("keeper")).toBe(false);
    const survivingEpisodes = rows.filter(
      (row) => row.category === "episode" && !evicted.has(row.id),
    );
    expect(survivingEpisodes).toHaveLength(MAX_EPISODES);
  });

  test("under the cap, every episode stays", () => {
    expect(selectMemoriesToEvict(episodes(MAX_EPISODES))).toEqual([]);
  });
});

describe("the overall ceiling", () => {
  test("evicts oldest-first among what may go at all", () => {
    const oldest = memory({ id: "oldest", updatedAt: 1 });
    const newer = Array.from({ length: 60 }, () => memory());

    const evicted = selectMemoriesToEvict([oldest, ...newer], {
      maxStored: 60,
    });
    expect(evicted).toContain("oldest");
    expect(evicted).toHaveLength(1);
  });

  test("evicts exactly the overflow and no more", () => {
    const rows = Array.from({ length: 75 }, () => memory());
    expect(selectMemoriesToEvict(rows, { maxStored: 60 })).toHaveLength(15);
  });
});

describe("ordering for context", () => {
  test("constraints lead, then recency", () => {
    const old = memory({ id: "old", updatedAt: 10 });
    const recent = memory({ id: "recent", updatedAt: 100 });
    const injury = memory({ id: "injury", category: "injury", updatedAt: 5 });
    const theirs = memory({ id: "theirs", source: "user", updatedAt: 1 });

    const ordered = orderMemoriesForContext([old, recent, injury, theirs]).map(
      (row) => row.id,
    );

    // The budget trims from the end, so what leads is what survives.
    expect(ordered.slice(0, 2).sort()).toEqual(["injury", "theirs"]);
    expect(ordered.slice(2)).toEqual(["recent", "old"]);
  });

  test("does not mutate its input", () => {
    const rows = [
      memory({ id: "a", updatedAt: 1 }),
      memory({ id: "b", updatedAt: 2 }),
    ];
    const before = rows.map((row) => row.id);
    orderMemoriesForContext(rows);
    expect(rows.map((row) => row.id)).toEqual(before);
  });
});
