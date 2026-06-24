import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalMutation } from "../_generated/server";
import { authComponent } from "../auth";

const MAX_SNAPS_PER_DAY = 10;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface Ingredient {
  name: string;
  quantityInGrams: string;
}

interface AnalyzeResult {
  foodName?: string;
  ingredients?: Ingredient[];
  estimatedQuantity?: string;
}

async function analyzeImageWithOpenAI(
  imageData: string,
  apiKey: string,
): Promise<AnalyzeResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an ingredient analysis assistant. Respond with a JSON object only.
- Single food: { "foodName": "<name>", "estimatedQuantity": "<qty>", "ingredients": null }
- Multiple/dish: { "ingredients": [{ "name": "<name>", "quantityInGrams": "<g>" }], "foodName": null, "estimatedQuantity": null }
Always include all three keys.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image. Respond with JSON only, all three keys: "foodName", "estimatedQuantity", "ingredients". Unused fields = null.`,
            },
            { type: "image_url", image_url: { url: imageData, detail: "low" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 512,
    }),
  });

  if (!response.ok) throw new Error("OpenAI request failed");
  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  const raw = JSON.parse(data.choices[0].message.content) as {
    foodName?: string | null;
    ingredients?: Ingredient[] | null;
    estimatedQuantity?: string | null;
  };

  return {
    ...(raw.foodName ? { foodName: raw.foodName } : {}),
    ...(raw.ingredients ? { ingredients: raw.ingredients } : {}),
    ...(raw.estimatedQuantity
      ? { estimatedQuantity: raw.estimatedQuantity }
      : {}),
  };
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
      await ctx.db.patch(existing._id, { count: nextCount, updatedAt: Date.now() });
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

export const snap = action({
  args: {
    base64Image: v.string(),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Photo analysis is not configured");

    const mimeType = args.mimeType ?? "image/jpeg";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error("Unsupported image type");
    }

    if (decodedByteLength(args.base64Image) > MAX_IMAGE_BYTES) {
      throw new Error("Image is too large");
    }

    const quota: { allowed: boolean; remaining: number } = await ctx.runMutation(
      internal.logs.snap.consumeSnapQuota,
      { userId: user._id, date: utcDateKey() },
    );
    if (!quota.allowed) throw new Error("Daily photo analysis limit reached");

    const imageData = `data:${mimeType};base64,${args.base64Image}`;

    const aiResult = await analyzeImageWithOpenAI(imageData, apiKey);

    return { aiResult, foods: [] };
  },
});
