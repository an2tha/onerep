import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { MemoryRouter, useLocation } from "react-router"
import { ThemeProvider, PALETTES } from "@repo/ui"
import { OnboardingMobile } from "../../../src/pages/OnboardingMobile"
import "../../../src/styles/index.css"
const appearance =
  new URLSearchParams(location.search).get("appearance") ?? "dark"
localStorage.setItem("theme", appearance)
const stage = Number(new URLSearchParams(location.search).get("stage") ?? 0)
localStorage.setItem(
  "onerep:onboarding-draft:v2",
  JSON.stringify({
    stage,
    ...(stage === 17 ? { programmeMode: "guided" } : {}),
    measurementsConfirmed: true,
    sex: "male",
    age: 30,
    weightKg: 75,
    heightCm: 180,
    nutritionGoal: "maintain",
    experienceLevel: "intermediate",
    consent: {
      dataUse: false,
      weightData: true,
      foodLogging: true,
      wearableIntegrations: false,
    },
  })
)
const results: Record<string, unknown> = {
  "users/onboarding:get": null,
  "users/users:getPreferences": { weightUnit: "kg" },
  "ai/usage:getMonthlyUsage": {
    unlimited: true,
    remaining: 100,
    serverAiConfigured: false,
    byok: false,
  },
  "logs/foodLogs:getRecent": [],
  "logs/workouts:getHistory": [],
  "bodyProgress:list": [],
  "logs/calories:calculate": {
    targetCalories: 2400,
    protein: 150,
    carbs: 280,
    fat: 75,
    bmr: 1750,
    tdee: 2400,
  },
}
const client = {
  watchQuery(reference: Parameters<typeof getFunctionName>[0]) {
    return {
      onUpdate() {
        return () => {}
      },
      localQueryResult() {
        return results[getFunctionName(reference)] ?? null
      },
      journal() {},
    }
  },
  async query(reference: Parameters<typeof getFunctionName>[0]) {
    return results[getFunctionName(reference)] ?? null
  },
  async mutation(
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown
  ) {
    sessionStorage.setItem(getFunctionName(reference), JSON.stringify(args))
    return { ok: true }
  },
  async action() {
    throw new Error("AI is unavailable in this isolated fixture")
  },
}
function RouteIndicator() {
  const location = useLocation()
  return (
    <output data-testid="destination" hidden>
      {location.pathname}
      {location.search}
    </output>
  )
}
createRoot(document.getElementById("root")!).render(
  <ConvexProvider client={client as unknown as ConvexReactClient}>
    <ThemeProvider identities={PALETTES} defaultTheme="dark">
      <MemoryRouter initialEntries={["/onboarding"]}>
        <OnboardingMobile />
        <RouteIndicator />
      </MemoryRouter>
    </ThemeProvider>
  </ConvexProvider>
)
