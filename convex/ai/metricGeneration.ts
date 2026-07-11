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

type CoachAdvice = {
  label: string;
  title: string;
  detail: string;
};

type CoachAdviceResult = {
  advice: CoachAdvice[];
  source: "openai" | "fallback";
};

type CoachChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CoachUiStat = {
  label: string;
  value: string;
  detail?: string;
  trend?: "up" | "down" | "flat";
};

type CoachUiAction =
  | "open_nutrition"
  | "open_workouts"
  | "open_progress"
  | "open_settings"
  | "open_workout_builder"
  | "open_recipe_builder"
  | "log_food";

type CoachUiBlock =
  | {
      type: "card";
      label: string;
      title: string;
      detail: string;
    }
  | {
      type: "stat_group";
      title: string;
      stats: CoachUiStat[];
    }
  | {
      type: "checklist";
      title: string;
      items: Array<{ label: string; detail?: string; done?: boolean }>;
    }
  | {
      type: "action_row";
      title: string;
      actions: Array<{ label: string; action: CoachUiAction }>;
    };

type CoachChatResult = {
  reply: string;
  uiBlocks: CoachUiBlock[];
  source: "openai" | "fallback";
};

type CoachContext = {
  goal: string | null;
  experienceLevel: string | null;
  safetyMode: string;
  safetyFlags: string[];
  nutritionGuidance: string[];
  weightPaceKgPerWeek: number | null;
  weightStatus: string;
  calorieTarget: number;
  averageCalories: number;
  averageProtein: number;
  proteinTarget: number;
  proteinAdherence: number;
  calorieAccuracy: number;
  macroConsistency: number;
  workoutDays7: number;
  volumeChange7Pct: number | null;
  hardSets7: number;
  selectedExerciseName: string | null;
  selectedLiftPaceKgPerWeek: number | null;
  selectedLiftFrequency: number | null;
  dataConfidence: number;
  existingInsights: CoachAdvice[];
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

function normalizeCoachAdvice(value: unknown): CoachAdvice[] | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const rawAdvice = Array.isArray(input.advice) ? input.advice : [];
  const advice = rawAdvice
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = clampText(row.label, 28);
      const title = clampText(row.title, 86);
      const detail = clampText(row.detail, 240);
      if (!label || !title || !detail) return null;
      return { label, title, detail };
    })
    .filter((item): item is CoachAdvice => Boolean(item))
    .slice(0, 4);

  return advice.length > 0 ? advice : null;
}

function normalizeCoachUiStats(value: unknown): CoachUiStat[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = clampText(row.label, 28);
      const statValue = clampText(row.value, 28);
      if (!label || !statValue) return null;
      const trend = clampText(row.trend, 8);
      return {
        label,
        value: statValue,
        ...(clampText(row.detail, 64)
          ? { detail: clampText(row.detail, 64) }
          : {}),
        ...(trend === "up" || trend === "down" || trend === "flat"
          ? { trend }
          : {}),
      };
    })
    .filter((item): item is CoachUiStat => Boolean(item))
    .slice(0, 4);
}

