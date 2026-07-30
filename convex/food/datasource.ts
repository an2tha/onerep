import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, env, internalMutation, internalQuery } from "../_generated/server";
import { getAuthUser } from "../lib/auth";

/**
 * Client for the self-hosted datasource service (USDA FoodData Central plus
 * the wger exercise catalog), which replaces FatSecret.
 *
 * The service answers with the same Open Food Facts-shaped payloads the mobile
 * client already consumes, so this module only handles auth, retries and
 * caching.
 */
const CONTENT_TTL_MS = 23 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

function baseUrl(): string {
  const url = env.DATASOURCE_URL;
  if (!url) throw new Error("DATASOURCE_URL is not configured");
  return url.replace(/\/+$/, "");
}

function apiToken(): string {
  const token = env.DATASOURCE_API_TOKEN;
  if (!token) throw new Error("DATASOURCE_API_TOKEN is not configured");
  return token;
}

async function apiCall(path: string): Promise<unknown> {
  let lastStatus = 0;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl()}${path}`, {
        headers: { Authorization: `Bearer ${apiToken()}`, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      lastStatus = response.status;

      // A miss is a valid answer, not a failure to retry.
      if (response.ok || response.status === 404) return await response.json();
      if (!TRANSIENT_STATUSES.has(response.status)) break;
    } catch (error) {
      // Timeouts and connection resets are worth another attempt.
      lastError = error;
    }
  }

  if (lastStatus > 0) throw new Error(`Datasource request failed (${lastStatus})`);
  throw new Error(
    `Datasource request failed: ${lastError instanceof Error ? lastError.message : "unreachable"}`,
  );
}

export const getCached = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("foodSourceCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return entry && entry.expiresAt > Date.now() ? entry.value : null;
  },
});

export const putCached = internalMutation({
  args: { key: v.string(), value: v.any(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("foodSourceCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert("foodSourceCache", args);

    const expired = await ctx.db
      .query("foodSourceCache")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(100);
    for (const entry of expired) await ctx.db.delete(entry._id);
  },
});

const operationValidator = v.union(v.literal("search"), v.literal("detail"), v.literal("barcode"));

export const proxy = action({
  args: {
    operation: operationValidator,
    value: v.string(),
    limit: v.optional(v.number()),
    language: v.optional(v.string()),
    region: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    if (!(await getAuthUser(ctx))) throw new Error("Not authenticated");

    const normalized = args.value.trim();
    if (!normalized) {
      return args.operation === "search"
        ? { products: [], attribution: "usda" }
        : { status: 0, product: null, attribution: "usda" };
    }

    const key = JSON.stringify({
      operation: args.operation,
      value: normalized.toLowerCase(),
      limit: args.limit,
    });
    const cached: unknown = await ctx.runQuery(internal.food.datasource.getCached, { key });
    if (cached !== null) return cached;

    let result: unknown;
    if (args.operation === "search") {
      const limit = Math.min(50, Math.max(1, args.limit ?? 25));
      result = await apiCall(
        `/v1/foods/search?q=${encodeURIComponent(normalized)}&limit=${limit}`,
      );
    } else if (args.operation === "barcode") {
      result = await apiCall(`/v1/barcodes/${encodeURIComponent(normalized)}`);
    } else {
      result = await apiCall(`/v1/foods/${encodeURIComponent(normalized)}`);
    }

    await ctx.runMutation(internal.food.datasource.putCached, {
      key,
      value: result,
      expiresAt: Date.now() + (args.operation === "search" ? SEARCH_TTL_MS : CONTENT_TTL_MS),
    });
    return result;
  },
});

/** Exercise media and attribution from the wger catalog (CC-BY-SA 4.0). */
export const exercises = action({
  args: { operation: v.union(v.literal("search"), v.literal("detail")), value: v.string() },
  handler: async (ctx, args): Promise<unknown> => {
    if (!(await getAuthUser(ctx))) throw new Error("Not authenticated");

    const normalized = args.value.trim();
    if (!normalized) return { exercises: [], attribution: "wger" };

    const key = JSON.stringify({ kind: "exercise", ...args, value: normalized.toLowerCase() });
    const cached: unknown = await ctx.runQuery(internal.food.datasource.getCached, { key });
    if (cached !== null) return cached;

    const result =
      args.operation === "search"
        ? await apiCall(`/v1/exercises/search?q=${encodeURIComponent(normalized)}`)
        : await apiCall(`/v1/exercises/${encodeURIComponent(normalized)}`);

    await ctx.runMutation(internal.food.datasource.putCached, {
      key,
      value: result,
      expiresAt: Date.now() + CONTENT_TTL_MS,
    });
    return result;
  },
});
