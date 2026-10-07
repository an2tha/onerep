import { createRoot } from "react-dom/client"
import { useState } from "react"
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { MemoryRouter, Routes, Route } from "react-router"
import { ThemeProvider, PALETTES, Toaster } from "@repo/ui"
import App from "../../../src/App"
import Nutrition, { GoalsCardWrapper } from "../../../src/pages/Nutrition"
import { BottomBar } from "../../../src/components/bottom-bar"
import More from "../../../src/pages/More"
import "../../../src/styles/index.css"
import "../../../src/i18n"
const params = new URLSearchParams(location.search)
const mode = params.get("mode") ?? "empty"
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date())
const food = {
  id: "oats",
  name: "Oats and yogurt",
  calories: 450,
  protein: 30,
  carbs: 55,
  fat: 12,
  meal: "breakfast",
  loggedAt: new Date().toISOString(),
}
const key = "ux-audit-water"
let water =
  mode === "logged"
    ? JSON.parse(
        sessionStorage.getItem(key) ??
          JSON.stringify([
            { id: "water", amountMl: 250, loggedAt: new Date().toISOString() },
          ])
      )
    : []
const goals = { calories: 2400, protein: 150, carbs: 280, fat: 70 }
const results: Record<string, unknown> = {
  "users/users:getPreferences": {
    lastActiveTimezone: "Europe/Berlin",
    weightUnit: "kg",
    waterUnit: "ml",
    waterGoalMl: 2500,
    dashboardSettings: { simpleMode: false },
  },
  "users/users:getEffectiveGoals": {
    effective: goals,
    custom: null,
    health: null,
    mealTargets: [],
  },
  "users/users:getNutritionPlan":
    mode === "unavailable"
      ? null
      : mode === "pending"
        ? undefined
        : {
            visibleMetrics: {
              calories: mode !== "habits",
              macros: mode !== "habits",
              protein: mode !== "habits",
              micros: false,
              habits: mode === "habits",
              water: true,
              streaks: true,
            },
            guidance: [],
            mealSuggestions: [],
            targets: goals,
            safetyMode: "standard",
            trackingMode: "full",
          },
  "logs/foodLogs:getDay": mode === "logged" ? [food] : [],
  "logs/foodLogs:getRecent": [],
  "logs/workouts:getLog": [],
  "logs/workouts:getHistory": [],
  "logs/supplements:getDay": [],
  "logs/supplements:getOverview": {
    items: [],
    logs: [],
    legacyEntries: [],
    recentLogs: [],
    nutritionTotals: {},
    isTrainingDay: false,
    guidance: [],
    summary: {},
  },
  "logs/healthMetrics:dashboard": { recovery: null, days: [], score: null },
  "logs/recipes:list": [],
  "logs/mealPresets:list": [],
  "recovery:get": null,
  "restart:get": null,
}
const subscribers = new Set<() => void>()
const resultFor = (name: string) =>
  name === "logs/water:getDay"
    ? water
    : (results[name] ??
      (name === "users/users:getNutritionPlan" && mode === "pending"
        ? undefined
        : null))
const client = {
  setAuth(_getToken: unknown, onChange: (authenticated: boolean) => void) {
    onChange(true)
  },
  clearAuth() {},
  watchQuery(reference: Parameters<typeof getFunctionName>[0]) {
    return {
      onUpdate(callback: () => void) {
        subscribers.add(callback)
        return () => subscribers.delete(callback)
      },
      localQueryResult() {
        return resultFor(getFunctionName(reference))
      },
      journal() {},
    }
  },
  async query(reference: Parameters<typeof getFunctionName>[0]) {
    return resultFor(getFunctionName(reference))
  },
  async mutation(
    reference: Parameters<typeof getFunctionName>[0],
    args: { id?: string; amountMl?: number; loggedAt?: string }
  ) {
    const name = getFunctionName(reference)
    if (params.get("fail") === "1")
      throw new Error("Could not save. Try again.")
    sessionStorage.setItem(
      "ux-audit-last-mutation",
      JSON.stringify({ name, args })
    )
    if (name === "logs/water:updateEntry")
      water = water.map((row: { id: string }) =>
        row.id === args.id
          ? { ...row, amountMl: args.amountMl, loggedAt: args.loggedAt }
          : row
      )
    if (name === "logs/water:removeEntry")
      water = water.filter((row: { id: string }) => row.id !== args.id)
    sessionStorage.setItem(key, JSON.stringify(water))
    subscribers.forEach((callback) => callback())
    return { ok: true }
  },
  async action() {
    throw new Error("Fixture has no AI")
  },
}
const useAuth = () => ({
  isLoading: false,
  isAuthenticated: true,
  fetchAccessToken: async () => "fixture",
})
function GoalFixture() {
  const [saved, setSaved] = useState(goals)
  const [fail, setFail] = useState(true)
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="app-title">Daily goals test</h1>
      <label>
        <input
          type="checkbox"
          checked={fail}
          onChange={(event) => setFail(event.target.checked)}
        />
        Simulate failure
      </label>
      <GoalsCardWrapper
        goals={saved}
        apiGoals={goals}
        carbMode="total"
        onSave={async (draft) => {
          if (fail) throw new Error("Rejected")
          setSaved(draft)
        }}
      />
      <p>Next visible control</p>
      <button>After goals</button>
    </main>
  )
}
createRoot(document.getElementById("root")!).render(
  <ConvexProviderWithAuth
    client={client as unknown as ConvexReactClient}
    useAuth={useAuth}
  >
    <ThemeProvider identities={PALETTES} defaultTheme="light">
      <output className="sr-only" aria-label="Saved correction">
        {sessionStorage.getItem("ux-audit-last-mutation")}
      </output>
      <MemoryRouter
        initialEntries={[
          params.get("page") === "nutrition"
            ? "/nutrition"
            : params.get("page") === "goals"
              ? "/goals-test"
              : "/",
        ]}
      >
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/goals-test" element={<GoalFixture />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<p>Selected destination</p>} />
        </Routes>
        <BottomBar />
        <Toaster />
      </MemoryRouter>
    </ThemeProvider>
  </ConvexProviderWithAuth>
)
