/**
 * Keeps the coach workspace inside a serialized-size budget.
 *
 * The workspace is `JSON.stringify`'d straight into the model's user turn with
 * no formatter, so an unbounded payload is both a cost problem and a
 * truncation risk. Projection at the source does most of the work; this is the
 * backstop for the user with 40 presets, 30 recipes, and a year of logs.
 */

/** Roughly 15k tokens, leaves room for the system prompt, history, and reply. */
export const MAX_WORKSPACE_CHARS = 60_000;

type Sized = Record<string, unknown>;

type TrimStep = {
  /** Reported in `truncated` so the model can say history is partial. */
  field: string;
  /**
   * Returns whether anything was actually removed.
   *
   * A step that found nothing to cut must not be reported: `truncated` is what
   * tells the model to hedge its claims, and naming a field that was empty all
   * along makes it apologise for missing history the user never had.
   */
  apply: (workspace: Sized) => boolean;
};

function cap(workspace: Sized, key: string, limit: number) {
  const value = workspace[key];
  if (Array.isArray(value) && value.length > limit) {
    workspace[key] = value.slice(0, limit);
    return true;
  }
  return false;
}

function capNested(
  workspace: Sized,
  key: string,
  nestedKey: string,
  limit: number,
) {
  const value = workspace[key];
  if (!Array.isArray(value)) return false;
  let changed = false;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Sized;
    const nested = row[nestedKey];
    if (Array.isArray(nested) && nested.length > limit) {
      row[nestedKey] = nested.slice(0, limit);
      changed = true;
    }
  }
  return changed;
}

function drop(workspace: Sized, key: string) {
  if (workspace[key] === undefined) return false;
  delete workspace[key];
  return true;
}

/**
 * Ordered lowest-value-first.
 *
 * `today`, `routine`, `profile`, `goals`, and every preset/recipe id and name
 * are deliberately absent: operations reference those by ID, so trimming them
 * would break the model's ability to act rather than merely narrow its context.
 */
const TRIM_STEPS: TrimStep[] = [
  {
    field: "recipes.ingredients",
    apply: (w) => capNested(w, "recipes", "ingredients", 4),
  },
  {
    field: "presets.items",
    apply: (w) => {
      const presets = w.presets;
      if (!Array.isArray(presets)) return false;
      let changed = false;
      for (const preset of presets) {
        const snapshot = (preset as Sized)?.snapshot as Sized | undefined;
        if (snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 4) {
          snapshot.items = snapshot.items.slice(0, 4);
          changed = true;
        }
      }
      return changed;
    },
  },
  { field: "foodEntries", apply: (w) => cap(w, "foodEntries", 20) },
  { field: "recentActions", apply: (w) => cap(w, "recentActions", 10) },
  {
    field: "progressMetrics.entries",
    apply: (w) => capNested(w, "progressMetrics", "entries", 5),
  },
  {
    field: "bodyMeasurements",
    apply: (w) => cap(w, "bodyMeasurements", 10),
  },
  { field: "memories", apply: (w) => cap(w, "memories", 20) },
  {
    // The lifts are ordered most-trained first, so the tail is the accessory
    // work nobody is programming around. The deload verdict and the weekly
    // volume survive: they are two lines that carry the whole analysis.
    field: "programming.lifts",
    apply: (w) => {
      const programming = w.programming as Sized | null | undefined;
      if (!programming || !Array.isArray(programming.lifts)) return false;
      if (programming.lifts.length <= 4) return false;
      programming.lifts = programming.lifts.slice(0, 4);
      return true;
    },
  },
  {
    // The signals are four small objects; the notes are the sentences a coach
    // would actually say. Dropping the raw numbers keeps the meaning.
    field: "recovery.signals",
    apply: (w) => {
      const recovery = w.recovery as Sized | null | undefined;
      if (!recovery) return false;
      let changed = false;
      for (const key of ["steps", "hrv", "restingHeartRate", "sleep"]) {
        if (recovery[key] !== undefined) {
          delete recovery[key];
          changed = true;
        }
      }
      return changed;
    },
  },
  { field: "recentWorkouts", apply: (w) => cap(w, "recentWorkouts", 10) },
  { field: "checkIns", apply: (w) => cap(w, "checkIns", 7) },
  { field: "water", apply: (w) => drop(w, "water") },
  { field: "fasting", apply: (w) => drop(w, "fasting") },
  {
    field: "supplementAdherence",
    apply: (w) => drop(w, "supplementAdherence"),
  },
];

/**
 * Returns the workspace trimmed to fit `maxChars`, plus the list of what was
 * cut. The input is not mutated.
 */
export function fitWorkspaceToBudget<T extends object>(
  workspace: T,
  maxChars: number = MAX_WORKSPACE_CHARS,
): T & { truncated: string[] } {
  const working = structuredClone(workspace) as Sized;
  const truncated: string[] = [];

  if (JSON.stringify(working).length <= maxChars) {
    return { ...(working as T), truncated };
  }

  for (const step of TRIM_STEPS) {
    if (step.apply(working)) truncated.push(step.field);
    if (JSON.stringify(working).length <= maxChars) break;
  }

  return { ...(working as T), truncated };
}
