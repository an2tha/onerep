import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { MemoryRouter, useLocation } from "react-router"
import { ThemeProvider, PALETTES } from "@repo/ui"
import { defaultProgrammeSettings, type ProgrammePlan } from "@repo/models"
import Programmes from "../../../src/pages/Programmes"
import "../../../src/styles/index.css"

const mode = new URLSearchParams(location.search).get("view") ?? "hub"
const today = new Date().toISOString().slice(0, 10)
const day = new Date().getDay()
const recipe = {
  id: "oats",
  name: "Berry overnight oats",
  category: "Breakfast",
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 0,
  ingredients: [
    {
      name: "Rolled oats",
      grams: 100,
      caloriesPer100: 380,
      proteinPer100: 13,
      carbsPer100: 68,
      fatPer100: 7,
    },
    {
      name: "Blueberries",
      grams: 120,
      caloriesPer100: 57,
      proteinPer100: 1,
      carbsPer100: 14,
      fatPer100: 0,
    },
  ],
  steps: [
    "Mix oats with water and chill overnight.",
    "Add blueberries before serving.",
  ],
}
const foodPlan: ProgrammePlan = {
  summary: "Simple meals you can prepare ahead and rotate through the week.",
  nutrition: {
    recipes: [recipe],
    meals: Array.from({ length: 7 }, (_, day) => ({
      id: `meal-${day}`,
      day,
      slot: "Breakfast",
      recipeId: "oats",
      servings: 1,
    })),
  },
}
const workoutPlan: ProgrammePlan = {
  summary:
    "Build a consistent training rhythm, then progress with a lighter final week.",
  training: {
    mesocycles: [
      {
        id: "foundation",
        name: "Foundation",
        startWeek: 1,
        endWeek: 3,
        objective: "Practise the movements",
        progression: "Add reps when the sets feel controlled",
        deload: false,
      },
      {
        id: "lighter",
        name: "Lighter week",
        startWeek: 4,
        endWeek: 4,
        objective: "Recover and review",
        progression: "Use comfortable effort",
        deload: true,
      },
    ],
    sessions: [
      {
        id: "session-1",
        name: "Full body A",
        dayOfWeek: day,
        blockId: "foundation",
        presetId: "preset-1",
        exercises: [
          {
            id: "squat",
            exerciseId: "squat",
            name: "Goblet squat",
            sets: 3,
            reps: "8-12",
            restSeconds: 90,
            notes: "Use a comfortable starting load.",
            alternatives: ["lunge"],
          },
        ],
      },
      {
        id: "session-2",
        name: "Lighter full body",
        dayOfWeek: day,
        blockId: "lighter",
        presetId: "preset-2",
        exercises: [
          {
            id: "squat-light",
            exerciseId: "squat",
            name: "Goblet squat",
            sets: 2,
            reps: "8",
            restSeconds: 90,
            notes: "Leave room for more reps.",
            alternatives: [],
          },
        ],
      },
    ],
  },
}
const settings = {
  ...defaultProgrammeSettings("UTC"),
  weeks: 4,
  screeningConfirmed: true,
  name: "Food for your week",
}
type Row = {
  _id: string
  track: string
  status: string
  settings: typeof settings
  plan?: ProgrammePlan
  startDate?: string
  createdAt: number
  updatedAt: number
  generationStatus?: string
  generationError?: string
  checkIns: unknown[]
}
let rows: Row[] =
  mode === "empty" || mode === "setup" || mode === "generation"
    ? []
    : [
        {
          _id: "nutrition-plan",
          track: "nutrition",
          status: mode === "draft" ? "draft" : "active",
          settings,
          plan: foodPlan,
          startDate: today,
          createdAt: 1,
          updatedAt: 1,
          checkIns: [],
        },
        {
          _id: "training-plan",
          track: "training",
          status: "active",
          settings: { ...settings, name: "Stronger, week by week" },
          plan: workoutPlan,
          startDate: today,
          createdAt: 2,
          updatedAt: 2,
          checkIns: [],
        },
      ]
