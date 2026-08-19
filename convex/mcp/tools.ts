import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

/**
 * The tool catalog.
 *
 * Deliberately small and coarse. Forty one-to-one wrappers around every Convex
 * function would blow the context of anything that connects and would still
 * not describe what this app is for. Eleven tools cover the log.
 *
 * Deleting is its own scope, not a flavour of writing. "Remove my last month of
 * workouts" is a sentence an agent can produce by accident, so a key has to be
 * minted for it deliberately — and every write and delete here files an undo
 * against the coach's action history, which means the app's undo button covers
 * anything an agent did over HTTP.
 */

export type ToolScope = "read" | "write" | "delete";

type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: false;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  inputSchema: JsonSchema;
  run: (
    ctx: ActionCtx,
    userId: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
};

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

function dateProperty(description: string) {
  return { type: "string", pattern: DATE_PATTERN, description };
}

/** Today in UTC. Agents that care about the user's timezone pass a date. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

function requireDate(value: unknown, fallback = today()) {
  if (value === undefined || value === null) return fallback;
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Not a date: ${date}. Use YYYY-MM-DD.`);
  }
  return date;
}

function requireNumber(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a number`);
  return parsed;
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  return requireNumber(value, field);
}

/** The original log surface: nutrition, training, body, goals. */
const CORE_TOOLS: McpTool[] = [
  {
    name: "get_day",
    title: "Get one day",
    description:
      "Everything logged on a single date: food entries and totals, water, completed workouts, and whether it was marked a rest day.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: { date: dateProperty("Defaults to today (UTC).") },
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runQuery(internal.mcp.data.getDay, {
        userId,
        date: requireDate(args.date),
      }),
  },
  {
    name: "get_range",
    title: "Get a date range",
    description:
      "Per-day nutrition totals, completed workouts and rest days between two dates, inclusive. Use this for weekly or monthly questions rather than calling get_day repeatedly.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        start: dateProperty("First day, inclusive."),
        end: dateProperty("Last day, inclusive."),
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runQuery(internal.mcp.data.getRange, {
        userId,
        start: requireDate(args.start),
        end: requireDate(args.end),
      }),
  },
  {
    name: "list_workouts",
    title: "List recent workouts",
    description:
      "The most recently completed training sessions, newest first, with exercises, sets, reps and weights.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runQuery(internal.mcp.data.listWorkouts, {
        userId,
        limit: optionalNumber(args.limit, "limit"),
      }),
  },
  {
    name: "get_goals",
    title: "Get goals and preferences",
    description:
      "The user's calorie and macro targets, water goal, weight unit and stated training goal.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    run: (ctx, userId) => ctx.runQuery(internal.mcp.data.getGoals, { userId }),
  },
  {
    name: "get_training_insights",
    title: "Get training insights",
    description:
      "The server's computed analysis: per-lift progression verdicts over twelve weeks (progressing/stalled/regressing, with suggestions and a deload recommendation), measured recovery versus the user's own baseline (sleep, resting heart rate, HRV), and six months of monthly training/nutrition summaries. Read-only conclusions, not raw logs.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        date: dateProperty("Anchor for the windows. Defaults to today (UTC)."),
      },
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runQuery(internal.progressInsights.forUser, {
        userId,
        today: requireDate(args.date),
      }),
  },
  {
    name: "list_body_measurements",
    title: "List body measurements",
    description:
      "Recent weigh-ins and body measurements, newest first, in kilograms and centimetres.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runQuery(internal.mcp.data.listBodyMeasurements, {
        userId,
        limit: optionalNumber(args.limit, "limit"),
      }),
  },
  {
    name: "log_water",
    title: "Log water",
    description: "Adds a drink to a day's water log.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        amountMl: { type: "integer", minimum: 1, maximum: 5000 },
        date: dateProperty("Defaults to today (UTC)."),
      },
      required: ["amountMl"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.logWater, {
        userId,
        date: requireDate(args.date),
        amountMl: requireNumber(args.amountMl, "amountMl"),
      }),
  },
  {
    name: "log_food",
    title: "Log a food entry",
    description:
      "Adds one food entry to a day's diary. Calories are required; macros default to zero, so supply them when they are known rather than guessing wildly.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 120 },
        calories: { type: "number", minimum: 0 },
        protein: { type: "number", minimum: 0 },
        carbs: { type: "number", minimum: 0 },
        fat: { type: "number", minimum: 0 },
        meal: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner", "snack"],
          default: "snack",
        },
        date: dateProperty("Defaults to today (UTC)."),
      },
      required: ["name", "calories"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.logFood, {
        userId,
        date: requireDate(args.date),
        name: String(args.name ?? ""),
        meal: args.meal === undefined ? undefined : String(args.meal),
        calories: requireNumber(args.calories, "calories"),
        protein: optionalNumber(args.protein, "protein"),
        carbs: optionalNumber(args.carbs, "carbs"),
        fat: optionalNumber(args.fat, "fat"),
      }),
  },
  {
    name: "log_weight",
    title: "Log a weigh-in",
    description:
      "Records body weight in kilograms for a date, replacing that day's weigh-in if one exists.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        weightKg: { type: "number", minimum: 20, maximum: 400 },
        date: dateProperty("Defaults to today (UTC)."),
      },
      required: ["weightKg"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.logWeight, {
        userId,
        date: requireDate(args.date),
        weightKg: requireNumber(args.weightKg, "weightKg"),
      }),
  },
  {
    name: "log_workout",
    title: "Log a workout",
    description:
      "Records a completed training session. A date can hold two sessions; a third is refused rather than silently dropped.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        exercises: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              name: { type: "string", maxLength: 80 },
              sets: {
                type: "array",
                minItems: 1,
                maxItems: 30,
                items: {
                  type: "object",
                  properties: {
                    reps: { type: "integer", minimum: 0 },
                    weightKg: { type: "number", minimum: 0 },
                  },
                  required: ["reps"],
                  additionalProperties: false,
                },
              },
            },
            required: ["name", "sets"],
            additionalProperties: false,
          },
        },
        durationMinutes: { type: "integer", minimum: 1, maximum: 600 },
        date: dateProperty("Defaults to today (UTC)."),
      },
      required: ["exercises"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.logWorkout, {
        userId,
        date: requireDate(args.date),
        durationMinutes: optionalNumber(
          args.durationMinutes,
          "durationMinutes",
        ),
        exercises: (Array.isArray(args.exercises) ? args.exercises : []).map(
          (raw) => {
            const exercise = (raw ?? {}) as Record<string, unknown>;
            const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
            return {
              name: String(exercise.name ?? ""),
              sets: sets.map((rawSet) => {
                const set = (rawSet ?? {}) as Record<string, unknown>;
                return {
                  reps: requireNumber(set.reps, "reps"),
                  weightKg: optionalNumber(set.weightKg, "weightKg"),
                };
              }),
            };
          },
        ),
      }),
  },
  {
    name: "mark_rest_day",
    title: "Mark rest days",
    description:
      "Marks one or more dates as deliberate rest, which stops the app treating the gap as a lapse.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        dates: {
          type: "array",
          minItems: 1,
          maxItems: 31,
          items: { type: "string", pattern: DATE_PATTERN },
        },
      },
      required: ["dates"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.markRestDays, {
        userId,
        dates: (Array.isArray(args.dates) ? args.dates : []).map((date) =>
          requireDate(date),
        ),
      }),
  },
];

