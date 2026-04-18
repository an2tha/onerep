export type SetType = "working" | "warmup" | "failure" | "myoreps" | "drop";

export interface WorkoutSet {
  id: string;
  type: SetType;
  weight: string; // stored in kg
  reps: string;
  leftReps: string;
  rightReps: string;
  rpe: string;
  restSeconds: number;
}

export interface ExerciseState {
  sets: WorkoutSet[];
  trackRpe: boolean;
  trackUnilateral: boolean;
}

export type PresetItem =
  | { kind: "solo"; exerciseId: string }
  | { kind: "superset"; id: string; color: string; exerciseIds: string[] };

export interface Preset {
  userId: string;
  name: string;
  items: PresetItem[];
  exerciseData: Record<string, ExerciseState>;
  focus?: "strength" | "cardio" | "mobility";
  duration?: string;
  steps?: string[];
  createdAt: Date;
  updatedAt: Date;
}