const results: Record<string, unknown> = {
  "users/onboarding:get": {
    goal: "build",
    experienceLevel: "intermediate",
    dietType: "balanced",
    allergies: [],
  },
  "users/users:getPreferences": {
    aiSharingConsent: { granted: true, version: 4 },
    lastActiveTimezone: "UTC",
  },
  "ai/usage:getMonthlyUsage": {
    unlimited: true,
    remaining: 100,
    serverAiConfigured: true,
    byok: false,
  },
  "nutritionProgrammes:getGoalRecommendation": null,
  "nutritionProgrammes:getCurrent": null,
  "logs/recipes:list": [],
  "exercises:catalog": [
    {
      id: "squat",
      name: "Goblet squat",
      primaryMuscles: ["quadriceps"],
      category: "strength",
      equipment: "dumbbell",
    },
    {
      id: "lunge",
      name: "Reverse lunge",
      primaryMuscles: ["quadriceps"],
      category: "strength",
      equipment: "bodyweight",
    },
  ],
}
const listeners = new Set<() => void>()
const cache = new Map<string, unknown>()
const generationAttempts: Record<string, number> = {}
if (mode === "generation") {
  localStorage.setItem(
    "onerep:programme-setup:v1:guest",
    JSON.stringify({
      settings: { ...settings, equipment: ["Dumbbell"] },
      track: "both",
      step: 6,
    }),
  )
}
function resolve(name: string, args: Record<string, unknown> = {}) {
  const key = `${name}:${JSON.stringify(args)}`
  if (cache.has(key)) return cache.get(key)
  const result =
    name === "guidedProgrammes:list"
      ? rows
      : name === "guidedProgrammes:get"
        ? (rows.find((row) => row._id === args.id) ?? null)
        : (results[name] ?? null)
  cache.set(key, result)
  return result
}
function notify() {
  cache.clear()
  for (const callback of listeners) callback()
}
const client = {
  watchQuery(
    reference: Parameters<typeof getFunctionName>[0],
    args: Record<string, unknown>,
  ) {
    const name = getFunctionName(reference)
    return {
      onUpdate(callback: () => void) {
        listeners.add(callback)
        return () => listeners.delete(callback)
      },
      localQueryResult() {
        return resolve(name, args)
      },
      journal() {},
    }
  },
  async query(
    reference: Parameters<typeof getFunctionName>[0],
    args: Record<string, unknown>,
  ) {
    return resolve(getFunctionName(reference), args)
  },
  async mutation(
    reference: Parameters<typeof getFunctionName>[0],
    args: Record<string, unknown>,
  ) {
    const name = getFunctionName(reference)
    sessionStorage.setItem("programme-mutation", JSON.stringify({ name, args }))
    if (name === "guidedProgrammes:saveDraft") {
      const id = String(args.id ?? `draft-${args.track}`)
      rows = [
        ...rows.filter((row) => row._id !== id),
        {
          _id: id,
          track: String(args.track),
          status: "draft",
          settings: args.settings as typeof settings,
          plan: args.plan as ProgrammePlan | undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          checkIns: [],
        },
      ]
      notify()
      return id
    }
    rows = rows.map((row) =>
      row._id !== args.id
        ? row
        : {
            ...row,
            ...(name === "guidedProgrammes:setStatus"
              ? { status: String(args.status) }
              : {}),
            ...(name === "guidedProgrammes:updatePlan"
              ? { plan: args.plan as ProgrammePlan }
              : {}),
            ...(name === "guidedProgrammes:activate"
              ? { status: "active", startDate: today }
              : {}),
            updatedAt: Date.now(),
          },
    )
    notify()
    return name === "guidedProgrammes:updatePlan"
      ? {
          id: args.id,
          updatedAt: rows.find((row) => row._id === args.id)?.updatedAt,
        }
      : (args.id ?? { ok: true })
  },
  async action(
    reference: Parameters<typeof getFunctionName>[0],
    args: Record<string, unknown>,
  ) {
    const track = rows.find((row) => row._id === args.id)?.track ?? "unknown"
    generationAttempts[track] = (generationAttempts[track] ?? 0) + 1
    sessionStorage.setItem(
      "programme-generation-attempts",
      JSON.stringify(generationAttempts),
    )
    sessionStorage.setItem(
      "programme-action",
      JSON.stringify({ name: getFunctionName(reference), args }),
    )
    if (
      mode === "generation" &&
      track === "training" &&
      generationAttempts[track] === 1
    ) {
      rows = rows.map((row) =>
        row._id !== args.id
          ? row
          : {
              ...row,
              generationStatus: "failed",
              generationError:
                "Workout generation failed. Your 5 tokens were returned.",
            },
      )
      notify()
      throw new Error("Workout generation failed. Your 5 tokens were returned.")
    }
    rows = rows.map((row) =>
      row._id !== args.id
        ? row
        : {
            ...row,
            plan: row.track === "nutrition" ? foodPlan : workoutPlan,
            generationStatus: "complete",
            updatedAt: Date.now(),
          },
    )
    notify()
    return args.id
  },
}
function RouteIndicator() {
  const route = useLocation()
  return (
    <output hidden data-testid="destination">
      {route.pathname}
      {route.search}
    </output>
  )
}
const entry =
  mode === "generation"
    ? "/programmes?setup=1&track=both&mode=guided"
    : mode === "setup"
      ? "/programmes?setup=1&track=both&mode=manual"
      : ["nutrition", "training", "draft"].includes(mode)
        ? `/programmes?programme=${mode === "training" ? "training" : "nutrition"}-plan`
        : "/programmes"
const previewRoot = createRoot(document.getElementById("root")!)
import.meta.hot?.dispose(() => previewRoot.unmount())
previewRoot.render(
  <ConvexProvider client={client as unknown as ConvexReactClient}>
    <ThemeProvider identities={PALETTES} defaultTheme="dark">
      <MemoryRouter initialEntries={[entry]}>
        <Programmes />
        <RouteIndicator />
      </MemoryRouter>
    </ThemeProvider>
  </ConvexProvider>,
)