export const HEALTH_TOOLS: McpTool[] = [
  {
    name: "get_health_days",
    title: "Get daily health readings",
    description:
      "Sleep, steps, resting heart rate, HRV and active energy per day between two dates, as synced from Apple Health or Health Connect. HRV is SDNN on Apple and RMSSD on Health Connect: never compare the two, only a user against their own baseline.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        start: dateProperty("First day, inclusive."),
        end: dateProperty("Last day, inclusive."),
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runQuery(internal.mcp.data.listHealthDays, {
        userId,
        start: requireDate(args.start),
        end: requireDate(args.end),
      }),
  },
  {
    name: "list_health_workouts",
    title: "List health workouts",
    description:
      "Sessions read out of the platform health store — runs, rides, swims and the rest — newest first, with duration, distance, heart rate and whether each has been promoted into the training log.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runQuery(internal.mcp.data.listHealthWorkouts, {
        userId,
        limit: optionalNumber(args.limit, "limit"),
      }),
  },
  {
    name: "log_health_workout",
    title: "Log a health workout",
    description:
      "Records a cardio or activity session the phone cannot see — a watch the app has no integration with, or a bulk import. Pass a stable `externalId` and a repeated call replaces that session rather than duplicating it: the body describes the session in full, so a field you leave out is cleared. This does not touch the training log; promote it in the app.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        activityType: {
          type: "string",
          maxLength: 60,
          description: "running, cycling, swimming, walking, …",
        },
        activityName: { type: "string", maxLength: 80 },
        durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
        date: dateProperty("Local day. Defaults to today (UTC)."),
        startedAt: {
          type: "string",
          description: "ISO 8601 start time. Defaults to midday on `date`.",
        },
        externalId: {
          type: "string",
          maxLength: 120,
          description:
            "Your own stable id, so a retry updates rather than duplicates.",
        },
        totalDistanceMeters: { type: "number", minimum: 0 },
        avgHeartRateBpm: { type: "number", minimum: 0 },
        activeEnergyKcal: { type: "number", minimum: 0 },
        sourceName: { type: "string", maxLength: 80 },
      },
      required: ["activityType", "durationMinutes"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.logHealthWorkout, {
        userId,
        date: requireDate(args.date),
        activityType: String(args.activityType ?? ""),
        activityName:
          args.activityName === undefined
            ? undefined
            : String(args.activityName),
        startedAt:
          args.startedAt === undefined ? undefined : String(args.startedAt),
        durationMinutes: requireNumber(args.durationMinutes, "durationMinutes"),
        externalId:
          args.externalId === undefined ? undefined : String(args.externalId),
        totalDistanceMeters: optionalNumber(
          args.totalDistanceMeters,
          "totalDistanceMeters",
        ),
        avgHeartRateBpm: optionalNumber(
          args.avgHeartRateBpm,
          "avgHeartRateBpm",
        ),
        activeEnergyKcal: optionalNumber(
          args.activeEnergyKcal,
          "activeEnergyKcal",
        ),
        sourceName:
          args.sourceName === undefined ? undefined : String(args.sourceName),
      }),
  },
];