function normalizeCoachUiBlocks(value: unknown): CoachUiBlock[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = clampText(row.type, 24);

      if (type === "card") {
        const label = clampText(row.label, 28);
        const title = clampText(row.title, 86);
        const detail = clampText(row.detail, 220);
        if (!label || !title || !detail) return null;
        return { type, label, title, detail };
      }

      if (type === "stat_group") {
        const title = clampText(row.title, 64);
        const stats = normalizeCoachUiStats(row.stats);
        if (!title || stats.length === 0) return null;
        return { type, title, stats };
      }

      if (type === "checklist") {
        const title = clampText(row.title, 64);
        const rawItems = Array.isArray(row.items) ? row.items : [];
        const items = rawItems
          .map((rawItem) => {
            if (!rawItem || typeof rawItem !== "object") return null;
            const checklistItem = rawItem as Record<string, unknown>;
            const label = clampText(checklistItem.label, 72);
            if (!label) return null;
            return {
              label,
              ...(clampText(checklistItem.detail, 120)
                ? { detail: clampText(checklistItem.detail, 120) }
                : {}),
              ...(typeof checklistItem.done === "boolean"
                ? { done: checklistItem.done }
                : {}),
            };
          })
          .filter(
            (
              checklistItem,
            ): checklistItem is {
              label: string;
              detail?: string;
              done?: boolean;
            } => Boolean(checklistItem),
          )
          .slice(0, 5);
        if (!title || items.length === 0) return null;
        return { type, title, items };
      }

      if (type === "action_row") {
        const title = clampText(row.title, 64);
        const rawActions = Array.isArray(row.actions) ? row.actions : [];
        const allowedActions = new Set<CoachUiAction>([
          "open_nutrition",
          "open_workouts",
          "open_progress",
          "open_settings",
          "open_workout_builder",
          "open_recipe_builder",
          "log_food",
        ]);
        const actions = rawActions
          .map((rawAction) => {
            if (!rawAction || typeof rawAction !== "object") return null;
            const actionRow = rawAction as Record<string, unknown>;
            const label = clampText(actionRow.label, 36);
            const action = clampText(actionRow.action, 32) as CoachUiAction;
            if (!label || !allowedActions.has(action)) return null;
            return { label, action };
          })
          .filter(
            (action): action is { label: string; action: CoachUiAction } =>
              Boolean(action),
          )
          .slice(0, 3);
        if (!title || actions.length === 0) return null;
        return { type, title, actions };
      }

      return null;
    })
    .filter((item): item is CoachUiBlock => Boolean(item))
    .slice(0, 4);
}

function normalizeCoachChatResponse(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const reply = clampText(input.reply, 900);
  if (!reply) return null;
  return {
    reply,
    uiBlocks: normalizeCoachUiBlocks(input.uiBlocks),
  };
}

function fallbackCoachUiBlocks(context: CoachContext): CoachUiBlock[] {
  if (context.safetyMode !== "standard" || context.safetyFlags.length > 0) {
    return [
      {
        type: "card",
        label: "Safety context",
        title: "Keep the next step conservative",
        detail:
          context.nutritionGuidance[0] ??
          "Use gradual changes and qualified guidance where your setup context calls for it.",
      },
      {
        type: "action_row",
        title: "Choose a safe next step",
        actions: [
          { label: "Workouts", action: "open_workouts" },
          { label: "Nutrition", action: "open_nutrition" },
        ],
      },
    ];
  }

  const blocks: CoachUiBlock[] = [
    {
      type: "stat_group",
      title: "Current signals",
      stats: [
        {
          label: "Calories",
          value: `${Math.round(context.averageCalories)} kcal`,
          detail: `Target ${Math.round(context.calorieTarget)}`,
          trend: "flat",
        },
        {
          label: "Protein",
          value: `${Math.round(context.averageProtein)}g`,
          detail: `Target ${Math.round(context.proteinTarget)}g`,
          trend:
            context.averageProtein >= context.proteinTarget ? "up" : "down",
        },
        {
          label: "Training",
          value: `${Math.round(context.workoutDays7)} days`,
          detail: `${Math.round(context.hardSets7)} sets`,
          trend: context.workoutDays7 >= 3 ? "up" : "flat",
        },
      ],
    },
  ];

  if (context.proteinAdherence < 75) {
    blocks.push({
      type: "checklist",
      title: "Protein reset",
      items: [
        { label: "Pick one repeatable high-protein meal" },
        { label: "Log it for the next 3 days" },
        {
          label: "Adjust calories only after protein is stable",
          detail: "This keeps the next change easier to interpret.",
        },
      ],
    });
  } else {
    blocks.push({
      type: "card",
      label: "Next step",
      title: "Keep the plan measurable",
      detail:
        "Repeat the same targets and workout exposure this week so the trend can show whether the current setup is working.",
    });
  }

  blocks.push({
    type: "action_row",
    title: "Open a tracker",
    actions: [
      { label: "Nutrition", action: "open_nutrition" },
      { label: "Workouts", action: "open_workouts" },
      { label: "Progress", action: "open_progress" },
    ],
  });

  return blocks;
}

