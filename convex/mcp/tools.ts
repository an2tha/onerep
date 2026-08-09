import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

/**
 * The tool catalog.
 *
 * Deliberately small and coarse. Forty one-to-one wrappers around every Convex
 * function would blow the context of anything that connects and would still
 * not describe what this app is for. Eleven tools cover the log.
 *
 * Nothing here deletes. "Remove my last month of workouts" is a sentence an
 * agent can produce by accident, and the app is one tap away for the times a
 * human means it.
 */

export type ToolScope = "read" | "write";

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

export const MCP_TOOLS: McpTool[] = [
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
        destructiveHint: false,
        idempotentHint: tool.scope === "read",
      },
    }),
  );
}
