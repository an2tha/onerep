import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const MAX_LISTS = 100;
const MAX_ITEMS = 300;

/** Mirrors the item shape embedded in `groceryLists`. */
const groceryItemValidator = v.object({
  id: v.string(),
  name: v.string(),
  key: v.string(),
  grams: v.optional(v.number()),
  displayAmount: v.optional(v.number()),
  displayUnit: v.optional(v.string()),
  category: v.optional(v.string()),
  checked: v.boolean(),
  manual: v.optional(v.boolean()),
  sources: v.optional(v.array(v.string())),
});

type GroceryItem = {
  id: string;
  name: string;
  key: string;
  grams?: number;
  displayAmount?: number;
  displayUnit?: string;
  category?: string;
  checked: boolean;
  manual?: boolean;
  sources?: string[];
};

function positiveOrUndefined(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Drops empty lines and de-duplicates by client id.
 *
 * The offline queue can replay a save, so an id colliding means "the same
 * item", not "a second one".
 */
function normalizeItems(items: GroceryItem[]): GroceryItem[] {
  const seen = new Set<string>();
  const normalized: GroceryItem[] = [];

  for (const item of items) {
    const name = item.name?.trim();
    if (!name || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push({
      ...item,
      name,
      key: item.key?.trim() || name.toLowerCase(),
      grams: positiveOrUndefined(item.grams),
      displayAmount: positiveOrUndefined(item.displayAmount),
      checked: !!item.checked,
    });
    if (normalized.length >= MAX_ITEMS) break;
  }

  return normalized;
}

function cleanName(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : "Grocery list";
}

async function ownedList(
  ctx: MutationCtx,
  id: Id<"groceryLists">,
  userId: string,
) {
  const doc = await ctx.db.get(id);
  if (!doc || doc.userId !== userId) {
    throw new Error("Grocery list not found or access denied");
  }
  return doc;
}

// ── reads ─────────────────────────────────────────────────────────────────────

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("groceryLists")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_LISTS);

    return docs
      .filter((doc) => (args.includeArchived ? true : !doc.archivedAt))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

export const get = query({
  args: { id: v.id("groceryLists") },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) return null;
    return { ...doc, id: doc._id };
  },
});

// ── writes ────────────────────────────────────────────────────────────────────

export const save = mutation({
  args: {
    id: v.optional(v.id("groceryLists")),
    name: v.string(),
    items: v.array(groceryItemValidator),
    sourceRecipeIds: v.optional(v.array(v.string())),
    sourceBatchIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();
    const items = normalizeItems(args.items);

    if (args.id) {
      await ownedList(ctx, args.id, user._id);
      await ctx.db.patch(args.id, {
        name: cleanName(args.name),
        items,
        sourceRecipeIds: args.sourceRecipeIds,
        sourceBatchIds: args.sourceBatchIds,
        updatedAt: now,
      });
      return args.id;
    }

    const existing = await ctx.db
      .query("groceryLists")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_LISTS);
    if (existing.length >= MAX_LISTS) {
      throw new Error(
        `You can keep up to ${MAX_LISTS} grocery lists. Delete one to add another.`,
      );
    }

    return await ctx.db.insert("groceryLists", {
      userId: user._id,
      name: cleanName(args.name),
      items,
      sourceRecipeIds: args.sourceRecipeIds,
      sourceBatchIds: args.sourceBatchIds,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** The hot path while shopping — one indexed read and one patch. */
export const setItemChecked = mutation({
  args: {
    id: v.id("groceryLists"),
    itemId: v.string(),
    checked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ownedList(ctx, args.id, user._id);

    await ctx.db.patch(args.id, {
      items: doc.items.map((item) =>
        item.id === args.itemId ? { ...item, checked: args.checked } : item,
      ),
      updatedAt: Date.now(),
    });
  },
});

export const setAllChecked = mutation({
  args: { id: v.id("groceryLists"), checked: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ownedList(ctx, args.id, user._id);

    await ctx.db.patch(args.id, {
      items: doc.items.map((item) => ({ ...item, checked: args.checked })),
      updatedAt: Date.now(),
    });
  },
});

export const addItem = mutation({
  args: { id: v.id("groceryLists"), item: groceryItemValidator },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ownedList(ctx, args.id, user._id);
    if (doc.items.length >= MAX_ITEMS) {
      throw new Error(`A list can hold up to ${MAX_ITEMS} items.`);
    }

    await ctx.db.patch(args.id, {
      items: normalizeItems([...doc.items, args.item]),
      updatedAt: Date.now(),
    });
  },
});

export const removeItem = mutation({
  args: { id: v.id("groceryLists"), itemId: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ownedList(ctx, args.id, user._id);

    await ctx.db.patch(args.id, {
      items: doc.items.filter((item) => item.id !== args.itemId),
      updatedAt: Date.now(),
    });
  },
});

/** Clears everything already in the trolley. */
export const clearChecked = mutation({
  args: { id: v.id("groceryLists") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ownedList(ctx, args.id, user._id);

    await ctx.db.patch(args.id, {
      items: doc.items.filter((item) => !item.checked),
      updatedAt: Date.now(),
    });
  },
});

export const setArchived = mutation({
  args: { id: v.id("groceryLists"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    await ownedList(ctx, args.id, user._id);

    await ctx.db.patch(args.id, {
      archivedAt: args.archived ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("groceryLists") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    await ownedList(ctx, args.id, user._id);
    await ctx.db.delete(args.id);
  },
});
