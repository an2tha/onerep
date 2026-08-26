/**
 * The youngest account OneRep will create.
 *
 * Sixteen because that is what the Terms and the privacy policy say, and
 * because the GDPR floor for consenting to processing without a guardian is
 * sixteen in Germany, where OneRep is operated. It lived in three places at
 * three different numbers — a signup checkbox saying thirteen, an onboarding
 * stepper clamping to thirteen, and Terms promising sixteen — which is the
 * arrangement that gets an age rating queried in review. One constant, shared
 * by the app and the server, so the next person to disagree with it has to do
 * so on purpose.
 */
export const MINIMUM_AGE = 16;

export type OnboardingGoal = "lose" | "build" | "health" | "performance";

export interface OnboardingProfile {
  userId: string;
  age: number;
  heightCm: number;
  goal: OnboardingGoal;
  updatedAt: Date;
}
