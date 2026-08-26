/**
 * The three things Apple asks of an app that shows one user's writing to
 * another, in the smallest form that is still real.
 *
 * Guideline 1.2 wants a method for filtering objectionable material, a way to
 * report it, a way to block the person who posted it, and a mechanism to act
 * on reports within 24 hours. Reporting already existed here and was the only
 * one of the four that did — and the reports landed in a table nobody read,
 * which is the same as not having one.
 *
 * The design constraint is that there is no moderation team and there is not
 * going to be one, so "act within 24 hours" has to mean "act immediately,
 * without a human". Hence a word screen at publication and a report count that
 * pulls a recipe out of the feed by itself. Both are blunt. A blunt automatic
 * takedown of somebody's chilli is a small harm; an unmoderated public feed is
 * a larger one, and is also how the app gets rejected.
 */

/**
 * Terms that have no business in a shared recipe, matched on word boundaries
 * against normalised text.
 *
 * Deliberately short, and deliberately not a general profanity list: somebody
 * naming a recipe "damn good chilli" is not the problem this exists for, and a
 * filter that fires on ordinary swearing only teaches people to route around
 * it. These are the two categories App Review means by objectionable — slurs
 * aimed at a group, and explicit sexual content.
 */
const BLOCKED_TERMS = [
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "tranny",
  "kike",
  "spic",
  "chink",
  "gook",
  "wetback",
  "retard",
  "retarded",
  "paki",
  "coon",
  "cunt",
  "rape",
  "rapist",
  "porn",
  "porno",
  "pornography",
  "blowjob",
  "handjob",
  "bukkake",
  "incest",
  "bestiality",
  "pedo",
  "pedophile",
  "paedophile",
  "childporn",
];

/**
 * Length at or above which a term is also matched with spacing removed.
 *
 * Six, because that is where evasion stops costing more than it gains and
 * where the false positives stop. Matching short terms against unspaced text
 * fails immediately and embarrassingly: "cum" is inside cucumber, "fag" is
 * inside fagioli, and a bean stew is not hate speech.
 */
const COLLAPSE_MIN_LENGTH = 6;

/**
 * Leetspeak, diacritics and punctuation, flattened before matching.
 *
 * Not a claim to have solved evasion — nothing short of a classifier does —
 * but "p0rn" and "n i g g e r" are the whole of what a determined person tries
 * first, and letting those through makes the filter decorative.
 */
function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/**
 * The first blocked term found in `parts`, or null when the text may be shared.
 *
 * The term comes back so the caller *can* name it. It should not: telling
 * somebody precisely which word tripped the filter is a tutorial in getting
 * past it. It is returned for logging and tests.
 */
export function findBlockedTerm(
  parts: (string | undefined | null)[],
): string | null {
  const normalized = normalize(parts.filter(Boolean).join(" "));
  if (!normalized) return null;
  const spaced = ` ${normalized} `;
  // "n i g g e r" survives the word-boundary pass and dies here. Only long
  // terms get this treatment; see COLLAPSE_MIN_LENGTH.
  const collapsed = normalized.replace(/ /g, "");

  for (const term of BLOCKED_TERMS) {
    if (spaced.includes(` ${term} `)) return term;
    if (term.length >= COLLAPSE_MIN_LENGTH && collapsed.includes(term)) {
      return term;
    }
  }
  return null;
}

/**
 * Reports needed before a recipe leaves the community feed on its own.
 *
 * Two rather than one, because one person should not be able to delete
 * somebody else's recipe on their own say-so. Two rather than five, because
 * the feed is small and waiting for five reports is waiting for none.
 */
export const AUTO_REMOVE_REPORT_THRESHOLD = 2;

/** Why a recipe was pulled, stored on the recipe so its author can be told. */
export const AUTO_REMOVED_REASON = "reported";
