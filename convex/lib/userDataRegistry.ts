import type { TableNamesInDataModel } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

export type UserDataClassification =
  | "directly_user_owned"
  | "dependent_on_user_content"
  | "global_non_user_data"
  | "legally_retained_billing_or_audit";

/**
 * Security boundary for deletion/export reviews. `satisfies Record<...>` is
 * intentional: adding any schema table fails compilation until it is assigned
 * a data lifecycle here.
 */
export const userDataRegistry = {
  userPreferences: "directly_user_owned",
  recipes: "directly_user_owned",
  recipeCommunityShareEvents: "dependent_on_user_content",
  recipeReports: "dependent_on_user_content",
  recipeRatings: "dependent_on_user_content",
  mealPresets: "directly_user_owned",
  customFoods: "directly_user_owned",
  mealPrepBatches: "directly_user_owned",
  fastingSessions: "directly_user_owned",
  groceryLists: "directly_user_owned",
  diaryShares: "directly_user_owned",
  diaryComments: "dependent_on_user_content",
  diaryCommentReads: "dependent_on_user_content",
  walkthroughProgress: "directly_user_owned",
  onboardingProfiles: "directly_user_owned",
  healthProfiles: "directly_user_owned",
  presets: "directly_user_owned",
  schedules: "directly_user_owned",
  workoutLogs: "directly_user_owned",
  healthWorkouts: "directly_user_owned",
  healthMetrics: "directly_user_owned",
  foodLogs: "directly_user_owned",
  waterLogs: "directly_user_owned",
  supplementLogs: "directly_user_owned",
  supplementItems: "directly_user_owned",
  supplementIntakeLogs: "directly_user_owned",
  bodyMeasurements: "directly_user_owned",
  customProgressMetrics: "directly_user_owned",
  customProgressMetricEntries: "dependent_on_user_content",
  dashboardWidgets: "directly_user_owned",
  foodSourceCache: "global_non_user_data",
  exercises: "directly_user_owned",
  customExercises: "directly_user_owned",
  dailyCheckIns: "directly_user_owned",
  momentEvents: "directly_user_owned",
  restDays: "directly_user_owned",
  weeklyTargets: "directly_user_owned",
  mcpTokens: "directly_user_owned",
  mcpOauthClients: "directly_user_owned",
  mcpAuthCodes: "directly_user_owned",
  mcpRefreshTokens: "directly_user_owned",
  coachMemories: "directly_user_owned",
  coachCheckIns: "directly_user_owned",
  coachActionEvents: "directly_user_owned",
  coachOperationRuns: "directly_user_owned",
  coachWeeklyPlans: "directly_user_owned",
  coachMonthlySummaries: "directly_user_owned",
  coachGoals: "directly_user_owned",
  coachGoalTasks: "dependent_on_user_content",
  coachUploads: "directly_user_owned",
  coachReviews: "directly_user_owned",
  coachTouches: "directly_user_owned",
  pushTokens: "directly_user_owned",
  fileUploads: "directly_user_owned",
  aiUsage: "directly_user_owned",
  aiKeys: "directly_user_owned",
  rateLimitBuckets: "directly_user_owned",
  migrationRuns: "global_non_user_data",
  snapUsage: "directly_user_owned",
  subscriptionStates: "legally_retained_billing_or_audit",
  billingSubscriptions: "legally_retained_billing_or_audit",
  billingEvents: "legally_retained_billing_or_audit",
  billingIdentities: "legally_retained_billing_or_audit",
  billingCheckouts: "legally_retained_billing_or_audit",
  activeWorkouts: "directly_user_owned",
  repeatMeals: "directly_user_owned",
  supportedExercises: "global_non_user_data",
  formCoachSessions: "directly_user_owned",
  formCoachReports: "dependent_on_user_content",
  formCoachPins: "dependent_on_user_content",
} satisfies Record<TableNamesInDataModel<DataModel>, UserDataClassification>;

export type RegisteredUserDataTable = keyof typeof userDataRegistry;
