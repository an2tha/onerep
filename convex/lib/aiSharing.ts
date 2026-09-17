/** Increment when recipients or the scope of sharing changes; never infer consent. */
export const AI_SHARING_VERSION = 2;
export const AI_SHARING_RECIPIENTS =
  "OpenRouter, which sends requests to Microsoft Azure (hosting the Default OpenAI model) or Venice (Uncensored model).";
export const AI_SHARING_DATA =
  "Your messages and conversation history; photos, images, or imported text you submit; and relevant profile details (including age, height, dietary preferences, and injuries or limitations you enter), goals, food, workout, body measurement, sleep, recovery, and connected health data. Form analysis may include selected video frames and movement measurements.";
export const AI_SHARING_PURPOSE =
  "These services process this data to generate AI answers, estimates, plans, and reviews, including scheduled reviews you enable. AI is optional: manual tracking works without it.";
export function hasAiSharingConsent(
  consent?: { granted: boolean; version: number } | null,
) {
  return consent?.granted === true && consent.version === AI_SHARING_VERSION;
}
