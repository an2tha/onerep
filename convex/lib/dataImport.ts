// See the note in formCoachAgent.ts: the named `z` export is undefined under
// the Bun runtime, so import the namespace instead.
import * as z from "zod";
import {
  SET_TYPES,
  clampNumber,
  clampText,
  normalizeSetType,
  type SetType,
} from "./workoutTextParser";

/**
 * Pure parsing and mapping for the onboarding data import.
 *
 * Another app's export arrives as a CSV or JSON file nobody agreed on a schema
 * for. The model's only job is to look at a sample and say which columns mean
 * what (`ImportPlan`); everything after that — every row, every unit
 * conversion, every clamp — is applied here, deterministically, where it can
 * be unit-tested. A 5 MB file never goes anywhere near a prompt.
 *
 * Nothing in this file touches a Convex context.
 */

export const IMPORT_MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_FILES = 3;
export const IMPORT_MAX_RECORDS_PER_FILE = 20_000;
export const IMPORT_MAX_WORKOUTS = 1_500;
export const IMPORT_MAX_MEASUREMENTS = 2_000;
export const IMPORT_MAX_EXERCISES_PER_WORKOUT = 30;
export const IMPORT_MAX_SETS_PER_EXERCISE = 30;
export const IMPORT_SAMPLE_ROWS = 15;
/** Namespaced like `apple-health:` session ids, and for the same reason: it
 * can never collide with a client `crypto.randomUUID()`, which makes
 * re-running the same import an overwrite instead of a duplicate. */
export const IMPORT_ID_PREFIX = "import:";

const LB_PER_KG = 2.20462;
const CM_PER_IN = 2.54;

// ── CSV ───────────────────────────────────────────────────────────────────────

/**
 * The delimiter is whichever plausible separator the header row uses most.
 * European exports are semicolon-delimited as often as not, and a tab is what
 * you get when someone routes their history through a spreadsheet first.
 */
function sniffDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || text.length);
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC 4180 over a string. The same state machine as the datasource workspace's
 * streaming reader, minus the stream: an import file is capped at 5 MB, so it
 * fits in memory and this stays runnable inside a Convex action.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const separator = delimiter ?? sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteInField = false;

  const endField = () => {
    row.push(field);
    field = "";
    quoteInField = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && field.length === 0 && !quoteInField) {
      quoted = true;
      quoteInField = true;
    } else if (char === separator) {
      endField();
    } else if (char === "\n") {
      endField();
      rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }

  // A final line without a trailing newline still forms a row.
  if (field.length > 0 || row.length > 0) {
    endField();
    rows.push(row);
  }
  return rows;
}

/** Objects keyed by the header row, addressed by name rather than position. */
export function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const headerRow = rows[0];
  if (!headerRow) return [];
  const header = headerRow.map((name) => name.trim().replace(/^﻿/, ""));

  const records: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]!;
    // Trailing empty lines decode as a single empty field.
    if (row.length === 1 && row[0] === "") continue;
    const record: Record<string, string> = {};
    for (let i = 0; i < header.length; i += 1) {
      const key = header[i];
      if (key) record[key] = row[i] ?? "";
    }
    records.push(record);
    if (records.length >= IMPORT_MAX_RECORDS_PER_FILE) break;
  }
  return records;
}

// ── JSON ──────────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The rows of a JSON export are wherever its largest array of objects is —
 * sometimes the document itself, sometimes buried under a `workouts` or
 * `data.entries` key. Depth-limited so a pathological document terminates.
 */
function findRecordArray(
  value: unknown,
  depth: number,
): Record<string, unknown>[] | null {
  if (Array.isArray(value)) {
    const objects = value.filter(isPlainObject);
    return objects.length > 0 ? objects : null;
  }
  if (!isPlainObject(value) || depth >= 3) return null;
  let best: Record<string, unknown>[] | null = null;
  for (const child of Object.values(value)) {
    const found = findRecordArray(child, depth + 1);
    if (found && (!best || found.length > best.length)) best = found;
  }
  return best;
}