function fallbackCoachChatResponse({
  message,
  context,
  focusInsight,
}: {
  message: string;
  context: CoachContext;
  focusInsight?: CoachAdvice;
}): Pick<CoachChatResult, "reply" | "uiBlocks"> {
  const uiBlocks = fallbackCoachUiBlocks(context);
  if (context.safetyMode !== "standard" || context.safetyFlags.length > 0) {
    return {
      reply:
        "I’ll keep your plan conservative and treat the context you shared during setup as a hard constraint. I can help with simple routines and meal structure, but I won’t prescribe aggressive calorie, fasting, or training changes where clinician guidance is more appropriate.",
      uiBlocks,
    };
  }
  if (focusInsight) {
    return {
      reply: `${focusInsight.title}: ${focusInsight.detail} Start by making this measurable for the next 7 days, then reassess before changing multiple variables at once.`,
      uiBlocks,
    };
  }
  if (context.proteinAdherence < 75) {
    return {
      reply: `The highest-leverage move is protein consistency. You're averaging ${Math.round(context.averageProtein)}g against a ${Math.round(context.proteinTarget)}g target. Aim for one repeatable protein anchor meal before changing calories or training.`,
      uiBlocks,
    };
  }
  if (
    context.volumeChange7Pct != null &&
    Math.abs(context.volumeChange7Pct) > 35
  ) {
    return {
      reply: `Your training load changed ${Math.round(context.volumeChange7Pct)}% versus the prior week. Keep the next week boring and repeatable so you can tell whether performance is adapting or just reacting to fatigue.`,
      uiBlocks,
    };
  }
  if (message.toLowerCase().includes("calorie")) {
    return {
      reply: `Use the scale trend and food accuracy together. If your average calories stay near ${Math.round(context.calorieTarget)} and weight pace is still off for 10-14 days, then adjust by a small amount instead of making a large cut or bulk change.`,
      uiBlocks,
    };
  }
  return {
    reply:
      "Pick one variable to improve this week: logging consistency, protein, or repeatable training exposure. Your next adjustment should be small enough that the trend can prove whether it worked.",
    uiBlocks,
  };
}

function fallbackCoachAdvice(context: CoachContext): CoachAdvice[] {
  const advice: CoachAdvice[] = [];
  if (context.dataConfidence < 60) {
    advice.push({
      label: "AI data check",
      title: "Improve the signal before changing the plan",
      detail:
        "Your recent data is still sparse. Add a few consistent food, body, and workout logs so coaching advice is based on trend instead of noise.",
    });
  }

  if (context.proteinAdherence < 75) {
    advice.push({
      label: "AI nutrition",
      title: "Make protein the next easy win",
      detail: `Average protein is ${Math.round(context.averageProtein)}g against a ${Math.round(context.proteinTarget)}g target. Fix this before making calorie or training-volume changes.`,
    });
  }

  if (
    context.volumeChange7Pct != null &&
    (context.volumeChange7Pct > 40 || context.volumeChange7Pct < -30)
  ) {
    advice.push({
      label: "AI workload",
      title:
        context.volumeChange7Pct > 40
          ? "Do not mistake fatigue for lost strength"
          : "Rebuild momentum with one easy session",
      detail:
        context.volumeChange7Pct > 40
          ? "Training volume jumped hard this week. Hold load steady and watch performance before adding more sets."
          : "Training volume dropped enough to weaken the trend. Pick a short session you can complete instead of waiting for a perfect day.",
    });
  }

  if (context.selectedExerciseName && context.selectedLiftFrequency != null) {
    advice.push({
      label: "AI lift focus",
      title: `Keep ${context.selectedExerciseName} measurable`,
      detail:
        context.selectedLiftFrequency < 1
          ? "It shows up less than once per week. Add a repeatable top set or backoff slot so the strength trend has enough exposures."
          : "Keep the same top-set structure for a few sessions so changes reflect strength instead of programming noise.",
    });
  }

  if (advice.length === 0) {
    advice.push({
      label: "AI next step",
      title: "Stay the course for one more week",
      detail:
        "Your core signals are coherent. Make no major target changes; focus on repeating the behaviors that produced the current trend.",
    });
  }

  return advice.slice(0, 4);
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

async function generateCoachAdviceWithOpenAI(context: CoachContext) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        (env as unknown as Record<string, string | undefined>)
          .OPENAI_COACH_MODEL ??
        env.OPENAI_METRIC_MODEL ??
        "gpt-4o-mini",
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a concise fitness progress coach. Return JSON only with 2-4 advice cards. Be specific, non-medical, and action-oriented. Treat safetyMode, safetyFlags, and nutritionGuidance as hard constraints and match complexity to experienceLevel. Never recommend aggressive deficits, fasting, maximal training, or advice that conflicts with the supplied safety context. Do not repeat the existing heuristic cards verbatim. Avoid generic motivation.",
        },
        {
          role: "user",
          content: JSON.stringify({
            context,
            responseShape: {
              advice: [
                {
                  label: "short category",
                  title: "specific headline",
                  detail: "one concrete recommendation tied to the metrics",
                },
              ],
            },
          }),
        },
      ],
      max_tokens: 650,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI coach request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return normalizeCoachAdvice(JSON.parse(content));
}

