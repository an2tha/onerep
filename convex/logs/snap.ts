import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { action, internalMutation, type ActionCtx } from "../_generated/server";
import { hasOpenAiApiKey, requestOpenAiJson } from "../ai/provider";
import { renderSystemPrompt } from "../ai/prompts.generated";
import { consumeAiUsageOrThrow } from "../ai/usage";
import { getAuthUser } from "../lib/auth";

const MAX_SNAPS_PER_DAY = 10;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_CANDIDATES_PER_DETECTION = 10;
const MAX_ALTERNATIVES_PER_DETECTION = 8;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface Ingredient {
  name: string;
  quantityInGrams: string;
  searchQueries?: string[];
}

interface AnalyzeResult {
  foodName?: string;
  ingredients?: Ingredient[];
  estimatedQuantity?: string;
  searchQueries?: string[];
}

type SnapSearchDetection = {
  index: number;
  name: string;
  searchQueries: string[];
};

type FoodMatchResult = {
  detectionIndex: number;
  detectedName: string;
  food: FoodResult | null;
  alternatives: FoodResult[];
};

type FoodResult = {
  id: string;
  source: "openfoodfacts";
  code: string;
  name: string;
  brand?: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  imageUrl?: string;
  openFoodFacts: Record<string, unknown>;
};

function cleanText(value: unknown, maxLength = 80) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanSearchQueries(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const item of values) {
    const query = cleanText(item, 80);
    const key = query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length >= 5) break;
  }
  return queries;
}

function normalizeIngredient(value: unknown): Ingredient | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const name = cleanText(input.name, 80);
  if (!name) return null;
  const quantityInGrams = cleanText(input.quantityInGrams, 32);
  const searchQueries = cleanSearchQueries(input.searchQueries);
  return {
    name,
    quantityInGrams: quantityInGrams || "100 g",
    ...(searchQueries.length > 0 ? { searchQueries } : {}),
  };
}

function stripUndefined(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const cleaned = stripUndefined(child);
      if (cleaned !== undefined) output[key] = cleaned;
    }
    return output;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(
    String(value)
      .replace(",", ".")
      .replace(/[^0-9.-]/g, ""),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== 0) return parsed;
  }
  return 0;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
}

function cleanUnknown(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "unknown") return undefined;
  return normalized;
}

