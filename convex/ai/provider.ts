import { ChatOpenAI } from "@langchain/openai";
// The `/web` entrypoint, not the root one: the root entrypoint reaches for
// `node:async_hooks`, which the Convex default runtime does not have.
import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
  type MessageContent,
} from "@langchain/core/messages";
// See the note in formCoachAgent.ts: the named `z` export is undefined under
// the Bun runtime, so import the namespace instead.
import * as z from "zod";
import { env } from "../_generated/server";
import modelCatalog from "./models.json";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";

/**
 * The models a user may pick from, one file for both sides of the wire: the
 * app renders the picker from it, and the server refuses ids that are not in
 * it. Order matters only in the picker; the served default stays whatever the
 * deployment's env says.
 */
export const AI_MODEL_CATALOG: ReadonlyArray<{ id: string; label: string }> =
  modelCatalog;

export function assertCatalogModel(id: string) {
  if (!AI_MODEL_CATALOG.some((entry) => entry.id === id)) {
    throw new Error("That model is not available");
  }
}

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
  /** Names this caller in the `[ai-usage]` log lines. */
  label?: string;
  /**
   * A user's own OpenRouter key (BYOK). When set, the request runs on their
   * credential instead of the deployment's, and a missing server key stops
   * mattering. AI_PROCESSOR_APPROVED still gates both paths: it is the
   * operator's attestation that AI processing is allowed at all, not a
   * statement about whose key pays for it.
   */
  apiKey?: string | null;
  /**
   * The user's pick from AI_MODEL_CATALOG, in place of the env default.
   * Callers validate it with assertCatalogModel before it reaches here.
   */
  model?: string | null;
};

function resolveOpenRouterConfig(
  userApiKey?: string | null,
  modelOverride?: string | null,
) {
  const apiKey = userApiKey?.trim() || env.OPENROUTER_API_KEY?.trim() || "";
  // OPENAI_MODEL is accepted for one widened-schema release only. Credentials
  // never receive a corresponding fallback: an OpenAI key must not be sent to
  // the OpenRouter endpoint. A caller's override wins over all of it, but only
  // after assertCatalogModel has vouched for it.
  const model =
    modelOverride?.trim() ||
    env.OPENROUTER_MODEL?.trim() ||
    env.OPENAI_MODEL?.trim() ||
    DEFAULT_OPENROUTER_MODEL;
  if (
    env.AI_PROCESSOR_APPROVED?.trim().toLowerCase() !== "true" ||
    !apiKey ||
    !model.includes("/")
  ) {
    return null;
  }
  return Object.freeze({
    apiKey,
    model,
    baseURL: OPENROUTER_BASE_URL,
  });
}

type OpenRouterConfig = NonNullable<ReturnType<typeof resolveOpenRouterConfig>>;

export function hasOpenAiApiKey(userApiKey?: string | null) {
  return resolveOpenRouterConfig(userApiKey) !== null;
}

/**
 * Pulls the provider's own words out of a client error.
 *
 * Client libraries wrap upstream failures in a generic message, which says
 * nothing actionable — a bad model id, an unsupported feature and a billing
 * problem all look identical. The real message is in the response body, which
 * the OpenAI client exposes as `error` and older wrappers as `responseBody`.
 */
function describeProviderError(error: unknown) {
  const base =
    error instanceof Error ? error.message.trim() : "Unknown provider error";
  const details = error as {
    status?: number;
    statusCode?: number;
    responseBody?: string;
    error?: unknown;
    cause?: unknown;
  };

  const parts: string[] = [base];
  const status = details?.statusCode ?? details?.status;
  if (typeof status === "number") {
    parts.push(`status ${status}`);
  }
  if (typeof details?.responseBody === "string" && details.responseBody) {
    parts.push(details.responseBody);
  } else if (details?.error && typeof details.error === "object") {
    parts.push(JSON.stringify(details.error));
  } else if (details?.cause instanceof Error) {
    parts.push(details.cause.message);
  }
  return parts.join(" — ").slice(0, 600);
}

