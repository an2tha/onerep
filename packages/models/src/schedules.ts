// Weekly workout schedule — maps day names to preset IDs, plus the display
// order of the preset list itself. Stored per-user on the server and also
// cached in localStorage for offline access.

export interface WorkoutSchedule {
  userId: string;
  /** day abbreviation (Mon–Sun) → presetId | null */
  routine: Record<string, string | null>;
  /** preset IDs in the user's chosen display order */
  presetOrder: string[];
  updatedAt: Date;
}
