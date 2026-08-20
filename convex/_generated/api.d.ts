/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_byok from "../ai/byok.js";
import type * as ai_coachGoals from "../ai/coachGoals.js";
import type * as ai_coachHistory from "../ai/coachHistory.js";
import type * as ai_coachOperations from "../ai/coachOperations.js";
import type * as ai_coachReviews from "../ai/coachReviews.js";
import type * as ai_coachState from "../ai/coachState.js";
import type * as ai_coachWorkspace from "../ai/coachWorkspace.js";
import type * as ai_formCoach from "../ai/formCoach.js";
import type * as ai_formCoachAgent from "../ai/formCoachAgent.js";
import type * as ai_formCoachKinematics from "../ai/formCoachKinematics.js";
import type * as ai_inWorkout from "../ai/inWorkout.js";
import type * as ai_metricGeneration from "../ai/metricGeneration.js";
import type * as ai_nudges from "../ai/nudges.js";
import type * as ai_provider from "../ai/provider.js";
import type * as ai_usage from "../ai/usage.js";
import type * as ai_weeklyReview from "../ai/weeklyReview.js";
import type * as api_rest from "../api/rest.js";
import type * as billing__private_stripeProvider from "../billing/_private/stripeProvider.js";
import type * as billing_crons from "../billing/crons.js";
import type * as billing_entitlement from "../billing/entitlement.js";
import type * as billing_provider from "../billing/provider.js";
import type * as billing_providerTypes from "../billing/providerTypes.js";
import type * as billing_public from "../billing/public.js";
import type * as billing_store from "../billing/store.js";
import type * as billing_stripe from "../billing/stripe.js";
import type * as billing_stripeState from "../billing/stripeState.js";
import type * as billing_types from "../billing/types.js";
import type * as billing_webhooks from "../billing/webhooks.js";
import type * as bodyProgress from "../bodyProgress.js";
import type * as crons from "../crons.js";
import type * as customProgressMetrics from "../customProgressMetrics.js";
import type * as dashboardWidgets from "../dashboardWidgets.js";
import type * as exercises from "../exercises.js";
import type * as food_datasource from "../food/datasource.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authEmail from "../lib/authEmail.js";
import type * as lib_bodyMeasurements from "../lib/bodyMeasurements.js";
import type * as lib_calculateCalories from "../lib/calculateCalories.js";
import type * as lib_coachWorkspaceBudget from "../lib/coachWorkspaceBudget.js";
import type * as lib_customMetricScoring from "../lib/customMetricScoring.js";
import type * as lib_customProgressMetrics from "../lib/customProgressMetrics.js";
import type * as lib_dataImport from "../lib/dataImport.js";
import type * as lib_deleteUserData from "../lib/deleteUserData.js";
import type * as lib_diaryAccess from "../lib/diaryAccess.js";
import type * as lib_estimateOnboardingCalories from "../lib/estimateOnboardingCalories.js";
import type * as lib_exerciseShape from "../lib/exerciseShape.js";
import type * as lib_fastingSessions from "../lib/fastingSessions.js";
import type * as lib_healthMetricCatalog from "../lib/healthMetricCatalog.js";
import type * as lib_healthMetrics from "../lib/healthMetrics.js";
import type * as lib_healthProfiles from "../lib/healthProfiles.js";
import type * as lib_healthScore from "../lib/healthScore.js";
import type * as lib_healthSeries from "../lib/healthSeries.js";
import type * as lib_history from "../lib/history.js";
import type * as lib_mealTargets from "../lib/mealTargets.js";
import type * as lib_memoryConsolidation from "../lib/memoryConsolidation.js";
import type * as lib_nutritionPlan from "../lib/nutritionPlan.js";
import type * as lib_nutritionValues from "../lib/nutritionValues.js";
import type * as lib_onboardingProfiles from "../lib/onboardingProfiles.js";
import type * as lib_outreach from "../lib/outreach.js";
import type * as lib_platformHealthMetrics from "../lib/platformHealthMetrics.js";
import type * as lib_programming from "../lib/programming.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_recovery from "../lib/recovery.js";
import type * as lib_subscriptionPrice from "../lib/subscriptionPrice.js";
import type * as lib_supplementIntake from "../lib/supplementIntake.js";
import type * as lib_uploads from "../lib/uploads.js";
import type * as lib_userDataRegistry from "../lib/userDataRegistry.js";
import type * as lib_waterLogs from "../lib/waterLogs.js";
import type * as lib_workoutLogs from "../lib/workoutLogs.js";
import type * as lib_workoutTextParser from "../lib/workoutTextParser.js";
import type * as lib_workoutValidators from "../lib/workoutValidators.js";
import type * as logs_activeWorkout from "../logs/activeWorkout.js";
import type * as logs_calories from "../logs/calories.js";
import type * as logs_customExercises from "../logs/customExercises.js";
import type * as logs_customFoods from "../logs/customFoods.js";
import type * as logs_dataImport from "../logs/dataImport.js";
import type * as logs_fasting from "../logs/fasting.js";
import type * as logs_foodLogs from "../logs/foodLogs.js";
import type * as logs_groceryLists from "../logs/groceryLists.js";
import type * as logs_healthMetrics from "../logs/healthMetrics.js";
import type * as logs_healthWorkouts from "../logs/healthWorkouts.js";
import type * as logs_logAgent from "../logs/logAgent.js";
import type * as logs_mealPrep from "../logs/mealPrep.js";
import type * as logs_mealPresets from "../logs/mealPresets.js";
import type * as logs_presetAgent from "../logs/presetAgent.js";
import type * as logs_presets from "../logs/presets.js";
import type * as logs_recipes from "../logs/recipes.js";
import type * as logs_repeatMeals from "../logs/repeatMeals.js";
import type * as logs_restDays from "../logs/restDays.js";
import type * as logs_snap from "../logs/snap.js";
import type * as logs_snapMatching from "../logs/snapMatching.js";
import type * as logs_supplements from "../logs/supplements.js";
import type * as logs_water from "../logs/water.js";
import type * as logs_workouts from "../logs/workouts.js";
import type * as maintenance_seed from "../maintenance/seed.js";
import type * as marketing_waitlist from "../marketing/waitlist.js";
import type * as mcp_data from "../mcp/data.js";
import type * as mcp_oauth from "../mcp/oauth.js";
import type * as mcp_oauthServer from "../mcp/oauthServer.js";
import type * as mcp_server from "../mcp/server.js";
import type * as mcp_tokens from "../mcp/tokens.js";
import type * as mcp_tools from "../mcp/tools.js";
import type * as migrations from "../migrations.js";
import type * as progressInsights from "../progressInsights.js";
import type * as push_fcm from "../push/fcm.js";
import type * as push_send from "../push/send.js";
import type * as push_tokens from "../push/tokens.js";
import type * as security from "../security.js";
import type * as sharing_diaryComments from "../sharing/diaryComments.js";
import type * as sharing_diaryShares from "../sharing/diaryShares.js";
import type * as sharing_emails from "../sharing/emails.js";
import type * as sharing_sharedDiary from "../sharing/sharedDiary.js";
import type * as subscriptions from "../subscriptions.js";
import type * as uploads from "../uploads.js";
import type * as users_checkIn from "../users/checkIn.js";
import type * as users_devEmails from "../users/devEmails.js";
import type * as users_moments from "../users/moments.js";
import type * as users_onboarding from "../users/onboarding.js";
import type * as users_schedules from "../users/schedules.js";
import type * as users_tooltips from "../users/tooltips.js";
import type * as users_users from "../users/users.js";
import type * as users_walkthrough from "../users/walkthrough.js";
import type * as users_weeklyTargets from "../users/weeklyTargets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/byok": typeof ai_byok;
  "ai/coachGoals": typeof ai_coachGoals;
  "ai/coachHistory": typeof ai_coachHistory;
  "ai/coachOperations": typeof ai_coachOperations;
  "ai/coachReviews": typeof ai_coachReviews;
  "ai/coachState": typeof ai_coachState;
  "ai/coachWorkspace": typeof ai_coachWorkspace;
  "ai/formCoach": typeof ai_formCoach;
  "ai/formCoachAgent": typeof ai_formCoachAgent;
  "ai/formCoachKinematics": typeof ai_formCoachKinematics;
  "ai/inWorkout": typeof ai_inWorkout;
  "ai/metricGeneration": typeof ai_metricGeneration;
  "ai/nudges": typeof ai_nudges;
  "ai/provider": typeof ai_provider;
  "ai/usage": typeof ai_usage;
  "ai/weeklyReview": typeof ai_weeklyReview;
  "api/rest": typeof api_rest;
  "billing/_private/stripeProvider": typeof billing__private_stripeProvider;
  "billing/crons": typeof billing_crons;
  "billing/entitlement": typeof billing_entitlement;
  "billing/provider": typeof billing_provider;
  "billing/providerTypes": typeof billing_providerTypes;
  "billing/public": typeof billing_public;
  "billing/store": typeof billing_store;
  "billing/stripe": typeof billing_stripe;
  "billing/stripeState": typeof billing_stripeState;
  "billing/types": typeof billing_types;
  "billing/webhooks": typeof billing_webhooks;
  bodyProgress: typeof bodyProgress;
  crons: typeof crons;
  customProgressMetrics: typeof customProgressMetrics;
  dashboardWidgets: typeof dashboardWidgets;
  exercises: typeof exercises;
  "food/datasource": typeof food_datasource;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/authEmail": typeof lib_authEmail;
  "lib/bodyMeasurements": typeof lib_bodyMeasurements;
  "lib/calculateCalories": typeof lib_calculateCalories;
  "lib/coachWorkspaceBudget": typeof lib_coachWorkspaceBudget;
  "lib/customMetricScoring": typeof lib_customMetricScoring;
  "lib/customProgressMetrics": typeof lib_customProgressMetrics;
  "lib/dataImport": typeof lib_dataImport;
  "lib/deleteUserData": typeof lib_deleteUserData;
  "lib/diaryAccess": typeof lib_diaryAccess;
  "lib/estimateOnboardingCalories": typeof lib_estimateOnboardingCalories;
  "lib/exerciseShape": typeof lib_exerciseShape;
  "lib/fastingSessions": typeof lib_fastingSessions;
  "lib/healthMetricCatalog": typeof lib_healthMetricCatalog;
  "lib/healthMetrics": typeof lib_healthMetrics;
  "lib/healthProfiles": typeof lib_healthProfiles;
  "lib/healthScore": typeof lib_healthScore;
  "lib/healthSeries": typeof lib_healthSeries;
  "lib/history": typeof lib_history;
  "lib/mealTargets": typeof lib_mealTargets;
  "lib/memoryConsolidation": typeof lib_memoryConsolidation;
  "lib/nutritionPlan": typeof lib_nutritionPlan;
  "lib/nutritionValues": typeof lib_nutritionValues;
  "lib/onboardingProfiles": typeof lib_onboardingProfiles;
  "lib/outreach": typeof lib_outreach;
  "lib/platformHealthMetrics": typeof lib_platformHealthMetrics;
  "lib/programming": typeof lib_programming;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/recovery": typeof lib_recovery;
  "lib/subscriptionPrice": typeof lib_subscriptionPrice;
  "lib/supplementIntake": typeof lib_supplementIntake;
  "lib/uploads": typeof lib_uploads;
  "lib/userDataRegistry": typeof lib_userDataRegistry;
  "lib/waterLogs": typeof lib_waterLogs;
  "lib/workoutLogs": typeof lib_workoutLogs;
  "lib/workoutTextParser": typeof lib_workoutTextParser;
  "lib/workoutValidators": typeof lib_workoutValidators;
  "logs/activeWorkout": typeof logs_activeWorkout;
  "logs/calories": typeof logs_calories;
  "logs/customExercises": typeof logs_customExercises;
  "logs/customFoods": typeof logs_customFoods;
  "logs/dataImport": typeof logs_dataImport;
  "logs/fasting": typeof logs_fasting;
  "logs/foodLogs": typeof logs_foodLogs;
  "logs/groceryLists": typeof logs_groceryLists;
  "logs/healthMetrics": typeof logs_healthMetrics;
  "logs/healthWorkouts": typeof logs_healthWorkouts;
  "logs/logAgent": typeof logs_logAgent;
  "logs/mealPrep": typeof logs_mealPrep;
  "logs/mealPresets": typeof logs_mealPresets;
  "logs/presetAgent": typeof logs_presetAgent;
  "logs/presets": typeof logs_presets;
  "logs/recipes": typeof logs_recipes;
  "logs/repeatMeals": typeof logs_repeatMeals;
  "logs/restDays": typeof logs_restDays;
  "logs/snap": typeof logs_snap;
  "logs/snapMatching": typeof logs_snapMatching;
  "logs/supplements": typeof logs_supplements;
  "logs/water": typeof logs_water;
  "logs/workouts": typeof logs_workouts;
  "maintenance/seed": typeof maintenance_seed;
  "marketing/waitlist": typeof marketing_waitlist;
  "mcp/data": typeof mcp_data;
  "mcp/oauth": typeof mcp_oauth;
  "mcp/oauthServer": typeof mcp_oauthServer;
  "mcp/server": typeof mcp_server;
  "mcp/tokens": typeof mcp_tokens;
  "mcp/tools": typeof mcp_tools;
  migrations: typeof migrations;
  progressInsights: typeof progressInsights;
  "push/fcm": typeof push_fcm;
  "push/send": typeof push_send;
  "push/tokens": typeof push_tokens;
  security: typeof security;
  "sharing/diaryComments": typeof sharing_diaryComments;
  "sharing/diaryShares": typeof sharing_diaryShares;
  "sharing/emails": typeof sharing_emails;
  "sharing/sharedDiary": typeof sharing_sharedDiary;
  subscriptions: typeof subscriptions;
  uploads: typeof uploads;
  "users/checkIn": typeof users_checkIn;
  "users/devEmails": typeof users_devEmails;
  "users/moments": typeof users_moments;
  "users/onboarding": typeof users_onboarding;
  "users/schedules": typeof users_schedules;
  "users/tooltips": typeof users_tooltips;
  "users/users": typeof users_users;
  "users/walkthrough": typeof users_walkthrough;
  "users/weeklyTargets": typeof users_weeklyTargets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  crons: import("@convex-dev/crons/_generated/component.js").ComponentApi<"crons">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