/**
 * The tool contract agents are written against. Kept as our own shape rather
 * than LangChain's `StructuredTool` because the graph executes tools itself:
 * it needs the raw `execute` output for the audit trail, where a ToolMessage
 * only ever carries the serialized string.
 */
export type AgentTool = {
  description: string;
  inputSchema: z.ZodType;
  execute: (input: never) => unknown | Promise<unknown>;
};

export type ToolSet = Record<string, AgentTool>;

/** Ties `execute`'s input type to the schema that produces it. */
export function tool<Schema extends z.ZodType>(definition: {
  description: string;
  inputSchema: Schema;
  execute: (input: z.output<Schema>) => unknown | Promise<unknown>;
}): AgentTool {
  return definition as AgentTool;
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

function chatModel(
  config: OpenRouterConfig,
  options: { maxTokens: number; temperature?: number },
) {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    maxTokens: options.maxTokens,
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
    configuration: { baseURL: config.baseURL },
  });
}

function toOpenAiTools(tools: ToolSet) {
  return Object.entries(tools).map(([name, definition]) => ({
    type: "function" as const,
    function: {
      name,
      description: definition.description,
      parameters: z.toJSONSchema(definition.inputSchema),
    },
  }));
}

function userMessage(user: string, images?: AiImage[]) {
  return new HumanMessage({
    content:
      images && images.length > 0
        ? [
            { type: "text" as const, text: user },
            ...images.map((image) => ({
              type: "image_url" as const,
              // `detail` reached this file for years and was silently dropped
              // by the old SDK's message type, so every still went at the
              // provider default. Honouring it is the single cheapest token
              // cut in the codebase: low detail is a fixed small cost per
              // image instead of thousands of tokens.
              image_url: {
                url: image.url,
                ...(image.detail ? { detail: image.detail } : {}),
              },
            })),
          ]
        : user,
  });
}

function messageText(content: MessageContent) {
  if (typeof content === "string") return content;
  return content
    .map((block) => ("text" in block ? String(block.text) : ""))
    .join("");
}

/**
 * One line per model request, because "we send how many tokens?" was
 * unanswerable until it was asked from a dashboard with no attribution.
 * `cachedInput` is the part of `input` the provider served from its prompt
 * cache — the loop's repeated prefix should show up there, and a run where it
 * stays 0 is a run paying full price for the same payload every turn.
 */
function logUsage(label: string, message: AIMessage, model?: string) {
  const usage = message.usage_metadata as
    | {
        input_tokens?: number;
        output_tokens?: number;
        input_token_details?: { cache_read?: number };
      }
    | undefined;
  if (!usage) return;
  console.log("[ai-usage]", {
    label,
    ...(model ? { model } : {}),
    input: usage.input_tokens,
    cachedInput: usage.input_token_details?.cache_read ?? 0,
    output: usage.output_tokens,
  });
}

/**
 * Ceiling on one tool result as carried in the transcript. Every turn after a
 * tool call re-sends that result, so an unbounded one is billed once per
 * remaining step. Sized above the largest legitimate result (the point cloud,
 * ~45K chars) — this is a guard against the pathological, not a trim of the
 * normal.
 */
const MAX_TOOL_RESULT_CHARS = 60_000;

function finishReasonOf(message: AIMessage) {
  const reason = (
    message.response_metadata as Record<string, unknown> | undefined
  )?.finish_reason;
  // The wire says "tool_calls"; report "tool-calls" so error messages read the
  // same as they always have.
  return typeof reason === "string" ? reason.replace(/_/g, "-") : "unknown";
}

