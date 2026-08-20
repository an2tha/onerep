import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

const SETTINGS = read("./Settings.tsx")
const ABOUT = read("../components/about-app.tsx")
const MAIN = read("../main.tsx")
const SHEET = read("../../../../packages/ui/src/components/mobile-sheet.tsx")
const RECIPE = read("./NewRecipe.tsx")
const EN = JSON.parse(read("../i18n/locales/en.json"))

/**
 * "I installed the update and nothing changed" has to be answerable from
 * inside the app. Two update channels, neither of them visible, is how a
 * person ends up reinstalling to find out what they are running.
 */
describe("About and version reporting", () => {
  test("Settings has an About view", () => {
    expect(SETTINGS).toContain('showView("about")')
    expect(SETTINGS).toContain('activeView === "about"')
    expect(SETTINGS).toContain("<AboutApp />")
    expect(EN.settings.titles.about).toBe("About")
  })

  test("it names the store build and the web bundle separately", () => {
    expect(ABOUT).toContain("CapacitorApp.getInfo()")
    expect(ABOUT).toContain('title="App version"')
    expect(ABOUT).toContain('title="Web bundle"')
    expect(ABOUT).toContain("checkForOtaUpdate({ force: true })")
    expect(ABOUT).toContain("Reinstalling is never needed.")
  })
})

describe("Android back", () => {
  test("one handler closes overlays before it pops the route", () => {
    expect(MAIN).toContain('CapacitorApp.addListener("backButton"')
    expect(MAIN).toContain("if (dismissTopmost()) return")
    expect(SHEET).toContain("pushDismissHandler(() => dismissRef.current())")
  })
})

describe("editing a recipe that is gone", () => {
  test("says so instead of rendering a blank edit form", () => {
    expect(RECIPE).toContain(
      "if (id && recipesQuery !== undefined && !initial) {"
    )
    expect(RECIPE).toContain("This recipe is no longer in your library.")
    expect(RECIPE).toContain("Build it again")
  })

  test("the recipe routes have an error boundary like every other route", () => {
    expect(MAIN).toContain('<ErrorBoundary label="Recipe">')
  })
})

describe("an unstamped build says what it is", () => {
  const BUILD_INFO = read("../lib/build-info.ts")

  test("0.0.0 is never shown as a version", () => {
    expect(ABOUT).toContain("isStampedVersion(info.appVersion)")
    expect(ABOUT).toContain('shortCommit(info.build?.commit) || "Development"')
    expect(BUILD_INFO).toContain('const UNSTAMPED_VERSION = "0.0.0"')
  })

  test("the stamp is read from the build's own version.json", () => {
    expect(BUILD_INFO).toContain("version.json")
    expect(BUILD_INFO).toContain("import.meta.env.BASE_URL")
    expect(ABOUT).toContain('title="Build"')
  })
})
