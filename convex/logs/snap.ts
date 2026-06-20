import { v } from "convex/values";
import { action } from "../_generated/server";
import { authComponent } from "../auth";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

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
): Promise<AnalyzeResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
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

// ── snap ──────────────────────────────────────────────────────────────────────

export const snap = action({
  args: {
    base64Image: v.string(),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const mimeType = args.mimeType ?? "image/jpeg";
    const imageData = `data:${mimeType};base64,${args.base64Image}`;

    const aiResult = await analyzeImageWithOpenAI(imageData);

    return { aiResult, foods: [] };
  },
});