export async function runOpenAiAgent<T>({
  system,
  user,
  images,
  tools,
  schema,
  maxSteps,
  maxTokens,
  apiKey,
  label = "agent",
}: {
  system: string;
  user: string;
  /**
   * Sent alongside `user` in the opening message, so the model can look at the
   * thing it is reasoning about rather than only at numbers derived from it.
   */
  images?: AiImage[];
  tools: ToolSet;
  /** Constrains the model's final answer rather than validating it afterwards. */
  schema: z.ZodType<T>;
  maxSteps: number;
  maxTokens: number;
  /** See AiJsonRequest.apiKey. */
  apiKey?: string | null;
  /** Names this caller in the `[ai-usage]` log lines. */
  label?: string;
}): Promise<AgentResult<T>> {
  const config = resolveOpenRouterConfig(apiKey);
  if (!config) throw new Error("AI is not configured");

  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error("AI maxTokens must be a positive integer");
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new Error("AI maxSteps must be a positive integer");
  }

  const openAiTools = toOpenAiTools(tools);
  // Asking for free-form JSON and validating at the far end meant any deviation
  // surfaced as an opaque failure with nothing to debug. Handing the schema to
  // the provider makes the shape a constraint instead.
  const responseFormat = {
    type: "json_schema" as const,
    json_schema: { name: "report", schema: z.toJSONSchema(schema) },
  };

  const agentModel = chatModel(config, { maxTokens }).bindTools(openAiTools, {
    response_format: responseFormat,
  });
  // Tools kept in the request so the transcript's tool calls stay resolvable,
  // while `none` forbids another one. Double the room to write: this call
  // exists because the first run hit a ceiling.
  const finishModel = chatModel(config, {
    maxTokens: maxTokens * 2,
  }).bindTools(openAiTools, {
    tool_choice: "none",
    response_format: responseFormat,
  });

  const AgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (left, right) => left.concat(right),
      default: () => [],
    }),
    /** Model turns taken, the same count `stepCountIs` used to cap. */
    steps: Annotation<number>({
      reducer: (left, right) => left + right,
      default: () => 0,
    }),
    toolCalls: Annotation<AgentToolCall[]>({
      reducer: (left, right) => left.concat(right),
      default: () => [],
    }),
    output: Annotation<T | undefined>({
      reducer: (_left, right) => right,
      default: () => undefined,
    }),
  });

  const lastAiMessage = (messages: BaseMessage[]) => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message instanceof AIMessage) return message;
    }
    throw new Error("agent transcript has no model turn");
  };

  const graph = new StateGraph(AgentState)
    .addNode("agent", async (state) => {
      const response = await agentModel.invoke(state.messages);
      logUsage(`${label}#step${state.steps + 1}`, response);
      return { messages: [response], steps: 1 };
    })
    .addNode("tools", async (state) => {
      const request = lastAiMessage(state.messages);
      const messages: BaseMessage[] = [];
      const toolCalls: AgentToolCall[] = [];
      for (const call of request.tool_calls ?? []) {
        const definition = tools[call.name];
        if (!definition) throw new Error(`model called unknown tool ${call.name}`);
        const input = definition.inputSchema.parse(call.args);
        const output = await definition.execute(input as never);
        toolCalls.push({ tool: call.name, input, output });
        const serialized = JSON.stringify(output) ?? "null";
        messages.push(
          new ToolMessage({
            tool_call_id: call.id ?? call.name,
            content:
              serialized.length > MAX_TOOL_RESULT_CHARS
                ? `${serialized.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated: result exceeded ${MAX_TOOL_RESULT_CHARS} characters]`
                : serialized,
          }),
        );
      }
      return { messages, toolCalls };
    })
    .addNode("extract", (state) => {
      const answer = lastAiMessage(state.messages);
      return { output: schema.parse(JSON.parse(messageText(answer.content))) };
    })
    // A run that ends on a tool call (the step ceiling) or mid-sentence (the
    // token ceiling) never produced the schema-shaped answer, and failing the
    // whole analysis then says nothing about the transcript that produced it.
    // Ask once more with everything gathered so far, tools closed off and room
    // to write: that final answer is what the ceilings were always meant to
    // yield.
    .addNode("finalize", async (state) => {
      const firstStop = (() => {
        const last = lastAiMessage(state.messages);
        return last.tool_calls?.length ? "tool-calls" : finishReasonOf(last);
      })();
      const nudge = new HumanMessage(
        "Stop gathering evidence and answer now, using only what you have already looked at.",
      );
      const answer = await finishModel.invoke([...state.messages, nudge]);
      logUsage(`${label}#finalize`, answer);
      if (finishReasonOf(answer) !== "stop") {
        throw new Error(
          `the model stopped early (${firstStop}, then ${finishReasonOf(answer)}) without producing a report`,
        );
      }
      return {
        messages: [nudge, answer],
        steps: 1,
        output: schema.parse(JSON.parse(messageText(answer.content))),
      };
    })
    .addEdge(START, "agent")
    .addConditionalEdges(
      "agent",
      (state) => {
        const last = lastAiMessage(state.messages);
        if (last.tool_calls?.length) return "tools";
        return finishReasonOf(last) === "stop" ? "extract" : "finalize";
      },
      ["tools", "extract", "finalize"],
    )
    // The capped turn's tools still run before the forced answer, so the model
    // reports on everything it asked for rather than on a dangling request.
    .addConditionalEdges(
      "tools",
      (state) => (state.steps >= maxSteps ? "finalize" : "agent"),
      ["agent", "finalize"],
    )
    .addEdge("extract", END)
    .addEdge("finalize", END)
    .compile();

  try {
    const result = await graph.invoke(
      {
        messages: [new SystemMessage(system), userMessage(user, images)],
      },
      // Each model turn crosses at most two nodes; the slack covers the
      // bookkeeping nodes so the graph's own limit can never fire before ours.
      { recursionLimit: maxSteps * 2 + 8 },
    );
    return {
      output: result.output as T,
      toolCalls: result.toolCalls,
      steps: result.steps,
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
  apiKey,
  model,
  label = "json",
}: AiJsonRequest) {
  const config = resolveOpenRouterConfig(apiKey, model);
  if (!config) throw new Error("AI is not configured");

  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error("AI maxTokens must be a positive integer");
  }
  if (
    temperature !== undefined &&
    (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    throw new Error("AI temperature must be between 0 and 2");
  }

  // Matches with or without an OpenRouter `provider/` prefix.
  const isGpt5 = /(?:^|\/)gpt-5(?:[.-]|$)/i.test(config.model);
  const chat = chatModel(config, {
    maxTokens,
    ...(temperature === undefined || isGpt5 ? {} : { temperature }),
  });

  const messages = [
    new SystemMessage(system),
    userMessage(user, image ? [image] : undefined),
  ];
  try {
    let result;
    try {
      result = await chat.invoke(messages, {
        response_format: { type: "json_object" },
      });
    } catch (formatError) {
      // `json_object` is an OpenAI-ism. Plenty of the models the catalog can
      // now route to reject the parameter outright, and before this retry
      // that rejection silently became the canned fallback reply — the worst
      // answer in the codebase, dressed up as a working feature. Ask once
      // more with no format constraint and salvage the JSON from the prose.
      console.warn(`[ai] ${label}: retrying without response_format`, {
        error:
          formatError instanceof Error ? formatError.message : "unknown error",
      });
      result = await chat.invoke(messages);
    }
    logUsage(label, result, config.model);
    // A model that ran out of room mid-object leaves JSON that cannot parse,
    // and the caller's catch-all turns that into a canned reply. Name the
    // real cause here: "invalid JSON" sends whoever reads the log hunting a
    // formatting bug that does not exist.
    if (finishReasonOf(result) === "length") {
      throw new Error(
        `Model output hit the ${maxTokens}-token ceiling before finishing its JSON`,
      );
    }
    const output = extractJsonObject(messageText(result.content));
    return JSON.stringify(output);
  } catch (error) {
    throw new Error(`Model request failed: ${describeProviderError(error)}`);
  }
}

/**
 * The JSON an instruction-following model actually sends: sometimes bare,
 * sometimes wrapped in markdown fences, sometimes introduced by a sentence.
 * Take everything between the first `{` and the last `}` and insist it parse.
 */
function extractJsonObject(text: string): object {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("AI provider returned invalid JSON");
  }
  const output: unknown = JSON.parse(text.slice(start, end + 1));
  if (!output || typeof output !== "object") {
    throw new Error("AI provider returned invalid JSON");
  }
  return output;
}
