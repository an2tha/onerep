import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { extname, join, relative } from "node:path"

const sourceRoot = join(import.meta.dir)
const forbiddenImports = [
  /from ["']convex(?:\/|["'])/,
  /from ["']react-router(?:\/|["'])/,
  /from ["']@capacitor\//,
  /from ["']@\/lib\//,
  /from ["'][^"']*apps\/mobile/,
  /from ["'][^"']*convex\/_generated/,
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return [".ts", ".tsx"].includes(extname(path)) && !path.endsWith(".test.ts")
      ? [path]
      : []
  })
}

describe("@repo/ui package boundary", () => {
  test("does not import application, backend, router, or native modules", () => {
    const violations = sourceFiles(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8")
      return forbiddenImports
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(sourceRoot, path)}: ${pattern}`)
    })

    expect(violations).toEqual([])
  })

  test("mobile consumes the public UI boundary instead of primitive libraries", () => {
    const mobileRoot = join(sourceRoot, "../../../apps/mobile")
    const mobileSource = sourceFiles(join(mobileRoot, "src"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")

    expect(existsSync(join(mobileRoot, "components.json"))).toBe(false)
    for (const dependency of [
      "sonner",
      "radix-ui",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
    ]) {
      expect(mobileSource).not.toMatch(
        new RegExp(`from ["']${dependency.replace("-", "\\-")}["']`)
      )
    }
  })

  test("mobile component modules are controllers and platform adapters only", () => {
    const mobileComponents = join(
      sourceRoot,
      "../../../apps/mobile/src/components"
    )
    const allowedModules = new Set([
      // Mints and revokes API keys over Convex, and reaches for the clipboard.
      // The panel itself is grouped-list primitives from @repo/ui.
      "api-keys-section.tsx",
      "auth-guard.tsx",
      // The payment UI seam. index.tsx is a gitignored re-export swapped by
      // scripts/ensure-billing-provider.mjs: private builds get the checkout
      // in _private/payment-ui.tsx, open clones get a copy of index.stub.tsx.
      // All of it is billing state, checkout flow, and platform gating —
      // app-side by nature, drawn with @repo/ui primitives.
      "billing/index.tsx",
      "billing/index.stub.tsx",
      "billing/types.ts",
      "billing/_private/payment-ui.tsx",
      "auth-shell.tsx",
      "bottom-bar.tsx",
      // Convex writes and haptics behind the shared sheet and button
      // primitives; the catalog it edits is app-side.
      "custom-exercise-sheet.tsx",
      "check-in-history.tsx",
      "health-metric-picker.tsx",
      "track-something-new.tsx",
      "dial-custom-metrics.tsx",
      "health-readings-sheet.tsx",
      "custom-metric-log-sheet.tsx",
      "check-in-readings-sheet.tsx",
      "custom-metric-builder-sheet.tsx",
      "error-boundary.tsx",
      "food-detail-sheet.tsx",
      // Form coach: camera and MediaRecorder capture, Convex reads and
      // writes, haptics, and router navigation bound to the presentational
      // primitives in @repo/ui.
      "form-coach-card.tsx",
      "form-coach-pose-confirm.tsx",
      "form-coach-recorder.tsx",
      "form-coach-review-sheet.tsx",
      // Renders null; registers this device for Coach's outbound push and
      // routes a tapped notification.
      "coach-push-registration.tsx",
      // free-exercise-db illustrations: steps through the dataset's start and
      // finish stills, with haptics on the frame switch.
      "exercise-art.tsx",
      // The coach between sets: one question, one Convex action, rendered in
      // the shared MobileSheet chrome.
      "in-workout-coach.tsx",
      // Renders null; pulls platform health workouts into Convex on
      // foreground — HealthKit on iOS, Health Connect on Android.
      "health-sync.tsx",
      // Backdates a workout against the app's local-date and preset helpers,
      // with haptics on the day strip.
      "log-past-workout-sheet.tsx",
      // The exercise catalog: a Convex query, a router push per row, and the
      // client-side filtering that keeps ~900 movements searchable without a
      // round trip. The rows and thumbnails it draws come from @repo/ui.
      "exercise-library.tsx",
      // Both of these mount a whole page inside a sheet — the fasting screen
      // over the diary, the coach over a live workout — so that pressing one
      // button does not cost a route change and tear the screen underneath
      // down. A package cannot import an app's pages.
      "fasting-sheet.tsx",
      "coach-sheet.tsx",
      "meal-category-sync.tsx",
      "mobile-sheet.tsx",
      // Full-screen moments: triggers read Convex history, answers write
      // through Convex mutations, and both navigate. The chrome they wear
      // (MomentScreen, MomentRow, WeekStrip) is presentational and lives in
      // @repo/ui — nothing in here draws anything the package could.
      "moments/app-moments.tsx",
      "moments/check-in-moment.tsx",
      "moments/quick-food-step.tsx",
      "moments/quick-log-step.tsx",
      "moments/weekly-report-moment.tsx",
      // The server-written Sunday review: applies proposed operations through
      // the same Convex action Coach chat uses.
      "moments/weekly-review-moment.tsx",
      "offline-sync-indicator.tsx",
      // Points the app at a different backend: reads and writes the device's
      // server override, then reloads. The choice rows and field chrome come
      // from @repo/ui.
      "server-picker.tsx",
      // Renders null; drives the native OTA plugin's check/apply/rollback
      // lifecycle.
      "ota-lifecycle.tsx",
      // Reads the shell's version from Capacitor and the bundle's from the
      // OTA plugin, and can force an update check. The rows are @repo/ui's.
      "about-app.tsx",
      // Imperative three.js renderer driving a WebGL canvas and OrbitControls.
      "pose-viewer.tsx",
      "tooltips.tsx",
      // Walkthrough: Convex persistence, router, and haptics bound to the
      // presentational spotlight primitives in @repo/ui.
      "walkthrough/tour-anchor.tsx",
      "walkthrough/tour-context.tsx",
      "walkthrough/tour-provider.tsx",
      // Progress's nested week rings: the key doubles as the page's tab
      // switcher, so it drives page state and fires haptics on the way.
      "progress-hero.tsx",
      // The training hero's dials: the centre one is a native haptic
      // instrument first — the ring only reports what the taptic engine is
      // already saying — so it stays on the side of the fence that can talk
      // to the phone.
      "training-hero-dials.tsx",
      // The coach's computed lift verdicts and recovery read-out on Progress,
      // straight from a Convex query.
      "training-insights-panel.tsx",
      // Renders null; reads the account age from Convex and emits the daily
      // retention event against Capacitor's app-state listener.
      "retention-tracking.tsx",
      // Renders null; reads the shell and OTA bundle versions off Capacitor
      // and registers them against the account.
      "app-version-report.tsx",
      // Renders null; syncs Convex data into the iOS widget extension.
      "widget-data-sync.tsx",
    ])
    const unexpected = sourceFiles(mobileComponents)
      .map((path) => relative(mobileComponents, path))
      .filter((path) => !path.endsWith(".test.tsx"))
      .filter((path) => !allowedModules.has(path))

    expect(unexpected).toEqual([])
  })
})