/**
 * Flattens one nested item into per-leaf rows.
 *
 * Nested exports are workout → exercises[] → sets[]; exploding the largest
 * child array at each level turns that into one row per set, with parent
 * fields repeated — the same shape a flat CSV would have had, so one column
 * plan covers both. A second sibling array (rare) is dropped rather than
 * multiplied into a cartesian product.
 */
function expandRecord(
  item: Record<string, unknown>,
  prefix: string,
  base: Record<string, string>,
  out: Record<string, string>[],
  depth: number,
) {
  const scalars: Record<string, string> = { ...base };
  let explode: { key: string; items: Record<string, unknown>[] } | null = null;

  for (const [key, raw] of Object.entries(item)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (raw === null || raw === undefined) continue;
    if (Array.isArray(raw)) {
      const objects = raw.filter(isPlainObject);
      if (objects.length > 0 && depth < 3) {
        if (!explode || objects.length > explode.items.length) {
          explode = { key: name, items: objects };
        }
        continue;
      }
      scalars[name] = raw
        .filter((entry) => typeof entry !== "object")
        .map(String)
        .join("; ");
    } else if (isPlainObject(raw)) {
      for (const [childKey, childValue] of Object.entries(raw)) {
        if (childValue !== null && typeof childValue !== "object") {
          scalars[`${name}.${childKey}`] = String(childValue);
        }
      }
    } else {
      scalars[name] = String(raw);
    }
  }

  if (!explode) {
    out.push(scalars);
    return;
  }
  for (const child of explode.items) {
    if (out.length >= IMPORT_MAX_RECORDS_PER_FILE) return;
    expandRecord(child, explode.key, scalars, out, depth + 1);
  }
}

export function jsonRecords(text: string): Record<string, string>[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  const array = findRecordArray(value, 0);
  if (!array) return [];
  const out: Record<string, string>[] = [];
  for (const item of array) {
    if (out.length >= IMPORT_MAX_RECORDS_PER_FILE) break;
    expandRecord(item, "", {}, out, 0);
  }
  return out.slice(0, IMPORT_MAX_RECORDS_PER_FILE);
}

/** CSV or JSON, decided by mime type, then extension, then a look inside. */
export function extractRecords(
  text: string,
  mimeType: string,
  fileName: string,
): Record<string, string>[] {
  const trimmed = text.trimStart();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (mimeType.includes("json")) return jsonRecords(text);
  if (mimeType.includes("csv")) return csvRecords(text);
  if (/\.json$/i.test(fileName)) return jsonRecords(text);
  if (/\.csv$/i.test(fileName)) return csvRecords(text);
  return looksJson ? jsonRecords(text) : csvRecords(text);
}

/** The union of keys across the first rows — what the model sees as columns. */
export function headersOf(records: Record<string, string>[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const record of records.slice(0, 50)) {
    for (const key of Object.keys(record)) {
      if (seen.has(key)) continue;
      seen.add(key);
      headers.push(key);
      if (headers.length >= 60) return headers;
    }
  }
  return headers;
}

/** The compact sample the model maps from: name, columns, a handful of rows. */
export function buildPlanRequest(
  fileName: string,
  records: Record<string, string>[],
): string {
  const headers = headersOf(records);
  const sample = records.slice(0, IMPORT_SAMPLE_ROWS).map((record) => {
    const trimmed: Record<string, string> = {};
    for (const key of headers) {
      const value = record[key];
      if (value !== undefined && value !== "") {
        trimmed[key] = value.slice(0, 60);
      }
    }
    return trimmed;
  });
  return [
    `File: ${fileName}`,
    `Rows: ${records.length}${records.length >= IMPORT_MAX_RECORDS_PER_FILE ? " (truncated)" : ""}`,
    `Columns: ${JSON.stringify(headers)}`,
    `Sample rows:`,
    ...sample.map((row) => JSON.stringify(row)),
  ].join("\n");
}

// ── The plan ──────────────────────────────────────────────────────────────────

