import { CoachReply } from "../../../src/lib/coach-openui"
import { CoachGeneratedUI } from "../../../src/lib/coach-chat"
import { createRoot } from "react-dom/client"
import { MemoryRouter, useLocation } from "react-router"
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ThemeProvider, PALETTES } from "@repo/ui"
import { BottomBar } from "../../../src/components/bottom-bar"
import { shouldShowBottomBar } from "../../../src/lib/navigation"
import CoachCenter from "../../../src/pages/CoachCenter"
import { ResultBody } from "../../../src/components/coach-center/CenterResult"
import "../../../src/styles/index.css"
import "../../../src/components/page-chrome.css"
import "../../../src/i18n"
const params = new URLSearchParams(location.search)
function FixtureNavigation() {
  const { pathname } = useLocation()
  return shouldShowBottomBar(pathname) ? <BottomBar /> : null
}
const empty: unknown[] = []
const listeners = new Set<() => void>()
const today = new Date().toLocaleDateString("en-CA")
let fixtureCheckIns: Record<string, unknown>[] = []
const fixtureLogs = [0, 2, 4].map((ago, index) => {
  const date = new Date()
  date.setDate(date.getDate() - ago)
  return {
    _id: `workout-${index}`,
    date: date.toLocaleDateString("en-CA"),
    durationSeconds: 2400,
    exercises: [],
  }
})
let fixtureGoals = [
  {
    _id: "goal-fixture",
    title: "Build a consistent week",
    endDate: today,
    tasks: [
      { _id: "task-a", title: "Choose two training days", completed: true },
      { _id: "task-b", title: "Prepare a repeatable lunch", completed: false },
    ],
  },
]
const client = {
  setAuth() {},
  clearAuth() {},
  watchQuery(reference: unknown, args: { kind?: string } = {}) {
    const name = getFunctionName(reference as never)
    return {
      onUpdate(callback: () => void) {
        listeners.add(callback)
        return () => {
          listeners.delete(callback)
        }
      },
      localQueryResult: () => {
        if (name === "logs/workouts:getHistory")
          return params.has("populated") ? fixtureLogs : empty
        if (name === "ai/coachState:listCheckIns") return fixtureCheckIns
        if (name === "ai/coachGoals:listActive")
          return params.has("populated") ? fixtureGoals : empty
        if (name === "ai/coachCenterState:latest")
          return params.has("populated")
            ? (fixtureResults.find((r) => r.kind === args.kind) ?? null)
            : null
        return name.includes("list") ? empty : null
      },
      journal() {},
    }
  },
  async mutation(reference: unknown, args: Record<string, unknown>) {
    if (params.has("failure")) throw new Error("Simulated connection failure")
    const name = getFunctionName(reference as never)
    if (name === "ai/coachState:saveCheckIn")
      fixtureCheckIns = [{ _id: "checkin-fixture", ...args }]
    if (name === "ai/coachGoals:setTaskCompleted") {
      fixtureGoals = fixtureGoals.map((goal) => ({
        ...goal,
        tasks: goal.tasks.map((task) =>
          task._id === args.id
            ? { ...task, completed: Boolean(args.completed) }
            : task,
        ),
      }))
    }
    listeners.forEach((callback) => callback())
    return null
  },
}
const content = {
  title: "Review your recorded sessions",
  summary: "Fixture data for layout verification only.",
  observations: [
    {
      title: "Three recorded sessions",
      detail: "The example checks chart labels and the discussion handoff.",
    },
  ],
  nextSteps: ["Compare like-for-like sessions."],
  limitations: ["This fixture is not a live AI answer."],
  sessions: [],
  meals: [],
}
const fixtureResults = [
  {
    kind: "review",
    today,
    createdAt: Date.now(),
    activity: [],
    content: {
      ...content,
      title: "Keep your training rhythm",
      summary:
        "Example review for layout testing. Three recorded sessions, with recovery days between them.",
    },
  },
  {
    kind: "plan",
    today,
    createdAt: Date.now() - 86400000,
    activity: [],
    content: {
      ...content,
      sessions: [
        {
          day: "Monday",
          title: "Full body",
          durationMinutes: 40,
          exercises: [
            {
              name: "Goblet squat",
              sets: 3,
              reps: "8–10",
              restSeconds: 90,
              note: "Keep the load comfortable and the movement controlled.",
            },
            {
              name: "Dumbbell row",
              sets: 3,
              reps: "10",
              restSeconds: 60,
              note: "Keep your torso steady.",
            },
          ],
        },
        {
          day: "Thursday",
          title: "Full body",
          durationMinutes: 30,
          exercises: [
            {
              name: "Split squat",
              sets: 2,
              reps: "8 each side",
              restSeconds: 90,
              note: "Use support for balance if needed.",
            },
            {
              name: "Incline push-up",
              sets: 3,
              reps: "8–12",
              restSeconds: 60,
              note: "Choose a height that lets you keep control.",
            },
          ],
        },
      ],
      title: "Your next two sessions",
      summary:
        "Example saved plan. Revisit the session details, then discuss changes with Coach.",
    },
  },
]
createRoot(document.getElementById("root")!).render(
  <ConvexProviderWithAuth
    useAuth={() => ({
      isLoading: false,
      isAuthenticated: false,
      fetchAccessToken: async () => null,
    })}
    client={client as unknown as ConvexReactClient}
  >
    <MemoryRouter initialEntries={[params.get("route") || "/coach"]}>
      <ThemeProvider
        identities={PALETTES}
        defaultTheme={params.get("theme") === "light" ? "light" : "dark"}
        storageKey="coach-qa-theme"
        identityStorageKey="coach-qa-identity"
      >
        <div
          style={{
            position: "fixed",
            bottom: 0,
            zIndex: 1000,
            background: "var(--background)",
            fontSize: 11,
          }}
        >
          Component fixture · simulated data
        </div>
        {params.has("conversation") ? (
          <main
            className="coach-center coach-center-chat"
            style={{ overflowY: "auto", padding: "40px 24px" }}
          >
            <div
              className="coach-conversation-content"
              style={{ margin: "auto" }}
            >
              <h1 style={{ fontSize: 22, marginBottom: 32 }}>Coach</h1>
              <div
                className="coach-message coach-message--user"
                style={{
                  padding: "12px 16px",
                  marginLeft: "auto",
                  marginBottom: 32,
                  width: "fit-content",
                  borderRadius: 16,
                }}
              >
                How should I approach my next session?
              </div>
              <div className="coach-message coach-message--assistant">
                <div>
                  <CoachReply
                    text={
                      "Keep the same exercises and leave **two reps in reserve**.\n\n1. Start with a comfortable warm-up.\n2. Keep the working sets controlled.\n3. Note your reps and effort afterward.\n\nIf a movement causes pain, stop and adjust before continuing."
                    }
                  />
                  <CoachGeneratedUI
                    openui={
                      'root = Stack([session])\nsession = EntityList([{left: "Goblet squat", right: "3 × 8–10"}, {left: "Dumbbell row", right: "3 × 10"}], "small")'
                    }
                    onContinue={() => {}}
                    onAction={() => {}}
                  />
                </div>
              </div>
            </div>
          </main>
        ) : params.has("result") ? (
          <main className="coach-center">
            <div className="center-scroll" style={{ paddingTop: 32 }}>
              <ResultBody
                result={{
                  kind: "review",
                  today: "2026-10-16",
                  createdAt: 1792150000000,
                  content,
                  activity: [
                    { date: "2026-10-10", sessions: 1 },
                    { date: "2026-10-11", sessions: 0 },
                    { date: "2026-10-12", sessions: 1 },
                    { date: "2026-10-13", sessions: 0 },
                    { date: "2026-10-14", sessions: 0 },
                    { date: "2026-10-15", sessions: 1 },
                    { date: "2026-10-16", sessions: 0 },
                  ],
                }}
                onDiscuss={() => {}}
              />
            </div>
          </main>
        ) : (
          <>
            <div className={params.has("shell") ? "app-route-frame app-route-frame-current" : undefined} data-page-bar={params.has("shell") ? "true" : undefined}>
              <CoachCenter preview />
            </div>
            <FixtureNavigation />
          </>
        )}
      </ThemeProvider>
    </MemoryRouter>
  </ConvexProviderWithAuth>,
)
