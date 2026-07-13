import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_GATEWAY_CHAT_URL,
  DEFAULT_AI_GATEWAY_MODEL,
  hasGatewayApiKey,
  requestGatewayJson,
} from "./gateway";
import { promptTemplates, renderSystemPrompt } from "./prompts.generated";

const originalApiKey = process.env.AI_GATEWAY_API_KEY;
const originalModel = process.env.AI_GATEWAY_MODEL;
const originalFetch = globalThis.fetch;
const aiDirectory = dirname(fileURLToPath(import.meta.url));

function restoreEnv(
  name: "AI_GATEWAY_API_KEY" | "AI_GATEWAY_MODEL",
  value?: string,
) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("AI_GATEWAY_API_KEY", originalApiKey);
  restoreEnv("AI_GATEWAY_MODEL", originalModel);
  globalThis.fetch = originalFetch;
});

describe("AI Gateway REST client", () => {
  test("uses the Gateway endpoint, trimmed credentials, and default model", async () => {
    process.env.AI_GATEWAY_API_KEY = "  gateway-secret  ";
    process.env.AI_GATEWAY_MODEL = "   ";
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '  {"ok":true}  ' },
            },
          ],
        }),
      );
    };

    expect(hasGatewayApiKey()).toBe(true);
    await expect(
      requestGatewayJson({
        system: "System prompt",
        user: "User prompt",
        maxTokens: 500,
        temperature: 0.2,
      }),
    ).resolves.toBe('{"ok":true}');

    expect(capturedUrl).toBe(AI_GATEWAY_CHAT_URL);
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers).toEqual({
      Authorization: "Bearer gateway-secret",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toEqual({
      model: DEFAULT_AI_GATEWAY_MODEL,
      stream: false,
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: "User prompt" },
      ],
    });
  });

  test("sends image input using the OpenAI-compatible multimodal shape", async () => {
    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_MODEL = " openai/gpt-5.4-mini-2026-03-17 ";
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"reply":"Looks good"}' } }],
        }),
      );
    };

    await requestGatewayJson({
      system: "Inspect the image",
      user: "What is this?",
      image: { url: "data:image/jpeg;base64,YQ==" },
      maxTokens: 800,
    });

    expect(body?.model).toBe("openai/gpt-5.4-mini-2026-03-17");
    expect(body?.messages).toEqual([
      { role: "system", content: "Inspect the image" },
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/jpeg;base64,YQ==",
              detail: "auto",
            },
          },
        ],
      },
    ]);
  });

  test("rejects invalid configuration and incomplete structured output", async () => {
    process.env.AI_GATEWAY_API_KEY = "   ";
    expect(hasGatewayApiKey()).toBe(false);
    await expect(
      requestGatewayJson({ system: "s", user: "u", maxTokens: 1 }),
    ).rejects.toThrow("AI Gateway is not configured");

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    await expect(
      requestGatewayJson({ system: "s", user: "u", maxTokens: 0 }),
    ).rejects.toThrow("positive integer");
    await expect(
      requestGatewayJson({
        system: "s",
        user: "u",
        maxTokens: 1,
        temperature: 3,
      }),
    ).rejects.toThrow("between 0 and 2");

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            { finish_reason: "length", message: { content: '{"partial":' } },
          ],
        }),
      );
    await expect(
      requestGatewayJson({ system: "s", user: "u", maxTokens: 1 }),
    ).rejects.toThrow("exceeded the output limit");

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "[]" } }] }),
      );
    await expect(
      requestGatewayJson({ system: "s", user: "u", maxTokens: 1 }),
    ).rejects.toThrow("invalid JSON");
  });
});

describe("AI prompt bundle", () => {
  test("contains every YAML prompt and renders trusted template values", () => {
    const expectedIds = [
      "coach_advice",
      "coach_chat",
      "food_match",
      "meal_description",
      "meal_image",
      "metric_selection",
      "workout_preset",
    ];
    const yamlIds = readdirSync(resolve(aiDirectory, "prompts"))
      .filter((filename) => filename.endsWith(".yaml"))
      .map((filename) => {
        const source = readFileSync(
          resolve(aiDirectory, "prompts", filename),
          "utf8",
        );
        return source.match(/^id:\s*([a-z][a-z0-9_]*)\s*$/m)?.[1];
      })
      .sort();

    expect(yamlIds).toEqual(expectedIds);
    expect(Object.keys(promptTemplates).sort()).toEqual(expectedIds);
    const workoutPrompt = renderSystemPrompt("workout_preset", {
      max_exercises: 18,
      max_sets_per_exercise: 8,
    });
    expect(workoutPrompt).toContain("Limit output to 18 exercises");
    expect(workoutPrompt).toContain("8 sets per exercise");
    expect(workoutPrompt).not.toMatch(/\{\{[^}]+\}\}/);
    expect(() => renderSystemPrompt("workout_preset")).toThrow(
      "Missing prompt variable max_exercises for workout_preset",
    );
    expect(renderSystemPrompt("coach_chat")).toContain(
      "durable first-person coaching preference",
    );
  });

  test("keeps provider calls and system prompt text centralized", () => {
    const callers = [
      resolve(aiDirectory, "metricGeneration.ts"),
      resolve(aiDirectory, "../logs/presetAgent.ts"),
      resolve(aiDirectory, "../logs/snap.ts"),
    ];
    for (const filename of callers) {
      const source = readFileSync(filename, "utf8");
      expect(source).not.toContain("api.openai.com");
      expect(source).not.toMatch(/role:\s*["']system["']/);
    }
  });
});
