import { shiftDay } from "../../src/pages/journal/trackers"
import { expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getFunctionName } from "convex/server"
import { mkdirSync, writeFileSync } from "node:fs"
const today = "2026-09-24"
mock.module("@/lib/food-log", () => ({
  currentDateKey: () => today,
  offsetDateKey: shiftDay,
}))
mock.module("@/lib/measurement-system", () => ({
  formatWater: (value: number) => `${value} ml`,
}))
mock.module("@/lib/use-water-unit", () => ({ useWaterUnit: () => "ml" }))
mock.module("@/dashboard/quick-action-drawers", () => ({
  QuickActionDrawer: () => null,
}))
mock.module("@/components/mobile-sheet", () => ({
  MobileSheet: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
mock.module("@repo/ui", () => ({ toast: { error: () => {} } }))
mock.module("convex/react", () => ({
  useMutation: () => () => Promise.resolve(),
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference)
    if (name === "users/users:getPreferences")
      return { lastActiveTimezone: "Europe/Berlin" }
    if (name === "logs/journal:getWeek") return [{ date: today, mood: 4 }]
    if (name === "logs/journal:trackers")
      return [
        {
          _id: "metric-sleep",
          title: "Sleep quality",
          description: "Rest",
          tab: "body",
          kind: "number",
          unit: "/ 10",
          step: 1,
          accent: "progress",
          entries: [{ date: today, value: 5 }],
        },
        {
          _id: "metric-mobility",
          title: "Mobility",
          description: "Movement",
          tab: "training",
          kind: "counter",
          unit: "min",
          step: 5,
          accent: "workout",
          entries: [{ date: today, value: 15 }],
        },
      ]
    return []
  },
}))
mock.module("@/lib/navigation", () => ({ useSmoothNavigate: () => () => {} }))
mock.module("@/lib/auth-client", () => ({
  useAppAuth: () => ({ user: { name: "Ananth" } }),
}))
const { CollapsingPageBar } =
  await import("../../src/components/collapsing-page-bar")
const { default: Journal } = await import("../../src/pages/Journal")
test("journal keeps its sections inside one atmosphere content layer", () => {
  const html = renderToStaticMarkup(<Journal />)
  expect(html).toContain('class="journal-content"')
  expect(html.indexOf('class="journal-content"')).toBeLessThan(
    html.indexOf('class="journal-heading"')
  )
  expect(html).not.toContain("MORE THAN NUMBERS")
  expect(html).not.toContain("THE DETAILS BEHIND YOUR PROGRESS")
  expect(html).toContain('aria-label="Daily check-in"')
  expect(html).toContain("Review trackers")
  expect(html).toContain("Write a note")
  if (process.env.JOURNAL_LAYOUT_FIXTURE) {
    mkdirSync("tests/visual/fixtures", { recursive: true })
    writeFileSync(
      "tests/visual/fixtures/journal.generated.html",
      `<!doctype html><html class="dark" data-visual-identity="onerep"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import '/src/styles/index.css'; import '/src/pages/journal.css'; import '/src/components/page-chrome.css'; document.documentElement.dataset.stylesReady='true';</script></head><body><div class="app-route-shell"><div class="app-route-frame app-route-frame-current" data-route-path="/journal" data-page-bar="true">${html}</div></div>${renderToStaticMarkup(<CollapsingPageBar pathname="/journal" />)}</body></html>`
    )
  }
})

const { TrackerHistory } =
  await import("../../src/pages/journal/tracker-history")
test("history shows recorded zero separately from missing readings", () => {
  const html = renderToStaticMarkup(
    <TrackerHistory
      metric={{
        _id: "metric-sleep" as never,
        title: "Sleep duration",
        description: "",
        tab: "body",
        kind: "number",
        unit: "h",
        step: 0.5,
        accent: "progress",
        entries: [
          { date: today, value: 8 },
          { date: "2026-09-23", value: 0 },
        ],
      }}
      date={today}
      onClose={() => {}}
      onEdit={() => {}}
    />
  )
  expect(html).toContain("Average reading")
  expect(html).toContain("4 h")
  expect(html).toContain("Not logged")
  if (process.env.JOURNAL_LAYOUT_FIXTURE)
    writeFileSync(
      "tests/visual/fixtures/journal-history.generated.html",
      `<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import '/src/styles/index.css'; import '/src/pages/journal.css'; document.documentElement.dataset.stylesReady='true';</script></head><body><main style="max-width:540px;margin:auto;padding-top:24px">${html}</main></body></html>`
    )
})