async function generateCoachChatWithOpenAI({
  context,
  message,
  history,
  focusInsight,
}: {
  context: CoachContext;
  message: string;
  history: CoachChatMessage[];
  focusInsight?: CoachAdvice;
}) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        (env as unknown as Record<string, string | undefined>)
          .OPENAI_COACH_MODEL ??
        env.OPENAI_METRIC_MODEL ??
        "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a concise fitness progress coach in a mobile app. Answer the user's coaching question with specific, non-medical, actionable guidance tied to their metrics. Treat safetyMode, safetyFlags, and nutritionGuidance as hard constraints across workout and food advice: do not recommend aggressive deficits, fasting, maximal training, or advice that conflicts with them; suggest qualified clinician input when appropriate. Match complexity to experienceLevel, using simple plans and minimal jargon for beginners. Do not re-ask for safety facts already present in context. When a beginner finishes workout or recipe setup, offer open_workout_builder or open_recipe_builder in an action_row. Return JSON only. Keep reply under 120 words. You may include 1-3 safe UI blocks using only these types: card, stat_group, checklist, action_row. Do not output HTML, JSX, markdown tables, CSS, arbitrary component names, or unknown action names. Do not claim certainty when data confidence is low.",
        },
        {
          role: "user",
          content: JSON.stringify({
            context,
            focusInsight,
            recentConversation: history.slice(-8),
            message,
            responseShape: {
              reply: "short tailored answer",
              uiBlocks: [
                {
                  type: "stat_group",
                  title: "short title",
                  stats: [
                    {
                      label: "metric label",
                      value: "display value",
                      detail: "optional short context",
                      trend: "up | down | flat",
                    },
                  ],
                },
                {
                  type: "card",
                  label: "short category",
                  title: "specific headline",
                  detail: "one recommendation tied to the metrics",
                },
                {
                  type: "checklist",
                  title: "short title",
                  items: [
                    {
                      label: "task",
                      detail: "optional short context",
                      done: false,
                    },
                  ],
                },
                {
                  type: "action_row",
                  title: "short title",
                  actions: [
                    {
                      label: "button label",
                      action:
                        "open_nutrition | open_workouts | open_progress | open_settings | open_workout_builder | open_recipe_builder | log_food",
                    },
                  ],
                },
              ],
            },
          }),
        },
      ],
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI coach chat request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return normalizeCoachChatResponse(JSON.parse(content));
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