export const DELETE_TOOLS: McpTool[] = [
  {
    name: "delete_food_entry",
    title: "Delete a food entry",
    description:
      "Removes one entry from a day's diary by its id, as returned by get_day. Undoable from the app.",
    scope: "delete",
    inputSchema: {
      type: "object",
      properties: {
        date: dateProperty("The day the entry is on."),
        entryId: { type: "string", maxLength: 120 },
      },
      required: ["date", "entryId"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.deleteFoodEntry, {
        userId,
        date: requireDate(args.date),
        entryId: String(args.entryId ?? ""),
      }),
  },
  {
    name: "delete_water_entry",
    title: "Delete a water entry",
    description:
      "Removes one drink from a day's water log by its id, as returned by get_day. Undoable from the app.",
    scope: "delete",
    inputSchema: {
      type: "object",
      properties: {
        date: dateProperty("The day the drink is on."),
        entryId: { type: "string", maxLength: 120 },
      },
      required: ["date", "entryId"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.deleteWaterEntry, {
        userId,
        date: requireDate(args.date),
        entryId: String(args.entryId ?? ""),
      }),
  },
  {
    name: "delete_workout",
    title: "Delete a workout",
    description:
      "Removes a logged training session by its date and sessionId, both as returned by get_day or list_workouts. Sessions logged before the app tracked session ids cannot be deleted here. Undoable from the app.",
    scope: "delete",
    inputSchema: {
      type: "object",
      properties: {
        date: dateProperty("The day the session is on."),
        sessionId: { type: "string", maxLength: 120 },
      },
      required: ["date", "sessionId"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.deleteWorkout, {
        userId,
        date: requireDate(args.date),
        sessionId: String(args.sessionId ?? ""),
      }),
  },
  {
    name: "delete_body_measurement",
    title: "Delete a measurement",
    description:
      "Removes one weigh-in or measurement by its id, as returned by list_body_measurements. Undoable from the app.",
    scope: "delete",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", maxLength: 64 } },
      required: ["id"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.deleteBodyMeasurement, {
        userId,
        id: String(args.id ?? ""),
      }),
  },
  {
    name: "delete_health_workout",
    title: "Delete a health workout",
    description:
      "Removes an imported health session by its id, as returned by list_health_workouts. A later device sync may import the same session again. Undoable from the app.",
    scope: "delete",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", maxLength: 64 } },
      required: ["id"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.deleteHealthWorkout, {
        userId,
        id: String(args.id ?? ""),
      }),
  },
  {
    name: "delete_health_day",
    title: "Delete a day's health readings",
    description:
      "Removes the stored sleep, steps, heart rate and HRV for one date — for a bad sensor read that is poisoning a baseline. The phone may sync the day again. Undoable from the app.",
    scope: "delete",
    inputSchema: {
      type: "object",
      properties: { date: dateProperty("The day to clear.") },
      required: ["date"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.deleteHealthDay, {
        userId,
        date: requireDate(args.date),
      }),
  },
  {
    name: "unmark_rest_days",
    title: "Unmark rest days",
    description:
      "Removes the deliberate-rest marking from one or more dates. Undoable from the app.",
    scope: "delete",
    inputSchema: {
      type: "object",
      properties: {
        dates: {
          type: "array",
          minItems: 1,
          maxItems: 31,
          items: { type: "string", pattern: DATE_PATTERN },
        },
      },
      required: ["dates"],
      additionalProperties: false,
    },
    run: (ctx, userId, args) =>
      ctx.runMutation(internal.mcp.data.unmarkRestDays, {
        userId,
        dates: (Array.isArray(args.dates) ? args.dates : []).map((date) =>
          requireDate(date),
        ),
      }),
  },
];

export const MCP_TOOLS: McpTool[] = [
  ...CORE_TOOLS,
  ...HEALTH_TOOLS,
  ...DELETE_TOOLS,
];

export function findTool(name: string) {
  return MCP_TOOLS.find((tool) => tool.name === name) ?? null;
}

/** The `tools/list` payload, in the shape the protocol asks for. */
export function toolDescriptors(scopes: ToolScope[]) {
  return MCP_TOOLS.filter((tool) => scopes.includes(tool.scope)).map(
    (tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: tool.scope === "read",
        destructiveHint: tool.scope === "delete",
        idempotentHint: tool.scope === "read",
      },
    }),
  );
}
