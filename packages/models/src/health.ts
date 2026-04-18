export type BiologicalSex = "male" | "female";

export type ActivityLevel =
  | "sedentary"       // little/no exercise
  | "lightly_active"  // 1-3 days/week
  | "moderately_active" // 3-5 days/week
  | "very_active"     // 6-7 days/week
  | "extra_active";   // physical job + daily exercise

export type Goal = "lose" | "maintain" | "gain";

export interface UserHealthProfile {
  userId: string;
  sex: BiologicalSex;
  age: number;           // years
  weightKg: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  updatedAt: Date;
}

export interface CaloricGoals {
  bmr: number;           // basal metabolic rate
  tdee: number;          // total daily energy expenditure
  targetCalories: number; // adjusted for goal
  protein: number;       // grams
  carbs: number;         // grams
  fat: number;           // grams
}
