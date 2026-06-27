import { v } from "convex/values";
import { action, env } from "../_generated/server";
import { getAuthUser } from "../lib/auth";
import { consumeAiUsageOrThrow } from "./usage";

const MAX_PROMPT_CHARS = 600;
const MAX_METRICS = 80;
const MAX_KEYWORDS = 16;
const DEFAULT_MAX_RESULTS = 4;
const MAX_RESULTS = 6;

const SUBAPPS = ["dashboard", "nutrition", "progress", "workouts"] as const;
type MetricSubapp = (typeof SUBAPPS)[number];

type MetricCatalogItem = {
  id: string;
  title: string;
  group: string;
  description: string;
  keywords: string[];
};

type MetricGenerationResult = {
  metricIds: string[];
  customMetricTitle?: string;
  source: "openai" | "fallback";
};

function clampText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeMetric(value: MetricCatalogItem): MetricCatalogItem | null {
  const id = clampText(value.id, 120);
  const title = clampText(value.title, 80);
  if (!id || !title) return null;

  return {
    id,
    title,
    group: clampText(value.group, 40) || "Metric",
    description: clampText(value.description, 240),
    keywords: (value.keywords ?? [])
      .map((keyword) => clampText(keyword, 40))
      .filter(Boolean)
      .slice(0, MAX_KEYWORDS),
  };
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/\W+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function fallbackMetricIds(
  prompt: string,
  catalog: MetricCatalogItem[],
  maxResults: number,
) {
  const terms = tokenize(prompt);
  if (terms.length === 0) return catalog.slice(0, maxResults).map((m) => m.id);

  return catalog
    .map((metric) => {
      const haystack = [
        metric.title,
        metric.group,
        metric.description,
        ...metric.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return {
        id: metric.id,
        score: terms.reduce(
          (score, term) => score + (haystack.includes(term) ? 1 : 0),
          0,
        ),
      };
    })
    .filter((metric) => metric.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((metric) => metric.id);
}

function normalizeOpenAiResult(
  value: unknown,
  allowedIds: Set<string>,
  maxResults: number,
): Pick<MetricGenerationResult, "metricIds" | "customMetricTitle"> | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const metricIds = Array.isArray(input.metricIds)
    ? input.metricIds
        .map((id) => clampText(id, 120))
        .filter((id) => allowedIds.has(id))
    : [];

  const uniqueIds = Array.from(new Set(metricIds)).slice(0, maxResults);
  const customMetricTitle = clampText(input.customMetricTitle, 48);

  if (uniqueIds.length === 0 && !customMetricTitle) return null;
  return {
    metricIds: uniqueIds,
    ...(customMetricTitle ? { customMetricTitle } : {}),
  };
}

async function generateWithOpenAI({
  subapp,
  prompt,
  catalog,
  maxResults,
}: {
  subapp: MetricSubapp;
  prompt: string;
  catalog: MetricCatalogItem[];
  maxResults: number;
}) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const allowedIds = new Set(catalog.map((metric) => metric.id));
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_METRIC_MODEL ?? "gpt-4o-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You choose useful health/fitness dashboard metrics from a provided catalog. Return JSON only. Do not invent metric IDs. Prefer actionable, non-filler metrics. If the user's request cannot be represented by existing metrics, include a concise customMetricTitle.",
        },
        {
          role: "user",
          content: JSON.stringify({
            subapp,
            request: prompt,
            maxResults,
            responseShape: {
              metricIds: ["existing metric ids only"],
              customMetricTitle: "optional short custom metric name or null",
            },
            catalog,
          }),
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI metric request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  return normalizeOpenAiResult(JSON.parse(content), allowedIds, maxResults);
}

export const generateMetricSet = action({
  args: {
    subapp: v.union(
      v.literal("dashboard"),
      v.literal("nutrition"),
      v.literal("progress"),
      v.literal("workouts"),
    ),
    prompt: v.string(),
    metrics: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        group: v.string(),
        description: v.string(),
        keywords: v.array(v.string()),
      }),
    ),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MetricGenerationResult> => {
    const user = await getAuthUser(ctx);

    const prompt = args.prompt.trim().slice(0, MAX_PROMPT_CHARS);
    if (prompt.length < 2) throw new Error("Describe what you want to track.");

    const catalog = args.metrics
      .slice(0, MAX_METRICS)
      .map(normalizeMetric)
      .filter((metric): metric is MetricCatalogItem => Boolean(metric));
    const maxResults = clampInteger(
      args.maxResults,
      1,
      MAX_RESULTS,
      DEFAULT_MAX_RESULTS,
    );

    await consumeAiUsageOrThrow(ctx, user._id, "progress_metrics");

    if (catalog.length === 0) {
      return {
        metricIds: [],
        customMetricTitle: prompt.slice(0, 48),
        source: "fallback",
      };
    }

    try {
      const aiResult = await generateWithOpenAI({
        subapp: args.subapp,
        prompt,
        catalog,
        maxResults,
      });
      if (aiResult) return { ...aiResult, source: "openai" };
    } catch (error) {
      console.warn("Falling back to server metric matcher", error);
    }

    const metricIds = fallbackMetricIds(prompt, catalog, maxResults);
    if (metricIds.length > 0) return { metricIds, source: "fallback" };

    return {
      metricIds: [],
      customMetricTitle: prompt.slice(0, 48),
      source: "fallback",
    };
  },
});
