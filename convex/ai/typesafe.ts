import { env } from "../_generated/server";

export type JevQuestion =
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "score"; instructions: unknown; criteria: string[] }
  | { type: "noul"; instructions: unknown };
export type JevAnswer =
  | {
      type: "choice";
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    }
  | { type: "score"; score: number; confidence: number }
  | { type: "noul"; noul: number };

/** Direct TypeSafe System One API. Never uses or forwards an OpenRouter key. */
export async function requestJev(
  state: unknown,
  questions: Record<string, JevQuestion>
): Promise<Record<string, JevAnswer>> {
  const key = env.TYPESAFE_API_KEY?.trim();
  if (!key || env.AI_PROCESSOR_APPROVED?.trim() !== "true")
    throw new Error("TypeSafe AI is not configured. Your answers are kept.");
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.TYPESAFE_MODEL?.trim() || "jev-latest",
      state,
      questions,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429 || response.status === 529
        ? "TypeSafe AI is busy. Your answers are kept. Try again shortly."
        : "TypeSafe AI could not complete this request. Your answers are kept. Try again."
    );
  const body = (await response.json()) as {
    answers?: Record<string, JevAnswer>;
  };
  const answers = body.answers;
  if (
    !answers ||
    Object.keys(questions).some((id) => {
      const answer = answers[id],
        question = questions[id];
      if (!answer || answer.type !== question.type) return true;
      if (answer.type === "noul")
        return (
          !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1
        );
      if (
        !Number.isFinite(answer.confidence) ||
        answer.confidence < 0 ||
        answer.confidence > 1
      )
        return true;
      if (answer.type === "choice" && question.type === "choice")
        return (
          !(answer.choice in question.criteria) ||
          !answer.probabilities ||
          Object.entries(answer.probabilities).some(
            ([key, value]) =>
              !(key in question.criteria) ||
              !Number.isFinite(value) ||
              value < 0 ||
              value > 1
          )
        );
      return (
        answer.type === "score" &&
        question.type === "score" &&
        (!Number.isFinite(answer.score) ||
          answer.score < 0 ||
          answer.score > question.criteria.length - 1)
      );
    })
  )
    throw new Error(
      "TypeSafe AI returned an incomplete decision. Your answers are kept. Try again."
    );
  return answers;
}
