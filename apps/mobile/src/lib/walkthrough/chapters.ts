import { carbLabelLower } from "@/lib/carb-display"
import type { TourChapter } from "./types"

/**
 * Every destination that is not a bottom-bar tab. Each one must be reachable
 * from some chapter's discovery step — `walkthrough-chapters.test.ts` asserts
 * this against the literal list, so adding a route without surfacing it fails.
 */
export const HIDDEN_DESTINATIONS = [
  "/camera",
  "/exercises",
  "/foods/custom",
  "/foods/search",
  "/nutrition/fasting",
  "/nutrition/groceries",
  "/nutrition/meal-prep",
  "/nutrition/report",
  "/recipes",
  "/routines",
  "/settings",
  "/shared",
  "/supplements",
  "/workouts/new",
] as const

export const WALKTHROUGH_CHAPTERS: readonly TourChapter[] = [
  {
    id: "today",
    title: "Today",
    route: "/",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "today.ledger",
        anchor: "today-ledger",
        title: "Your day at a glance",
        body: "Calories and macros update the moment you log anything.",
        side: "bottom",
      },
      {
        id: "today.log",
        anchor: "today-log-meal",
        title: "Log from anywhere",
        body: "Search a food, scan a barcode, or snap a photo of your plate.",
      },
      {
        id: "today.workout",
        anchor: "today-workout",
        title: "Start training",
        body: "Your planned session for today. Hold to start it.",
        optional: true,
      },
      {
        id: "today.tabs",
        anchor: "bottom-bar",
        title: "Five places to go",
        body: "Today, Nutrition, Training, Progress, and your Coach.",
        side: "top",
      },
      {
        id: "today.more",
        anchor: "today-profile",
        kind: "discovery",
        title: "There's more inside",
        body: "Settings holds your targets and preferences.",
        links: [
          { label: "Settings", to: "/settings", detail: "Targets" },
          { label: "Shared diaries", to: "/shared", detail: "Coaches" },
        ],
      },
    ],
  },
  {
    id: "nutrition",
    title: "Nutrition",
    route: "/nutrition",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "nutrition.add",
        anchor: "nutrition-add",
        title: "Add to your diary",
        body: "Everything you can log lives behind this button.",
      },
      {
        id: "nutrition.macros",
        anchor: "nutrition-macros",
        title: "Protein, carbs, and fat",
        // Derived: the tile says "Net carbs" when the preference is on, and the
        // tour must not contradict what is on screen.
        body: (ctx) =>
          `Your daily targets. The middle tile shows ${carbLabelLower(
            ctx.netCarbsEnabled ? "net" : "total"
          )}. You can switch that in Settings, under Nutrition strategy.`,
      },
      {
        id: "nutrition.mealBudget",
        anchor: "nutrition-meal-budget",
        title: "Calories by meal",
        body: "Your daily budget split across each meal, so you know what is left for dinner.",
        when: (ctx) => ctx.mealTargetsEnabled,
      },
      {
        id: "nutrition.fastingPill",
        anchor: "nutrition-fasting-pill",
        title: "Your fast is running",
        body: "Tap for the timer, your streak, and history.",
        when: (ctx) => ctx.hasActiveFast,
        optional: true,
      },
      {
        id: "nutrition.more",
        anchor: "nutrition-header",
        kind: "discovery",
        title: "There's more inside",
        body: "Nutrition is the biggest area in the app.",
        links: [
          { label: "Recipes", to: "/recipes" },
          { label: "Meal prep", to: "/nutrition/meal-prep" },
          { label: "Grocery lists", to: "/nutrition/groceries" },
          { label: "Fasting", to: "/nutrition/fasting" },
          { label: "Report", to: "/nutrition/report" },
          { label: "Supplements", to: "/supplements" },
          { label: "My foods", to: "/foods/custom" },
          { label: "Search foods", to: "/foods/search" },
          { label: "Snap a meal", to: "/camera" },
        ],
      },
    ],
  },
  {
    id: "training",
    title: "Training",
    route: "/workouts",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "training.start",
        anchor: "training-start",
        title: "Start a session",
        body: "Your saved workouts. Open one to log sets as you go.",
      },
      {
        id: "training.build",
        anchor: "training-build",
        title: "Build your own",
        body: "Pick exercises and set your target reps.",
        optional: true,
      },
      {
        id: "training.more",
        anchor: "training-header",
        kind: "discovery",
        title: "There's more inside",
        body: "Ready-made routines and the full exercise library.",
        links: [
          { label: "Example routines", to: "/routines" },
          { label: "Exercise library", to: "/exercises" },
          { label: "New workout", to: "/workouts/new" },
        ],
      },
    ],
  },
  {
    id: "progress",
    title: "Progress",
    route: "/progress",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "progress.tabs",
        anchor: "progress-tabs",
        title: "Three views",
        body: "Body, nutrition, and training trends each get their own tab.",
      },
      {
        id: "progress.checkIn",
        anchor: "progress-check-in",
        title: "Weekly check-in",
        body: "Log weight and measurements to see the trend build.",
      },
      {
        id: "progress.more",
        anchor: "progress-header",
        kind: "discovery",
        title: "There's more inside",
        body: "A fuller breakdown of how you have been eating.",
        links: [{ label: "Nutrition report", to: "/nutrition/report" }],
      },
    ],
  },
  {
    id: "coach",
    title: "Coach",
    route: "/coach",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "coach.message",
        anchor: "coach-composer",
        title: "Ask anything",
        body: "Your coach knows your goals, your logs, and your training.",
        requiresPro: true,
      },
      {
        id: "coach.modes",
        anchor: "coach-modes",
        title: "Switch specialists",
        body: "Swipe between briefing, nutrition, and training modes.",
        requiresPro: true,
        optional: true,
      },
      {
        id: "coach.newChat",
        anchor: "coach-new-chat",
        title: "Start fresh any time",
        body: "A new chat clears the thread and brings back the skill shortcuts.",
        requiresPro: true,
        optional: true,
      },
      {
        // Also the free-user fallback: every other step here is an AI surface,
        // so without this the chapter would resolve to nothing.
        id: "coach.more",
        anchor: "coach-header",
        kind: "discovery",
        title: "Your goals live in Settings",
        body: "Targets, nutrition strategy, and preferences are editable any time.",
        links: [{ label: "Settings", to: "/settings", detail: "Targets" }],
      },
    ],
  },

  // ── Primers ────────────────────────────────────────────────────────────────
  {
    id: "fasting",
    title: "Fasting",
    route: "/nutrition/fasting",
    version: 1,
    kind: "primer",
    steps: [
      {
        id: "fasting.presets",
        anchor: "fasting-presets",
        title: "Pick a protocol",
        body: "Start from a preset or set your own length.",
      },
      {
        id: "fasting.lastMeal",
        anchor: "fasting-last-meal",
        title: "Already fasting?",
        body: "Start the clock from your last logged meal instead of now.",
        optional: true,
      },
    ],
  },
  {
    id: "groceries",
    title: "Grocery lists",
    route: "/nutrition/groceries",
    version: 1,
    kind: "primer",
    steps: [
      {
        id: "groceries.sources",
        anchor: "groceries-sources",
        title: "Built from your recipes",
        body: "Tick recipes or meal-prep batches and the ingredients merge into one list.",
      },
    ],
  },
  {
    id: "sharedDiary",
    title: "Shared diaries",
    route: "/shared",
    version: 1,
    kind: "primer",
    steps: [
      {
        id: "sharedDiary.list",
        anchor: "shared-diaries",
        title: "Read-only, and yours to revoke",
        body: "Anyone you invite can read the days you share and leave notes. Revoke access any time in Settings.",
      },
    ],
  },
] as const

export const HUB_CHAPTERS = WALKTHROUGH_CHAPTERS.filter(
  (chapter) => chapter.kind === "hub"
)

export function findChapter(id: string) {
  return WALKTHROUGH_CHAPTERS.find((chapter) => chapter.id === id)
}
