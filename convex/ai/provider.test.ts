import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_OPENAI_MODEL,
  hasOpenAiApiKey,
  OPENAI_BASE_URL,
  requestOpenAiJson,
} from "./provider";
import { promptTemplates, renderSystemPrompt } from "./prompts.generated";

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;
const aiDirectory = dirname(fileURLToPath(import.meta.url));

function restoreEnv(name: "OPENAI_API_KEY" | "OPENAI_MODEL", value?: string) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("OPENAI_API_KEY", originalApiKey);
  restoreEnv("OPENAI_MODEL", originalModel);
});

describe("direct OpenAI provider", () => {
  test("uses the direct OpenAI API and a hot-swappable model", () => {
    process.env.OPENAI_API_KEY = "  openai-secret  ";
    process.env.OPENAI_MODEL = "gpt-5.4-mini";

    expect(hasOpenAiApiKey()).toBe(true);
    expect(OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-5.4-mini");
  });

  test("rejects missing credentials and invalid generation settings", async () => {
    process.env.OPENAI_API_KEY = "   ";
    expect(hasOpenAiApiKey()).toBe(false);
    await expect(
      requestOpenAiJson({ system: "s", user: "u", maxTokens: 1 }),
    ).rejects.toThrow("OpenAI is not configured");

    process.env.OPENAI_API_KEY = "openai-secret";
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
