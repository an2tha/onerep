import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_OPENROUTER_MODEL,
  hasOpenAiApiKey,
  OPENROUTER_BASE_URL,
  requestOpenAiJson,
} from "./provider";
import { promptTemplates, renderSystemPrompt } from "./prompts.generated";

type EnvName =
  | "OPENAI_API_KEY"
  | "OPENAI_MODEL"
  | "OPENROUTER_API_KEY"
  | "OPENROUTER_MODEL"
  | "AI_PROCESSOR_APPROVED";

const originalEnv: Record<EnvName, string | undefined> = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  AI_PROCESSOR_APPROVED: process.env.AI_PROCESSOR_APPROVED,
};
const aiDirectory = dirname(fileURLToPath(import.meta.url));

function restoreEnv(name: EnvName, value?: string) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const name of Object.keys(originalEnv) as EnvName[]) {
    restoreEnv(name, originalEnv[name]);
  }
});

describe("OpenRouter provider", () => {
  test("routes through OpenRouter with a hot-swappable model", () => {
    process.env.OPENROUTER_API_KEY = "  openrouter-secret  ";
    process.env.AI_PROCESSOR_APPROVED = "true";

    expect(hasOpenAiApiKey()).toBe(true);
    expect(OPENROUTER_BASE_URL).toBe("https://openrouter.ai/api/v1");
    // OpenRouter model ids carry a `provider/` prefix that is part of the id
    // and must not be stripped.
    expect(DEFAULT_OPENROUTER_MODEL).toContain("/");
  });

  test("never accepts a direct OpenAI key for OpenRouter", () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENAI_API_KEY = "openai-secret";
    process.env.AI_PROCESSOR_APPROVED = "true";
    expect(hasOpenAiApiKey()).toBe(false);
  });

  test("rejects missing credentials and invalid generation settings", async () => {
    process.env.OPENROUTER_API_KEY = "   ";
    process.env.OPENAI_API_KEY = "   ";
    process.env.AI_PROCESSOR_APPROVED = "true";
    expect(hasOpenAiApiKey()).toBe(false);
    await expect(
      requestOpenAiJson({ system: "s", user: "u", maxTokens: 1 }),
    ).rejects.toThrow("not configured");

    process.env.OPENROUTER_API_KEY = "openrouter-secret";
    process.env.AI_PROCESSOR_APPROVED = "true";
    await expect(
      requestOpenAiJson({ system: "s", user: "u", maxTokens: 0 }),
    ).rejects.toThrow("positive integer");
    await expect(
      requestOpenAiJson({
        system: "s",
        user: "u",
        maxTokens: 1,
        temperature: 3,
      }),
    ).rejects.toThrow("between 0 and 2");
  });
});

describe("AI prompt bundle", () => {
  test("contains every YAML prompt and renders trusted template values", () => {
    const expectedIds = [
      "coach_advice",
      "coach_chat",
      "coach_in_workout",
      "coach_weekly_review",
      "food_match",
      "form_coach",
      "meal_description",
      "meal_image",
      "metric_selection",
      "workout_log",
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
