import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { env } from "../_generated/server";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

type AiImage = {
  url: string;
  detail?: "auto" | "low" | "high";
};

type AiJsonRequest = {
  system: string;
  user: string;
  image?: AiImage;
  maxTokens: number;
  temperature?: number;
};

export function hasOpenAiApiKey() {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

export async function requestOpenAiJson({
  system,
  user,
  image,
  maxTokens,
  temperature,
}: AiJsonRequest) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI is not configured");

  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error("OpenAI maxTokens must be a positive integer");
  }
  if (
    temperature !== undefined &&
    (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    throw new Error("OpenAI temperature must be between 0 and 2");
  }

  const configuredModel = env.OPENAI_MODEL?.trim();
  const modelId = (configuredModel || DEFAULT_OPENAI_MODEL).replace(
    /^openai\//,
    "",
  );
  const isGpt5 = /^gpt-5(?:[.-]|$)/i.test(modelId);
  const openai = createOpenAI({ apiKey, baseURL: OPENAI_BASE_URL });

  try {
    const result = await generateText({
      model: openai(modelId),
      system,
      messages: [
        {
          role: "user",
          content: image
            ? [
                { type: "text", text: user },
                {
                  type: "image",
                  image: image.url,
                  mediaType: image.url.startsWith("data:image/png")
                    ? "image/png"
                    : "image/jpeg",
                },
              ]
            : user,
        },
      ],
      output: Output.json(),
      maxOutputTokens: maxTokens,
      ...(temperature === undefined || isGpt5 ? {} : { temperature }),
    });

    if (!result.output || typeof result.output !== "object") {
      throw new Error("OpenAI returned invalid JSON");
    }
    return JSON.stringify(result.output);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.trim().slice(0, 400)
        : "Unknown provider error";
    throw new Error(`OpenAI request failed: ${message}`);
  }
}
