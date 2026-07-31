import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { extname, join } from "node:path"
import {
  HIDDEN_DESTINATIONS,
  HUB_CHAPTERS,
  WALKTHROUGH_CHAPTERS,
} from "../walkthrough/chapters"
import { resolveChapterSteps } from "../walkthrough/resolve"
import type { TourContext } from "../walkthrough/types"

const PRO: TourContext = {
  hasPro: true,
  simpleMode: false,
  netCarbsEnabled: false,
  mealTargetsEnabled: true,
  hasActiveFast: true,
}
const FREE: TourContext = { ...PRO, hasPro: false }

/** The five bottom-bar destinations, mirroring TABS in bottom-bar.tsx. */
const TAB_ROUTES = ["/", "/nutrition", "/workouts", "/progress", "/coach"]

describe("walkthrough chapter registry", () => {
  test("step ids are unique and namespaced by chapter", () => {
    const ids = WALKTHROUGH_CHAPTERS.flatMap((chapter) =>
      chapter.steps.map((step) => step.id)
    )
    expect(new Set(ids).size).toBe(ids.length)

    for (const chapter of WALKTHROUGH_CHAPTERS) {
      for (const step of chapter.steps) {
        expect(step.id.startsWith(`${chapter.id}.`)).toBe(true)
      }
    }
  })

  test("chapter routes are distinct", () => {
    const routes = WALKTHROUGH_CHAPTERS.map((chapter) => chapter.route)
    expect(new Set(routes).size).toBe(routes.length)
  })

  test("every hub chapter maps to a bottom-bar tab", () => {
    expect(HUB_CHAPTERS.map((chapter) => chapter.route).sort()).toEqual(
      [...TAB_ROUTES].sort()
    )
  })

  test("hub chapters stay short for both free and Pro users", () => {
    for (const chapter of HUB_CHAPTERS) {
      const pro = resolveChapterSteps(chapter, PRO)
      const free = resolveChapterSteps(chapter, FREE)
      expect(pro.length).toBeGreaterThanOrEqual(3)
      expect(pro.length).toBeLessThanOrEqual(5)
      expect(free.length).toBeGreaterThanOrEqual(1)
    }
  })

  test("primers are genuinely brief", () => {
    for (const chapter of WALKTHROUGH_CHAPTERS) {
      if (chapter.kind !== "primer") continue
      expect(chapter.steps.length).toBeGreaterThanOrEqual(1)
      expect(chapter.steps.length).toBeLessThanOrEqual(2)
    }
  })

  test("each hub chapter has exactly one discovery step", () => {
    for (const chapter of HUB_CHAPTERS) {
      const discovery = chapter.steps.filter(
        (step) => step.kind === "discovery"
      )
      expect(discovery.length).toBe(1)
      expect(discovery[0]?.links?.length ?? 0).toBeGreaterThan(0)
    }
  })

  /**
   * The highest-value test here: adding a destination without surfacing it
   * anywhere in the walkthrough fails CI instead of shipping undiscoverable.
   */
  test("discovery steps cover every non-tab destination", () => {
    const surfaced = new Set(
      WALKTHROUGH_CHAPTERS.flatMap((chapter) =>
        chapter.steps.flatMap(
          (step) => step.links?.map((link) => link.to) ?? []
        )
      )
    )
    const primerRoutes = WALKTHROUGH_CHAPTERS.filter(
      (chapter) => chapter.kind === "primer"
    ).map((chapter) => chapter.route)

    for (const destination of HIDDEN_DESTINATIONS) {
      // A destination counts as covered by a discovery link or by its own primer.
      expect(
        surfaced.has(destination) || primerRoutes.includes(destination)
      ).toBe(true)
    }
  })

  test("discovery links never point at a bottom-bar tab", () => {
    for (const chapter of WALKTHROUGH_CHAPTERS) {
      for (const step of chapter.steps) {
        for (const link of step.links ?? []) {
          expect(TAB_ROUTES).not.toContain(link.to)
        }
      }
    }
  })

  test("every anchor is wired to a real target in the app", () => {
    const root = join(import.meta.dir, "../..")
    const sources: string[] = []

    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          walk(path)
        } else if ([".ts", ".tsx"].includes(extname(path))) {
          sources.push(readFileSync(path, "utf8"))
        }
      }
    }
    walk(root)
    const all = sources.join("\n")

    // Either binding form counts: the <TourAnchor> wrapper or the ref hook.
    const isWired = (anchor: string) =>
      all.includes(`anchor="${anchor}"`) ||
      all.includes(`useTourAnchor("${anchor}")`)

    // Compared as a list of names so a failure names the missing anchors
    // instead of dumping every source file into the diff.
    const missing = WALKTHROUGH_CHAPTERS.flatMap((chapter) =>
      chapter.steps.filter((step) => !isWired(step.anchor)).map((s) => s.anchor)
    )
    expect(missing).toEqual([])
  })
})