function titleCaseName(value: string): string {
  return value.replace(/\S+/g, (word) => {
    if (/^[A-Z0-9&.'-]+$/.test(word) && word.length <= 4) return word;
    return word
      .toLowerCase()
      .replace(
        /^([\p{L}\p{N}])|([\s'’\-/])([\p{L}\p{N}])/gu,
        (match, first, sep, next) =>
          first ? first.toUpperCase() : `${sep}${next.toUpperCase()}`,
      );
  });
}

function selectedImageUrl(
  product: Record<string, unknown>,
): string | undefined {
  const selectedImages = asRecord(product.selected_images);
  const front = asRecord(selectedImages.front);
  for (const groupName of ["display", "small", "thumb"]) {
    const group = asRecord(front[groupName]);
    const url = firstString(...Object.values(group));
    if (url) return url;
  }
}

function productImageUrl(product: Record<string, unknown>): string | undefined {
  return firstString(
    product.image_front_small_url,
    product.image_front_thumb_url,
    product.image_front_url,
    product.image_url,
    selectedImageUrl(product),
  );
}

function nutrientValue(product: Record<string, unknown>, key: string): number {
  const nutriments = asRecord(product.nutriments);
  const estimated = asRecord(product.nutriments_estimated);
  return firstNumber(
    nutriments[`${key}_100g`],
    nutriments[key],
    estimated[`${key}_100g`],
    estimated[key],
  );
}

function servingLabel(product: Record<string, unknown>): string {
  return firstString(product.serving_size, product.quantity) ?? "100 g";
}

function productName(product: Record<string, unknown>): string {
  return titleCaseName(
    firstString(
      product.product_name_en,
      product.product_name,
      product.generic_name,
      product.code,
      product._id,
    ) ?? "Food",
  );
}

function productToFoodResult(raw: unknown): FoodResult | null {
  const product = asRecord(raw);
  const code = firstString(product.code, product._id);
  if (!code) return null;

  const calories = nutrientValue(product, "energy-kcal");
  const protein = nutrientValue(product, "proteins");
  const carbs = nutrientValue(product, "carbohydrates");
  const fat = nutrientValue(product, "fat");
  const openFoodFacts = stripUndefined({
    code,
    product_name: firstString(product.product_name),
    product_name_en: firstString(product.product_name_en),
    generic_name: firstString(product.generic_name),
    brands: firstString(product.brands),
    quantity: firstString(product.quantity),
    serving_size: firstString(product.serving_size, product.serving),
    serving_quantity: firstString(
      product.serving_quantity,
      product.servingQuantity,
    ),
    image_url: firstString(product.image_url),
    image_front_url: firstString(product.image_front_url),
    image_front_small_url: firstString(product.image_front_small_url),
    image_front_thumb_url: firstString(product.image_front_thumb_url),
    selected_images: product.selected_images,
    nutriments: product.nutriments,
    nutriments_estimated: product.nutriments_estimated,
    nutriscore_grade: firstString(product.nutriscore_grade),
    nova_group: firstString(product.nova_group),
  }) as Record<string, unknown>;

  return stripUndefined({
    id: code,
    source: "openfoodfacts" as const,
    code,
    name: productName(product),
    brand: cleanUnknown(firstString(product.brands)),
    serving: servingLabel(product),
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    imageUrl: productImageUrl(product),
    openFoodFacts,
  }) as FoodResult;
}

function dedupeFoods(results: FoodResult[]): FoodResult[] {
  const seen = new Set<string>();
  const deduped: FoodResult[] = [];
  for (const result of results) {
    if (seen.has(result.code)) continue;
    seen.add(result.code);
    deduped.push(result);
  }
  return deduped;
}

function normalizeSearchKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchQueriesForDetection(detection: SnapSearchDetection) {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const query of [detection.name, ...detection.searchQueries]) {
    const clean = cleanText(query, 80);
    const key = normalizeSearchKey(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    queries.push(clean);
    if (queries.length >= 5) break;
  }
  return queries;
}

function detectionsFromAnalysis(
  aiResult: AnalyzeResult,
): SnapSearchDetection[] {
  const ingredients = aiResult.ingredients ?? [];
  if (ingredients.length > 0) {
    return ingredients.slice(0, 8).map((ingredient, index) => ({
      index,
      name: ingredient.name,
      searchQueries: ingredient.searchQueries ?? [],
    }));
  }
  if (!aiResult.foodName) return [];
  return [
    {
      index: 0,
      name: aiResult.foodName,
      searchQueries: aiResult.searchQueries ?? [],
    },
  ];
}

async function searchOpenFoodFacts(
  ctx: ActionCtx,
  query: string,
  language?: string,
): Promise<FoodResult[]> {
  const data = (await ctx.runAction(api.food.datasource.proxy, {
    operation: "search",
    value: query,
    limit: MAX_CANDIDATES_PER_DETECTION,
    language,
  })) as { products?: unknown[] };
  return (data.products ?? [])
    .map(productToFoodResult)
    .filter((item): item is FoodResult => item !== null)
    .filter((item) => normalizeSearchKey(item.name).length > 0);
}

async function analyzeFoodDescriptionWithOpenAi(
  text: string,
): Promise<AnalyzeResult> {
  const content = await requestOpenAiJson({
    system: renderSystemPrompt("meal_description"),
    user: JSON.stringify({
      description: text,
      instruction:
        "Break this meal down into ingredients for a temporary recipe to log once.",
    }),
    temperature: 0.15,
    maxTokens: 900,
  });
  return normalizeAnalyzeResult(JSON.parse(content));
}

function normalizeAnalyzeResult(value: unknown): AnalyzeResult {
  const raw = asRecord(value);
  const foodName = cleanText(raw.foodName, 80);
  const estimatedQuantity = cleanText(raw.estimatedQuantity, 32);
  const searchQueries = cleanSearchQueries(raw.searchQueries);
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients
        .map(normalizeIngredient)
        .filter((item): item is Ingredient => item !== null)
        .slice(0, 8)
    : [];

  return {
    ...(foodName ? { foodName } : {}),
    ...(estimatedQuantity ? { estimatedQuantity } : {}),
    ...(searchQueries.length > 0 ? { searchQueries } : {}),
    ...(ingredients.length > 0 ? { ingredients } : {}),
  };
}

async function analyzeImageWithOpenAi(
  imageData: string,
): Promise<AnalyzeResult> {
  const content = await requestOpenAiJson({
    system: renderSystemPrompt("meal_image"),
    user: `Analyze this meal image for logging. Split plates, bowls, and mixed meals into visible foods where possible. Return JSON only with the exact keys: "foodName", "estimatedQuantity", "searchQueries", "ingredients". Use null for unused single-food fields and [] for no ingredients or search queries.`,
    image: { url: imageData, detail: "high" },
    maxTokens: 800,
  });
  return normalizeAnalyzeResult(JSON.parse(content));
}

async function chooseBestFoodsWithOpenAi(
  groups: Array<{
    detection: SnapSearchDetection;
    candidates: FoodResult[];
  }>,
) {
  const candidatesForPrompt = groups.map(({ detection, candidates }) => ({
    detectionIndex: detection.index,
    detectedName: detection.name,
    searchQueries: searchQueriesForDetection(detection),
    candidates: candidates.map((candidate) => ({
      code: candidate.code,
      name: candidate.name,
      brand: candidate.brand ?? null,
      serving: candidate.serving,
      calories: candidate.calories,
      protein: candidate.protein,
      carbs: candidate.carbs,
      fat: candidate.fat,
    })),
  }));

  const rawContent = await requestOpenAiJson({
    system: renderSystemPrompt("food_match"),
    user: JSON.stringify({
      responseShape: {
        matches: [
          {
            detectionIndex: 0,
            selectedCode: "candidate code or null",
          },
        ],
      },
      detections: candidatesForPrompt,
    }),
    temperature: 0.05,
    maxTokens: 700,
  });

  const parsed = JSON.parse(rawContent) as { matches?: unknown[] };
  const selected = new Map<number, string | null>();
  for (const match of parsed.matches ?? []) {
    if (!match || typeof match !== "object") continue;
    const input = match as Record<string, unknown>;
    const detectionIndex = Number(input.detectionIndex);
    if (!Number.isInteger(detectionIndex)) continue;
    const selectedCode =
      typeof input.selectedCode === "string" && input.selectedCode.trim()
        ? input.selectedCode.trim()
        : null;
    selected.set(detectionIndex, selectedCode);
  }
  return selected;
}

async function buildFoodMatches(
  ctx: ActionCtx,
  aiResult: AnalyzeResult,
  language?: string,
): Promise<FoodMatchResult[]> {
  const detections = detectionsFromAnalysis(aiResult);
  if (detections.length === 0) return [];

  const groups = await Promise.all(
    detections.map(async (detection) => {
      const settled = await Promise.allSettled(
        searchQueriesForDetection(detection).map((query) =>
          searchOpenFoodFacts(ctx, query, language),
        ),
      );
      const results = settled.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
      return {
        detection,
        candidates: dedupeFoods(results).slice(0, MAX_CANDIDATES_PER_DETECTION),
      };
    }),
  );

  let selectedByDetection = new Map<number, string | null>();
  if (groups.some((group) => group.candidates.length > 0)) {
    try {
      selectedByDetection = await chooseBestFoodsWithOpenAi(groups);
    } catch (error) {
      console.warn("Falling back to first snap search result", error);
    }
  }

  return groups.map(({ detection, candidates }) => {
    const selectedCode = selectedByDetection.get(detection.index);
    const selectedFood =
      selectedCode === null
        ? null
        : (candidates.find((candidate) => candidate.code === selectedCode) ??
          candidates[0] ??
          null);
    const alternatives = selectedFood
      ? [
          selectedFood,
          ...candidates.filter(
            (candidate) => candidate.code !== selectedFood.code,
          ),
        ]
      : candidates;

    return {
      detectionIndex: detection.index,
      detectedName: detection.name,
      food: selectedFood,
      alternatives: alternatives.slice(0, MAX_ALTERNATIVES_PER_DETECTION),
    };
  });
}

export const consumeSnapQuota = internalMutation({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("snapUsage")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();

    if (existing && existing.count >= MAX_SNAPS_PER_DAY) {
      return { allowed: false, remaining: 0 };
    }

    const nextCount = (existing?.count ?? 0) + 1;
    if (existing) {
      await ctx.db.patch(existing._id, {
        count: nextCount,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("snapUsage", {
        userId: args.userId,
        date: args.date,
        count: nextCount,
        updatedAt: Date.now(),
      });
    }

    return { allowed: true, remaining: MAX_SNAPS_PER_DAY - nextCount };
  },
});

function decodedByteLength(base64: string) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

// ── snap ──────────────────────────────────────────────────────────────────────

async function runAiMealAnalysis({
  ctx,
  aiResult,
  language,
}: {
  ctx: ActionCtx;
  aiResult: AnalyzeResult;
  language?: string;
}) {
  const matches = await buildFoodMatches(ctx, aiResult, language);
  return {
    aiResult,
    matches,
    foods: matches
      .map((match) => match.food)
      .filter((food): food is FoodResult => food !== null),
  };
}

export const snap = action({
  args: {
    base64Image: v.string(),
    mimeType: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    if (!hasOpenAiApiKey()) throw new Error("Photo analysis is not configured");

    const mimeType = args.mimeType ?? "image/jpeg";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error("Unsupported image type");
    }

    if (decodedByteLength(args.base64Image) > MAX_IMAGE_BYTES) {
      throw new Error("Image is too large");
    }

    const quota: { allowed: boolean; remaining: number } =
      await ctx.runMutation(internal.logs.snap.consumeSnapQuota, {
        userId: user._id,
        date: utcDateKey(),
      });
    if (!quota.allowed) throw new Error("Daily photo analysis limit reached");

    // One app-level AI usage count covers both provider calls in this action:
    // photo parsing first, then candidate selection from search results.
    await consumeAiUsageOrThrow(ctx, user._id, "food_snap");

    const imageData = `data:${mimeType};base64,${args.base64Image}`;
    const aiResult = await analyzeImageWithOpenAi(imageData);
    return await runAiMealAnalysis({
      ctx,
      aiResult,
      language: args.language,
    });
  },
});

export const describeText = action({
  args: {
    text: v.string(),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    if (!hasOpenAiApiKey()) {
      throw new Error("Meal description AI is not configured");
    }

    const text = args.text.trim().slice(0, 2_000);
    if (text.length < 4) throw new Error("Describe what you ate.");

    // One app-level AI usage count covers description parsing plus candidate
    // selection from search results.
    await consumeAiUsageOrThrow(ctx, user._id, "food_snap");

    const aiResult = await analyzeFoodDescriptionWithOpenAi(text);
    return await runAiMealAnalysis({
      ctx,
      aiResult,
      language: args.language,
    });
  },
});
