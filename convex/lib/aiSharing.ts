/** Disclosure version recorded when a user changes their AI sharing preference. */
export const AI_SHARING_VERSION = 4;
export const AI_SHARING_RECIPIENTS =
  "TypeSafe AI (Jev) selects guided workout questions. OpenRouter evaluates the answers and generates the final preset. OpenRouter, which sends requests to Microsoft Azure (hosting the Default OpenAI model) or Venice (Uncensored model).";
export const AI_SHARING_DATA =
  "Your messages and conversation history; photos, images, or imported text you submit; and relevant profile details (including age, height, dietary preferences, and injuries or limitations you enter), goals, food, workout, body measurement, sleep, recovery, and connected health data. Form analysis may include selected video frames and movement measurements.";
export const AI_SHARING_PURPOSE =
  "These services process this data to generate AI answers, estimates, plans, and reviews, including scheduled reviews you enable. AI is optional: manual tracking works without it.";
/** AI is on by default. An explicit opt-out always takes precedence. */
export function isAiSharingEnabled(
  preference?: { granted: boolean; version: number } | null,
) {
  return preference?.granted !== false;
}
