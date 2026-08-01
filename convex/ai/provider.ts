import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import { env } from "../_generated/server";

export const OPENAI_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENAI_MODEL = "openai/gpt-5.6-luna";

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

function resolveApiKey() {
  // OpenRouter first, falling back to a direct OpenAI key so an existing
  // deployment keeps working while the variable is being switched over.
  return env.OPENROUTER_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "";
}

export function hasOpenAiApiKey() {
  return Boolean(resolveApiKey());
}

/**
 * OpenRouter identifies models as `provider/name`, so the prefix is part of the
 * id and must survive. Stripping it — as this did when talking to OpenAI
 * directly — leaves a model OpenRouter cannot resolve.
 */
function resolveModelId() {
  return env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

/**
 * Pulls the provider's own words out of an SDK error.
 *
 * The SDK wraps upstream failures in a generic "Provider returned error", which
 * says nothing actionable — a bad model id, an unsupported feature and a billing
 * problem all look identical. The real message is in the response body.
 */
function describeProviderError(error: unknown) {
  const base =
    error instanceof Error ? error.message.trim() : "Unknown provider error";
  const details = error as {
    statusCode?: number;
    responseBody?: string;
    cause?: unknown;
  };

  const parts: string[] = [base];
  if (typeof details?.statusCode === "number") {
    parts.push(`status ${details.statusCode}`);
  }
  if (typeof details?.responseBody === "string" && details.responseBody) {
    parts.push(details.responseBody);
  } else if (details?.cause instanceof Error) {
    parts.push(details.cause.message);
  }
  return parts.join(" — ").slice(0, 600);
}

/** One tool call the model made, kept so a report can be audited afterwards. */
export type AgentToolCall = {
  tool: string;
  input: unknown;
  output: unknown;
};

export type AgentResult<T> = {
  output: T;
  toolCalls: AgentToolCall[];
  steps: number;
};

/**
 * Runs a tool-calling loop and returns the model's final JSON.
 *
 * Sits beside `requestOpenAiJson` rather than replacing it: most callers want a
 * single shot with a fixed input, while this one is for work where the model has
 * to decide what it needs to look at. Giving it tools instead of one enormous
 * prompt is what keeps that affordable — it pulls the handful of measurements
 * the question actually turns on rather than being handed all of them.
 *
 * `maxSteps` is a hard ceiling on billed round-trips, not a target.
 */
export async function runOpenAiAgent<T>({
  system,
  user,
  tools,
  schema,
  maxSteps,
  maxTokens,
}: {
  system: string;
  user: string;
  tools: ToolSet;
  /** Constrains the model's final answer rather than validating it afterwards. */
  schema: z.ZodType<T>;
  maxSteps: number;
  maxTokens: number;
}): Promise<AgentResult<T>> {
  const apiKey = resolveApiKey();
  if (!apiKey) throw new Error("OpenRouter is not configured");

  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error("OpenAI maxTokens must be a positive integer");
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new Error("OpenAI maxSteps must be a positive integer");
  }

  const openai = createOpenAI({ apiKey, baseURL: OPENAI_BASE_URL });

  try {
    const result = await generateText({
      model: openai(resolveModelId()),
      system,
      prompt: user,
      tools,
      stopWhen: stepCountIs(maxSteps),
      // Asking for free-form JSON and validating at the far end meant any
      // deviation surfaced as an opaque failure with nothing to debug. Handing
      // the schema to the provider makes the shape a constraint instead.
      output: Output.object({ schema, name: "report" }),
      maxOutputTokens: maxTokens,
    });

    const toolCalls: AgentToolCall[] = [];
    for (const step of result.steps) {
      step.toolResults.forEach((call) => {
        toolCalls.push({
          tool: call.toolName,
          input: call.input,
          output: call.output,
        });
      });
    }

    return {
      output: result.output as T,
      toolCalls,
      steps: result.steps.length,
    };
  } catch (error) {
    throw new Error(`Model request failed: ${describeProviderError(error)}`);
  }
}

export async function requestOpenAiJson({
  system,
  user,
  image,
  maxTokens,
  temperature,
}: AiJsonRequest) {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
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

  const modelId = resolveModelId();
  // Matches with or without an OpenRouter `provider/` prefix.
  const isGpt5 = /(?:^|\/)gpt-5(?:[.-]|$)/i.test(modelId);
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
    throw new Error(`Model request failed: ${describeProviderError(error)}`);
  }
}