const columnsSchema = z.object({
  date: z.string().optional(),
  workoutName: z.string().optional(),
  durationSeconds: z.string().optional(),
  durationMinutes: z.string().optional(),
  exerciseName: z.string().optional(),
  setType: z.string().optional(),
  weight: z.string().optional(),
  weightUnit: z.string().optional(),
  reps: z.string().optional(),
  rpe: z.string().optional(),
  bodyWeight: z.string().optional(),
  bodyFatPct: z.string().optional(),
  waist: z.string().optional(),
  hips: z.string().optional(),
  chest: z.string().optional(),
  arms: z.string().optional(),
  thighs: z.string().optional(),
  calves: z.string().optional(),
  neck: z.string().optional(),
});

/**
 * Everything the model is allowed to decide about a file, and nothing more.
 * Column values must be names from the file's own header; rows are never
 * generated by the model, only addressed.
 */
export const importPlanSchema = z.object({
  kind: z.enum(["workouts", "measurements", "unsupported"]),
  /** One short sentence for the user when a file cannot be imported. */
  note: z.string().optional(),
  /** True when numeric dates read day-first, like 31/01/2024. */
  dayFirstDates: z.boolean().optional(),
  /** Unit of weight cells when no per-row unit column exists. */
  weightUnit: z.enum(["kg", "lb"]).optional(),
  /** Unit of girth measurement cells. */
  lengthUnit: z.enum(["cm", "in"]).optional(),
  columns: columnsSchema,
});

export type ImportPlan = z.infer<typeof importPlanSchema>;
export type ImportColumns = z.infer<typeof columnsSchema>;

/**
 * A header-name guess for when AI is unconfigured or refuses to answer.
 * It reads the same plan the model would have written, so the apply path
 * cannot tell the difference — the convention every agent in this codebase
 * follows, and the reason the feature degrades instead of disappearing.
 */
export function fallbackPlan(
  headers: string[],
  defaultWeightUnit: "kg" | "lb" = "kg",
): ImportPlan {
  const lower = headers.map((header) => header.toLowerCase());
  const find = (...needles: string[]) => {
    for (const needle of needles) {
      const index = lower.findIndex((header) => header.includes(needle));
      if (index >= 0) return headers[index];
    }
    return undefined;
  };

  const date = find("date", "start_time", "start time", "day", "time");
  const exerciseName = find("exercise", "movement", "lift");
  const reps = find("rep");
  const joined = lower.join(" ");
  const weightUnit: "kg" | "lb" =
    /(?:^|[^a-z])(?:lbs?|pounds?)(?:[^a-z]|$)/.test(joined)
      ? "lb"
      : /(?:^|[^a-z])(?:kg|kilograms?)(?:[^a-z]|$)/.test(joined)
        ? "kg"
        : defaultWeightUnit;

  if (date && exerciseName && reps) {
    return {
      kind: "workouts",
      weightUnit,
      columns: {
        date,
        exerciseName,
        reps,
        workoutName: find("workout name", "workout", "routine", "session"),
        weight:
          headers[
            lower.findIndex(
              (header) => header.includes("weight") && !header.includes("body"),
            )
          ],
        weightUnit: find("weight unit", "weight_unit"),
        rpe: find("rpe"),
        setType: find("set type", "type"),
      },
    };
  }

  const bodyWeight = find("bodyweight", "body weight", "weight");
  const bodyFatPct = find("fat");
  const waist = find("waist");
  if (date && (bodyWeight || bodyFatPct || waist)) {
    return {
      kind: "measurements",
      weightUnit,
      lengthUnit: /\binch|\bin\b/.test(joined) ? "in" : "cm",
      columns: {
        date,
        bodyWeight,
        bodyFatPct,
        waist,
        hips: find("hip"),
        chest: find("chest"),
        arms: find("arm", "bicep"),
        thighs: find("thigh"),
        calves: find("calf", "calves"),
        neck: find("neck"),
      },
    };
  }

  return {
    kind: "unsupported",
    note: "I couldn't tell what this file holds from its columns.",
    columns: {},
  };
}

