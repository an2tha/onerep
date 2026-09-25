import { tr } from "@repo/ui/i18n"
import { carbLabelLower } from "@/lib/carb-display"
import type { TourChapter } from "./types"

/**
 * Every destination that is not a bottom-bar tab. Each one must be reachable
 * from some chapter's discovery step — `walkthrough-chapters.test.ts` asserts
 * this against the literal list, so adding a route without surfacing it fails.
 */
export const HIDDEN_DESTINATIONS = [
  "/camera",
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
    title: tr("Today"),
    route: "/",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "today.ledger",
        anchor: "today-ledger",
        title: tr("Your day at a glance"),
        body: tr("Calories and macros update the moment you log anything."),
        side: "bottom",
      },
      {
        id: "today.log",
        anchor: "today-log-meal",
        title: tr("Log from anywhere"),
        body: tr(
          "Search a food, scan a barcode, or snap a photo of your plate."
        ),
      },
      {
        id: "today.workout",
        anchor: "today-workout",
        title: tr("Start training"),
        body: tr("Your planned session for today. Hold to start it."),
        optional: true,
      },
      {
        id: "today.tabs",
        anchor: "bottom-bar",
        title: tr("Five places to go"),
        body: tr("Today, Nutrition, Training, Progress, and your Coach."),
        side: "top",
      },
      {
        id: "today.more",
        anchor: "today-profile",
        kind: "discovery",
        title: tr("There's more inside"),
        body: tr("Settings holds your targets and preferences."),
        links: [
          { label: tr("Settings"), to: "/settings", detail: tr("Targets") },
          { label: tr("Shared diaries"), to: "/shared", detail: tr("Coaches") },
        ],
      },
    ],
  },
  {
    id: "nutrition",
    title: tr("Nutrition"),
    route: "/nutrition",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "nutrition.add",
        anchor: "nutrition-add",
        title: tr("Add to your diary"),
        body: tr("Everything you can log lives behind this button."),
      },
      {
        id: "nutrition.macros",
        anchor: "nutrition-macros",
        title: tr("Protein, carbs, and fat"),
        // Derived: the tile says "Net carbs" when the preference is on, and the
        // tour must not contradict what is on screen.
        body: (ctx) =>
          tr(
            "Your daily targets. The middle tile shows {{value0}}. You can switch that in Settings, under Nutrition strategy.",
            { value0: carbLabelLower(ctx.netCarbsEnabled ? "net" : "total") }
          ),
      },
      {
        id: "nutrition.mealBudget",
        anchor: "nutrition-meal-budget",
        title: tr("Calories by meal"),
        body: tr(
          "Your daily budget split across each meal, so you know what is left for dinner."
        ),
        when: (ctx) => ctx.mealTargetsEnabled,
      },
      {
        id: "nutrition.fastingPill",
        anchor: "nutrition-fasting-pill",
        title: tr("Your fast is running"),
        body: tr("Tap for the timer, your streak, and history."),
        when: (ctx) => ctx.hasActiveFast,
        optional: true,
      },
      {
        id: "nutrition.more",
        anchor: "nutrition-header",
        kind: "discovery",
        title: tr("There's more inside"),
        body: tr("Nutrition is the biggest area in the app."),
        links: [
          { label: tr("Recipes"), to: "/recipes" },
          { label: tr("Meal prep"), to: "/nutrition/meal-prep" },
          { label: tr("Grocery lists"), to: "/nutrition/groceries" },
          { label: tr("Fasting"), to: "/nutrition/fasting" },
          { label: tr("Report"), to: "/nutrition/report" },
          { label: tr("Supplements"), to: "/supplements" },
          { label: tr("My foods"), to: "/foods/custom" },
          { label: tr("Search foods"), to: "/foods/search" },
          { label: tr("Snap a meal"), to: "/camera" },
        ],
      },
    ],
  },
  {
    id: "training",
    title: tr("Training"),
    route: "/workouts",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "training.start",
        anchor: "training-start",
        title: tr("Start a session"),
        body: tr("Your saved workouts. Open one to log sets as you go."),
      },
      {
        id: "training.build",
        anchor: "training-build",
        title: tr("Build your own"),
        body: tr("Pick exercises and set your target reps."),
        optional: true,
      },
      {
        id: "training.more",
        anchor: "training-header",
        kind: "discovery",
        title: tr("There's more inside"),
        body: tr(
          "Ready-made routines, and a workout built the way you want it."
        ),
        links: [
          { label: tr("Example routines"), to: "/routines" },
          { label: tr("New workout"), to: "/workouts/new" },
        ],
      },
    ],
  },
  {
    id: "progress",
    title: tr("Progress"),
    route: "/progress",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "progress.tabs",
        anchor: "progress-tabs",
        title: tr("Four views"),
        body: tr(
          "Body, nutrition, and training trends each get a tab — and the exercise library sits in the fourth."
        ),
      },
      {
        id: "progress.checkIn",
        anchor: "progress-check-in",
        title: tr("Weekly check-in"),
        body: tr("Log weight and measurements to see the trend build."),
      },
      {
        id: "progress.more",
        anchor: "progress-header",
        kind: "discovery",
        title: tr("There's more inside"),
        body: tr("A fuller breakdown of how you have been eating."),
        links: [{ label: tr("Nutrition report"), to: "/nutrition/report" }],
      },
    ],
  },
  {
    id: "coach",
    title: tr("Coach"),
    route: "/coach",
    version: 1,
    kind: "hub",
    steps: [
      {
        id: "coach.message",
        anchor: "coach-composer",
        title: tr("Ask anything"),
        body: tr("Your coach knows your goals, your logs, and your training."),
        requiresPro: true,
      },
      {
        id: "coach.modes",
        anchor: "coach-modes",
        title: tr("Switch specialists"),
        body: tr("Swipe between briefing, nutrition, and training modes."),
        requiresPro: true,
        optional: true,
      },
      {
        id: "coach.newChat",
        anchor: "coach-new-chat",
        title: tr("Start fresh any time"),
        body: tr(
          "A new chat clears the thread and brings back the skill shortcuts."
        ),
        requiresPro: true,
        optional: true,
      },
      {
        // Also the free-user fallback: every other step here is an AI surface,
        // so without this the chapter would resolve to nothing.
        id: "coach.more",
        anchor: "coach-header",
        kind: "discovery",
        title: tr("Your goals live in Settings"),
        body: tr(
          "Targets, nutrition strategy, and preferences are editable any time."
        ),
        links: [
          { label: tr("Settings"), to: "/settings", detail: tr("Targets") },
        ],
      },
    ],
  },

  // ── Primers ────────────────────────────────────────────────────────────────
  {
    id: "fasting",
    title: tr("Fasting"),
    route: "/nutrition/fasting",
    version: 1,
    kind: "primer",
    steps: [
      {
        id: "fasting.presets",
        anchor: "fasting-presets",
        title: tr("Pick a protocol"),
        body: tr("Start from a preset or set your own length."),
      },
      {
        id: "fasting.lastMeal",
        anchor: "fasting-last-meal",
        title: tr("Already fasting?"),
        body: tr("Start the clock from your last logged meal instead of now."),
        optional: true,
      },
    ],
  },
  {
    id: "groceries",
    title: tr("Grocery lists"),
    route: "/nutrition/groceries",
    version: 1,
    kind: "primer",
    steps: [
      {
        id: "groceries.sources",
        anchor: "groceries-sources",
        title: tr("Built from your recipes"),
        body: tr(
          "Tick recipes or meal-prep batches and the ingredients merge into one list."
        ),
      },
    ],
  },
  {
    id: "sharedDiary",
    title: tr("Shared diaries"),
    route: "/shared",
    version: 1,
    kind: "primer",
    steps: [
      {
        id: "sharedDiary.list",
        anchor: "shared-diaries",
        title: tr("Read-only, and yours to revoke"),
        body: tr(
          "Anyone you invite can read the days you share and leave notes. Revoke access any time in Settings."
        ),
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
