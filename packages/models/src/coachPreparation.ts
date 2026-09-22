/** A read-only snapshot prepared before the coach's full answer. */
export type CoachPreparation = {
  id: "nutrition_targets" | "recent_training" | "saved_meals";
  title: string;
  detail: string;
  rows: Array<{ label: string; value: string }>;
};

export type JevHandoffReason =
  | "prepared"
  | "needs_reasoning"
  | "uncertain"
  | "no_matching_ui"
  | "timeout"
  | "error"
  | "unavailable";

/** Every Jev outcome is terminal. The next stage is always Luna. */
export type JevHandoff = {
  state: "handoff";
  reason: JevHandoffReason;
  elapsedMs: number;
  preparation: CoachPreparation | null;
};
