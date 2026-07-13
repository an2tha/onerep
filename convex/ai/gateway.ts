import { env } from "../_generated/server";

export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
export const AI_GATEWAY_CHAT_URL = `${AI_GATEWAY_BASE_URL}/chat/completions`;
export const DEFAULT_AI_GATEWAY_MODEL = "openai/gpt-5.4-mini";

type GatewayImage = {
  url: string;
  detail?: "auto" | "low" | "high";
};

type GatewayJsonRequest = {
  system: string;
  user: string;
  image?: GatewayImage;
  maxTokens: number;
  temperature?: number;
};

export function hasGatewayApiKey() {
  return Boolean(env.AI_GATEWAY_API_KEY?.trim());
}

export async function requestGatewayJson({
  system,
  user,
  image,
  maxTokens,
  temperature,
}: GatewayJsonRequest) {
  const apiKey = env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) throw new Error("AI Gateway is not configured");

  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error("AI Gateway maxTokens must be a positive integer");
  }
  if (
    temperature !== undefined &&
    (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    throw new Error("AI Gateway temperature must be between 0 and 2");
  }

  const configuredModel = env.AI_GATEWAY_MODEL?.trim();
  const model = configuredModel || DEFAULT_AI_GATEWAY_MODEL;
  const isGpt5 = /(?:^|\/)gpt-5(?:[.-]|$)/i.test(model);

  const response = await fetch(AI_GATEWAY_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      // GPT-5 models reject custom temperature values and use the newer
      // completion-token field through the OpenAI-compatible Gateway API.
      ...(temperature === undefined || isGpt5 ? {} : { temperature }),
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: image
            ? [
                { type: "text", text: user },
                {
                  type: "image_url",
                  image_url: {
                    url: image.url,
                    detail: image.detail ?? "auto",
                  },
                },
              ]
            : user,
        },
      ],
    }),
  });

  if (!response.ok) {
    const requestId =
      response.headers.get("x-vercel-id") ??
      response.headers.get("x-request-id");
    let gatewayMessage = "";
    try {
      const errorBody = (await response.json()) as {
        error?: { message?: unknown; param?: unknown };
      };
      const message =
        typeof errorBody.error?.message === "string"
          ? errorBody.error.message.trim().slice(0, 300)
          : "";
      const param =
        typeof errorBody.error?.param === "string"
          ? errorBody.error.param.trim().slice(0, 80)
          : "";
      gatewayMessage = message
        ? `: ${message}${param ? ` (parameter: ${param})` : ""}`
        : "";
    } catch {
      // Some providers return an empty or non-JSON error response.
    }
    throw new Error(
      `AI Gateway request failed (${response.status})${gatewayMessage}${requestId ? ` · request ${requestId.slice(0, 100)}` : ""}`,
    );
  }
  let rawData: unknown;
  try {
    rawData = await response.json();
  } catch {
    throw new Error("AI Gateway returned an invalid response");
  }
  if (!rawData || typeof rawData !== "object") {
    throw new Error("AI Gateway returned an invalid response");
  }
  const data = rawData as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null; refusal?: string | null };
    }>;
  };

  const choice = data.choices?.[0];
  if (choice?.message?.refusal)
    throw new Error("AI Gateway refused the request");
  if (choice?.finish_reason === "length") {
    throw new Error("AI Gateway response exceeded the output limit");
  }
  if (choice?.finish_reason === "content_filter") {
    throw new Error("AI Gateway blocked the response");
  }

  const rawContent = choice?.message?.content;
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  if (!content) throw new Error("AI Gateway returned no content");

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
  } catch {
    throw new Error("AI Gateway returned invalid JSON");
  }

  return content;
}
