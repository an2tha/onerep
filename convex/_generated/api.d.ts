/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as bodyProgress from "../bodyProgress.js";
import type * as exercises from "../exercises.js";
import type * as food_openFoodFacts from "../food/openFoodFacts.js";
import type * as http from "../http.js";
import type * as lib_calculateCalories from "../lib/calculateCalories.js";
import type * as lib_deleteUserData from "../lib/deleteUserData.js";
import type * as lib_estimateOnboardingCalories from "../lib/estimateOnboardingCalories.js";
import type * as logs_activeWorkout from "../logs/activeWorkout.js";
import type * as logs_calories from "../logs/calories.js";
import type * as logs_foodLogs from "../logs/foodLogs.js";
import type * as logs_presets from "../logs/presets.js";
import type * as logs_recipes from "../logs/recipes.js";
import type * as logs_snap from "../logs/snap.js";
import type * as logs_water from "../logs/water.js";
import type * as logs_workouts from "../logs/workouts.js";
import type * as users_checkIn from "../users/checkIn.js";
import type * as users_onboarding from "../users/onboarding.js";
import type * as users_schedules from "../users/schedules.js";
import type * as users_users from "../users/users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bodyProgress: typeof bodyProgress;
  exercises: typeof exercises;
  "food/openFoodFacts": typeof food_openFoodFacts;
  http: typeof http;
  "lib/calculateCalories": typeof lib_calculateCalories;
  "lib/deleteUserData": typeof lib_deleteUserData;
  "lib/estimateOnboardingCalories": typeof lib_estimateOnboardingCalories;
  "logs/activeWorkout": typeof logs_activeWorkout;
  "logs/calories": typeof logs_calories;
  "logs/foodLogs": typeof logs_foodLogs;
  "logs/presets": typeof logs_presets;
  "logs/recipes": typeof logs_recipes;
  "logs/snap": typeof logs_snap;
  "logs/water": typeof logs_water;
  "logs/workouts": typeof logs_workouts;
  "users/checkIn": typeof users_checkIn;
  "users/onboarding": typeof users_onboarding;
  "users/schedules": typeof users_schedules;
  "users/users": typeof users_users;
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
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  crons: import("@convex-dev/crons/_generated/component.js").ComponentApi<"crons">;
};