const coachContextValidator = v.object({
  goal: v.union(v.string(), v.null()),
  experienceLevel: v.union(v.string(), v.null()),
  safetyMode: v.string(),
  safetyFlags: v.array(v.string()),
  nutritionGuidance: v.array(v.string()),
  weightPaceKgPerWeek: v.union(v.number(), v.null()),
  weightStatus: v.string(),
  calorieTarget: v.number(),
  averageCalories: v.number(),
  averageProtein: v.number(),
  proteinTarget: v.number(),
  proteinAdherence: v.number(),
  calorieAccuracy: v.number(),
  macroConsistency: v.number(),
  workoutDays7: v.number(),
  volumeChange7Pct: v.union(v.number(), v.null()),
  hardSets7: v.number(),
  selectedExerciseName: v.union(v.string(), v.null()),
  selectedLiftPaceKgPerWeek: v.union(v.number(), v.null()),
  selectedLiftFrequency: v.union(v.number(), v.null()),
  dataConfidence: v.number(),
  existingInsights: v.array(
    v.object({
      label: v.string(),
      title: v.string(),
      detail: v.string(),
    }),
  ),
});

function sanitizeCoachContext(input: CoachContext): CoachContext {
  return {
    ...input,
    goal: clampText(input.goal, 32) || null,
    experienceLevel: clampText(input.experienceLevel, 24) || null,
    safetyMode: clampText(input.safetyMode, 24) || "standard",
    safetyFlags: input.safetyFlags
      .slice(0, 16)
      .map((flag) => clampText(flag, 64))
      .filter(Boolean),
    nutritionGuidance: input.nutritionGuidance
      .slice(0, 12)
      .map((guidance) => clampText(guidance, 180))
      .filter(Boolean),
    weightStatus: clampText(input.weightStatus, 40),
    selectedExerciseName: clampText(input.selectedExerciseName, 80) || null,
    existingInsights: input.existingInsights
      .slice(0, 10)
      .map((insight) => ({
        label: clampText(insight.label, 28),
        title: clampText(insight.title, 86),
        detail: clampText(insight.detail, 240),
      }))
      .filter((insight) => insight.label && insight.title && insight.detail),
  };
}

export const generateCoachAdvice = action({
  args: {
    context: coachContextValidator,
  },
  handler: async (ctx, args): Promise<CoachAdviceResult> => {
    const user = await getAuthUser(ctx);
    const context = sanitizeCoachContext(args.context);

    await consumeAiUsageOrThrow(ctx, user._id, "progress_metrics");

    try {
      const advice = await generateCoachAdviceWithOpenAI(context);
      if (advice) return { advice, source: "openai" };
    } catch (error) {
      console.warn("Falling back to server coach advice", error);
    }

    return { advice: fallbackCoachAdvice(context), source: "fallback" };
  },
});

export const generateCoachChatMessage = action({
  args: {
    context: coachContextValidator,
    message: v.string(),
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    focusInsight: v.optional(
      v.object({
        label: v.string(),
        title: v.string(),
        detail: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<CoachChatResult> => {
    const user = await getAuthUser(ctx);
    const message = clampText(args.message, MAX_PROMPT_CHARS);
    if (message.length < 2) throw new Error("Ask a coaching question.");

    const context = sanitizeCoachContext(args.context);
    const history = args.history
      .slice(-10)
      .map((item) => ({
        role: item.role,
        content: clampText(item.content, 700),
      }))
      .filter((item) => item.content.length > 0);
    const focusInsight = args.focusInsight
      ? {
          label: clampText(args.focusInsight.label, 28),
          title: clampText(args.focusInsight.title, 86),
          detail: clampText(args.focusInsight.detail, 240),
        }
      : undefined;

    await consumeAiUsageOrThrow(ctx, user._id, "progress_metrics");

    try {
      const response = await generateCoachChatWithOpenAI({
        context,
        message,
        history,
        focusInsight,
      });
      if (response) return { ...response, source: "openai" };
    } catch (error) {
      console.warn("Falling back to server coach chat", error);
    }

    const fallback = fallbackCoachChatResponse({
      message,
      context,
      focusInsight,
    });
    return {
      ...fallback,
      source: "fallback",
    };
  },
});
