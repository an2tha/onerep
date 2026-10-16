import { z } from "zod";

const text = z.string().trim().min(1).max(1200);
const short = z.string().trim().min(1).max(160);
export const coachCenterKind = z.enum(["review", "progress", "plan", "meals"]);
export type CoachCenterKind = z.infer<typeof coachCenterKind>;
export const coachCenterContent = z
  .object({
    title: short,
    summary: text,
    observations: z.array(z.object({ title: short, detail: text })).max(6),
    nextSteps: z.array(text).max(5),
    limitations: z.array(text).max(5),
    sessions: z
      .array(
        z.object({
          day: short,
          title: short,
          durationMinutes: z.number().int().min(5).max(180),
          exercises: z
            .array(
              z.object({
                name: short,
                sets: z.number().int().min(1).max(10),
                reps: short,
                restSeconds: z.number().int().min(0).max(600),
                note: text,
              }),
            )
            .min(1)
            .max(10),
        }),
      )
      .max(7),
    meals: z
      .array(
        z.object({
          name: short,
          meal: short,
          minutes: z.number().int().min(1).max(240),
          ingredients: z.array(short).min(1).max(20),
          steps: z.array(text).min(1).max(12),
        }),
      )
      .max(7),
  })
  .strict();
export type CoachCenterContent = z.infer<typeof coachCenterContent>;
export type CoachCenterResult = {
  kind: CoachCenterKind;
  today: string;
  createdAt: number;
  content: CoachCenterContent;
  series?: Array<{
    title: string;
    unit: string;
    points: Array<{ date: string; value: number }>;
  }>;
  activity: Array<{ date: string; sessions: number }>;
};