// ── Cell parsing ──────────────────────────────────────────────────────────────

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string | null {
  if (year < 1970 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Dates arrive as ISO strings, epoch numbers, or a numeric triple whose order
 * only the model (or the values themselves) can disambiguate. "13/01/2024"
 * proves its own order; "01/02/2024" is whatever `dayFirst` says it is.
 */
export function parseImportDate(
  raw: string | undefined,
  dayFirst = false,
): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;

  if (/^\d{13}$/.test(value) || /^\d{10}$/.test(value)) {
    const millis = value.length === 13 ? Number(value) : Number(value) * 1000;
    const date = new Date(millis);
    return toDateKey(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return toDateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const yearFirst = value.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (yearFirst) {
    return toDateKey(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      Number(yearFirst[3]),
    );
  }

  const triple = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (triple) {
    const first = Number(triple[1]);
    const second = Number(triple[2]);
    const year = Number(triple[3]);
    // A component over 12 settles the order regardless of the plan's guess.
    const dayLeads = first > 12 ? true : second > 12 ? false : dayFirst;
    return dayLeads
      ? toDateKey(year, second, first)
      : toDateKey(year, first, second);
  }

  // "Jan 5, 2024" and friends. Local-timezone parsing is fine here: the
  // string carries a calendar date, not an instant.
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return toDateKey(
      parsed.getFullYear(),
      parsed.getMonth() + 1,
      parsed.getDate(),
    );
  }
  return null;
}

/** "82,5", "100 kg", "12.5lbs" — a number with whatever came along for the ride. */
export function parseCellNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(".")
    ? cleaned.replace(/,/g, "")
    : cleaned.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function unitFromCell(raw: string | undefined): "kg" | "lb" | null {
  if (!raw) return null;
  if (/lb|pound/i.test(raw)) return "lb";
  if (/kg|kilo/i.test(raw)) return "kg";
  return null;
}

function importSetType(raw: string | undefined): SetType {
  const value = raw?.trim().toLowerCase() ?? "";
  if (!value) return "working";
  if (SET_TYPES.includes(value as SetType)) return normalizeSetType(value);
  if (value.includes("warm")) return "warmup";
  if (value.includes("drop")) return "drop";
  if (value.includes("fail") || value === "f") return "failure";
  if (value.includes("myo")) return "myoreps";
  return "working";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** The catalog-less exercise id imported history groups under. */
export function importExerciseId(name: string) {
  return `${IMPORT_ID_PREFIX}${slugify(name)}`;
}

// ── Applying a plan ───────────────────────────────────────────────────────────

export type ImportedSet = {
  type: SetType;
  weight: number;
  reps: number;
  completed: true;
  rpe?: number;
};

export type ImportedExercise = {
  id: string;
  name: string;
  sets: ImportedSet[];
};

export type ImportedWorkout = {
  date: string;
  sessionId: string;
  exercises: ImportedExercise[];
  durationSeconds: number;
  completedAt: number;
};

export type ImportedMeasurement = {
  clientId: string;
  loggedAt: string;
  weightKg?: number;
  bodyFatPct?: number;
  waistCm?: number;
  hipsCm?: number;
  chestCm?: number;
  armsCm?: number;
  thighsCm?: number;
  calvesCm?: number;
  neckCm?: number;
};

export type ImportApplication = {
  workouts: ImportedWorkout[];
  measurements: ImportedMeasurement[];
  skippedRows: number;
};

type WorkoutGroup = {
  order: number;
  durationSeconds: number;
  exercises: Map<string, { name: string; sets: ImportedSet[] }>;
};

function applyWorkoutsPlan(
  records: Record<string, string>[],
  plan: ImportPlan,
): ImportApplication {
  const columns = plan.columns;
  if (!columns.date || !columns.exerciseName) {
    return { workouts: [], measurements: [], skippedRows: records.length };
  }

  let skippedRows = 0;
  const byDate = new Map<string, Map<string, WorkoutGroup>>();

  for (const record of records) {
    const date = parseImportDate(record[columns.date], plan.dayFirstDates);
    const name = clampText(record[columns.exerciseName], 80);
    if (!date || name.length < 2) {
      skippedRows += 1;
      continue;
    }

    let groups = byDate.get(date);
    if (!groups) {
      if (byDate.size >= IMPORT_MAX_WORKOUTS) {
        skippedRows += 1;
        continue;
      }
      groups = new Map();
      byDate.set(date, groups);
    }

    const groupKey = columns.workoutName
      ? (record[columns.workoutName]?.trim() ?? "")
      : "";
    let group = groups.get(groupKey);
    if (!group) {
      group = { order: groups.size, durationSeconds: 0, exercises: new Map() };
      groups.set(groupKey, group);
    }

    const durationCell = columns.durationSeconds
      ? parseCellNumber(record[columns.durationSeconds])
      : columns.durationMinutes
        ? (parseCellNumber(record[columns.durationMinutes]) ?? 0) * 60
        : null;
    if (durationCell) {
      group.durationSeconds = Math.max(
        group.durationSeconds,
        clampNumber(durationCell, 0, 86_400, 0),
      );
    }

    const exerciseKey = name.toLowerCase();
    let exercise = group.exercises.get(exerciseKey);
    if (!exercise) {
      if (group.exercises.size >= IMPORT_MAX_EXERCISES_PER_WORKOUT) {
        skippedRows += 1;
        continue;
      }
      exercise = { name, sets: [] };
      group.exercises.set(exerciseKey, exercise);
    }
    if (exercise.sets.length >= IMPORT_MAX_SETS_PER_EXERCISE) {
      skippedRows += 1;
      continue;
    }

    const weightRaw = columns.weight ? record[columns.weight] : undefined;
    const weightValue = parseCellNumber(weightRaw);
    const unit =
      unitFromCell(weightRaw) ??
      unitFromCell(
        columns.weightUnit ? record[columns.weightUnit] : undefined,
      ) ??
      plan.weightUnit ??
      "kg";
    const weightKg =
      weightValue === null
        ? 0
        : unit === "lb"
          ? +(weightValue / LB_PER_KG).toFixed(2)
          : +weightValue.toFixed(2);
    const rpe = columns.rpe ? parseCellNumber(record[columns.rpe]) : null;

    exercise.sets.push({
      type: importSetType(
        columns.setType ? record[columns.setType] : undefined,
      ),
      weight: Math.min(Math.max(weightKg, 0), 600),
      reps: clampNumber(
        columns.reps ? parseCellNumber(record[columns.reps]) : 0,
        0,
        999,
        0,
      ),
      completed: true,
      ...(rpe === null ? {} : { rpe: clampNumber(rpe, 1, 10, 8) }),
    });
  }

  const workouts: ImportedWorkout[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const groups = [...byDate.get(date)!.values()].sort(
      (a, b) => a.order - b.order,
    );
    // A calendar day holds two workout slots and no more. A rare third source
    // session merges into the second rather than silently vanishing.
    while (groups.length > 2) {
      const extra = groups.pop()!;
      const second = groups[1]!;
      for (const [key, exercise] of extra.exercises) {
        if (second.exercises.size >= IMPORT_MAX_EXERCISES_PER_WORKOUT) break;
        const existing = second.exercises.get(key);
        if (existing) existing.sets.push(...exercise.sets);
        else second.exercises.set(key, exercise);
      }
      second.durationSeconds = Math.max(
        second.durationSeconds,
        extra.durationSeconds,
      );
    }
    groups.forEach((group, index) => {
      const exercises = [...group.exercises.values()].map((exercise) => ({
        id: importExerciseId(exercise.name),
        name: exercise.name,
        sets: exercise.sets.slice(0, IMPORT_MAX_SETS_PER_EXERCISE),
      }));
      if (exercises.length === 0) return;
      workouts.push({
        date,
        sessionId: `${IMPORT_ID_PREFIX}${date}:${index + 1}`,
        exercises,
        durationSeconds: group.durationSeconds,
        // Noon UTC lands inside every timezone's reading of the calendar day,
        // so the log claims the right date rather than the import moment.
        completedAt: Date.parse(`${date}T12:00:00Z`),
      });
    });
  }

  return { workouts, measurements: [], skippedRows };
}

function convertLength(
  value: number | null,
  unit: "cm" | "in",
): number | undefined {
  if (value === null) return undefined;
  const cm = unit === "in" ? value * CM_PER_IN : value;
  if (cm < 10 || cm > 300) return undefined;
  return +cm.toFixed(1);
}

function applyMeasurementsPlan(
  records: Record<string, string>[],
  plan: ImportPlan,
): ImportApplication {
  const columns = plan.columns;
  if (!columns.date) {
    return { workouts: [], measurements: [], skippedRows: records.length };
  }
  const lengthUnit = plan.lengthUnit ?? "cm";

  let skippedRows = 0;
  const byDate = new Map<string, ImportedMeasurement>();

  for (const record of records) {
    const date = parseImportDate(record[columns.date], plan.dayFirstDates);
    if (!date) {
      skippedRows += 1;
      continue;
    }

    const weightRaw = columns.bodyWeight
      ? record[columns.bodyWeight]
      : undefined;
    const weightValue = parseCellNumber(weightRaw);
    const unit = unitFromCell(weightRaw) ?? plan.weightUnit ?? "kg";
    const weightKg =
      weightValue === null
        ? undefined
        : (() => {
            const kg = unit === "lb" ? weightValue / LB_PER_KG : weightValue;
            return kg >= 20 && kg <= 400 ? +kg.toFixed(2) : undefined;
          })();

    const bodyFatValue = columns.bodyFatPct
      ? parseCellNumber(record[columns.bodyFatPct])
      : null;
    const bodyFatPct =
      bodyFatValue !== null && bodyFatValue >= 2 && bodyFatValue <= 75
        ? +bodyFatValue.toFixed(1)
        : undefined;

    const girth = (column: string | undefined) =>
      convertLength(
        column ? parseCellNumber(record[column]) : null,
        lengthUnit,
      );

    const fields: Omit<ImportedMeasurement, "clientId" | "loggedAt"> = {
      weightKg,
      bodyFatPct,
      waistCm: girth(columns.waist),
      hipsCm: girth(columns.hips),
      chestCm: girth(columns.chest),
      armsCm: girth(columns.arms),
      thighsCm: girth(columns.thighs),
      calvesCm: girth(columns.calves),
      neckCm: girth(columns.neck),
    };
    const defined = Object.entries(fields).filter(
      ([, value]) => value !== undefined,
    );
    if (defined.length === 0) {
      skippedRows += 1;
      continue;
    }

    const existing = byDate.get(date);
    if (!existing && byDate.size >= IMPORT_MAX_MEASUREMENTS) {
      skippedRows += 1;
      continue;
    }
    // One check-in per date; a later row on the same date fills gaps and
    // overrides earlier values, matching "last write wins" in the source app.
    byDate.set(date, {
      ...(existing ?? {
        clientId: `${IMPORT_ID_PREFIX}${date}`,
        loggedAt: date,
      }),
      ...Object.fromEntries(defined),
      clientId: `${IMPORT_ID_PREFIX}${date}`,
      loggedAt: date,
    });
  }

  return {
    workouts: [],
    measurements: [...byDate.values()].sort((a, b) =>
      a.loggedAt.localeCompare(b.loggedAt),
    ),
    skippedRows,
  };
}

export function applyImportPlan(
  records: Record<string, string>[],
  plan: ImportPlan,
): ImportApplication {
  if (plan.kind === "workouts") return applyWorkoutsPlan(records, plan);
  if (plan.kind === "measurements") {
    return applyMeasurementsPlan(records, plan);
  }
  return { workouts: [], measurements: [], skippedRows: records.length };
}

// ── Preview summary ───────────────────────────────────────────────────────────

export type ImportFileSummary = {
  kind: ImportPlan["kind"];
  note?: string;
  workouts: number;
  measurements: number;
  skippedRows: number;
  firstDate?: string;
  lastDate?: string;
  exerciseCount: number;
};

export function summarizeApplication(
  plan: ImportPlan,
  application: ImportApplication,
): ImportFileSummary {
  const dates = [
    ...application.workouts.map((workout) => workout.date),
    ...application.measurements.map((measurement) => measurement.loggedAt),
  ].sort();
  const exercises = new Set<string>();
  for (const workout of application.workouts) {
    for (const exercise of workout.exercises) exercises.add(exercise.id);
  }
  return {
    kind: plan.kind,
    ...(plan.note ? { note: plan.note } : {}),
    workouts: application.workouts.length,
    measurements: application.measurements.length,
    skippedRows: application.skippedRows,
    ...(dates.length > 0
      ? { firstDate: dates[0], lastDate: dates[dates.length - 1] }
      : {}),
    exerciseCount: exercises.size,
  };
}
