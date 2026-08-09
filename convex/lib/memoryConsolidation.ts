/**
 * Deciding what the coach forgets.
 *
 * Memories were stored one-per-key with no ceiling and read forty-at-a-time,
 * newest first — which meant that once someone crossed forty, what the coach
 * remembered was whatever it happened to have written most recently. A user's
 * own "I have a bad shoulder" would drop out of context behind a fortnight of
 * the model's own observations about breakfast.
 *
 * So forgetting becomes a decision rather than an accident. The rules, in
 * order of how much they matter:
 *
 *  1. Anything the user said themselves is never evicted. They typed it; it is
 *     not ours to discard.
 *  2. Safety-shaped memories are never evicted, whoever wrote them.
 *  3. Weekly episodes are kept to a fixed recent count — they exist to give
 *     the coach a sense of the last few months, not a diary.
 *  4. Whatever is left goes oldest-first.
 */

export type StoredMemory = {
  id: string;
  key: string;
  category: string;
  value: string;
  source: string;
  updatedAt: number;
};

/** Stored memories per user before consolidation starts evicting. */
export const MAX_STORED_MEMORIES = 60;
/** Weekly digests retained. Roughly a season. */
export const MAX_EPISODES = 14;

/** The category the weekly review writes its digest under. */
export const EPISODE_CATEGORY = "episode";

/**
 * Categories that describe a constraint on the user's body rather than a
 * preference. Losing one of these is a different class of mistake from
 * forgetting that somebody likes oats.
 */
const PROTECTED_CATEGORIES = new Set([
  "injury",
  "safety",
  "medical",
  "allergy",
  "constraint",
]);

/** Sources that mean "a human typed this". */
const USER_SOURCES = new Set(["user", "manual", "onboarding"]);

export function isProtected(memory: StoredMemory) {
  return (
    USER_SOURCES.has(memory.source.toLowerCase()) ||
    PROTECTED_CATEGORIES.has(memory.category.toLowerCase())
  );
}

export function isEpisode(memory: StoredMemory) {
  return memory.category.toLowerCase() === EPISODE_CATEGORY;
}

/**
 * Which memories to delete, given everything currently stored.
 *
 * Returns ids, not documents, so the caller does the writing and this stays
 * testable without a database. An empty array is the overwhelmingly common
 * answer and costs nothing.
 */
export function selectMemoriesToEvict(
  memories: StoredMemory[],
  {
    maxStored = MAX_STORED_MEMORIES,
    maxEpisodes = MAX_EPISODES,
  }: { maxStored?: number; maxEpisodes?: number } = {},
): string[] {
  const evicted = new Set<string>();

  // Episodes are capped on their own terms, independently of the overall
  // ceiling: fifteen weeks of diary crowding out a user's preferences is the
  // exact failure this whole file exists to prevent.
  const episodes = memories
    .filter((memory) => isEpisode(memory) && !isProtected(memory))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const memory of episodes.slice(maxEpisodes)) {
    evicted.add(memory.id);
  }

  const surviving = memories.filter((memory) => !evicted.has(memory.id));
  if (surviving.length <= maxStored) return [...evicted];

  // Oldest first among what may be evicted at all. Protected memories are not
  // candidates, so a user with sixty hand-written notes simply keeps all
  // sixty — the ceiling bends rather than discarding their words.
  const candidates = surviving
    .filter((memory) => !isProtected(memory))
    .sort((a, b) => a.updatedAt - b.updatedAt);

  let overBy = surviving.length - maxStored;
  for (const memory of candidates) {
    if (overBy <= 0) break;
    evicted.add(memory.id);
    overBy -= 1;
  }

  return [...evicted];
}

/**
 * Orders memories for the workspace, most useful first.
 *
 * The trim budget cuts this list from the end, so ordering *is* the curation
 * once the budget bites. Protected memories lead, then recency — an episode
 * from last week outranks a preference from March, but never a constraint.
 */
export function orderMemoriesForContext(memories: StoredMemory[]) {
  return [...memories].sort((a, b) => {
    const aProtected = isProtected(a) ? 1 : 0;
    const bProtected = isProtected(b) ? 1 : 0;
    if (aProtected !== bProtected) return bProtected - aProtected;
    return b.updatedAt - a.updatedAt;
  });
}
