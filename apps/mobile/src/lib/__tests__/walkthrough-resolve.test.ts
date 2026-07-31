import { describe, expect, test } from "bun:test"
import {
  deriveLegacySuppression,
  isNeverInterruptRoute,
  resolveChapterSteps,
  resolveResumeIndex,
  resolveTourAction,
  walkthroughStatusLabel,
  type ResolveInput,
} from "../walkthrough/resolve"
import { WALKTHROUGH_CHAPTERS, findChapter } from "../walkthrough/chapters"
import type {
  ChapterProgressRecord,
  TourChapter,
  TourContext,
} from "../walkthrough/types"

const PRO: TourContext = {
  hasPro: true,
  simpleMode: false,
  netCarbsEnabled: false,
  mealTargetsEnabled: false,
  hasActiveFast: false,
}
const FREE: TourContext = { ...PRO, hasPro: false }

function input(overrides: Partial<ResolveInput> = {}): ResolveInput {
  return {
    pathname: "/nutrition",
    progress: {},
    chapters: WALKTHROUGH_CHAPTERS,
    ctx: PRO,
    blocked: false,
    welcomeSeen: true,
    primerShownThisSession: false,
    ...overrides,
  }
}

function record(
  overrides: Partial<ChapterProgressRecord> = {}
): ChapterProgressRecord {
  return {
    status: "in_progress",
    stepIndex: 0,
    version: 1,
    updatedAt: 0,
    ...overrides,
  }
}

describe("walkthrough trigger resolution", () => {
  test("starts a fresh chapter at the first step", () => {
    const result = resolveTourAction(input())
    expect(result.action).toBe("start")
    if (result.action !== "start") return
    expect(result.chapter.id).toBe("nutrition")
    expect(result.startIndex).toBe(0)
  })

  test("resumes an interrupted chapter where it left off", () => {
    const result = resolveTourAction(
      input({ progress: { nutrition: record({ stepIndex: 2 }) } })
    )
    expect(result.action).toBe("start")
    if (result.action !== "start") return
    expect(result.startIndex).toBe(2)
  })

  test("clamps a resume index that outruns the resolved step count", () => {
    // Pro user got deep into Coach, then downgraded: fewer steps now exist.
    const coach = findChapter("coach") as TourChapter
    const freeSteps = resolveChapterSteps(coach, FREE)
    expect(
      resolveResumeIndex(record({ stepIndex: 99 }), freeSteps.length, 1)
    ).toBe(freeSteps.length - 1)
  })

  test("does not re-fire completed or skipped chapters", () => {
    for (const status of ["completed", "skipped"] as const) {
      expect(
        resolveTourAction(
          input({ progress: { nutrition: record({ status }) } })
        ).action
      ).toBe("none")
    }
  })

  test("re-offers a chapter whose content version moved on", () => {
    const result = resolveTourAction(
      input({
        progress: { nutrition: record({ status: "completed", version: 0 }) },
      })
    )
    expect(result.action).toBe("start")
    if (result.action !== "start") return
    expect(result.startIndex).toBe(0)
  })

  test("blocked outranks everything, including the welcome sheet", () => {
    expect(
      resolveTourAction(input({ blocked: true, welcomeSeen: false })).action
    ).toBe("none")
  })

  test("a sub-route does not trigger its parent hub chapter", () => {
    expect(
      resolveTourAction(input({ pathname: "/nutrition/report" })).action
    ).toBe("none")
  })
})

describe("hub chapters versus primers on task routes", () => {
  test("a primer runs on its task route", () => {
    const result = resolveTourAction(input({ pathname: "/nutrition/fasting" }))
    expect(result.action).toBe("start")
    if (result.action !== "start") return
    expect(result.chapter.kind).toBe("primer")
  })

  test("only one primer fires per session", () => {
    expect(
      resolveTourAction(
        input({ pathname: "/nutrition/fasting", primerShownThisSession: true })
      ).action
    ).toBe("none")
  })

  test("a hub chapter still runs when a primer already did", () => {
    expect(
      resolveTourAction(
        input({ pathname: "/nutrition", primerShownThisSession: true })
      ).action
    ).toBe("start")
  })

  test("every primer route is a task route the hub rules would have blocked", () => {
    const primerRoutes = WALKTHROUGH_CHAPTERS.filter(
      (chapter) => chapter.kind === "primer"
    ).map((chapter) => chapter.route)

    expect(primerRoutes).toEqual([
      "/nutrition/fasting",
      "/nutrition/groceries",
      "/shared",
    ])
  })
})

describe("never-interrupt routes", () => {
  test("an invited viewer is never interrupted", () => {
    expect(isNeverInterruptRoute("/shared/accept")).toBe(true)
    expect(isNeverInterruptRoute("/shared/abc123")).toBe(true)
    expect(isNeverInterruptRoute("/workout/active")).toBe(true)
    expect(isNeverInterruptRoute("/shared")).toBe(false)
  })

  test("the welcome sheet does not ambush an accept link", () => {
    expect(
      resolveTourAction(
        input({ pathname: "/shared/accept", welcomeSeen: false })
      ).action
    ).toBe("none")
  })
})

describe("feature-conditional steps", () => {
  const nutrition = findChapter("nutrition") as TourChapter

  test("the meal budget step appears only when the preference is on", () => {
    const off = resolveChapterSteps(nutrition, PRO).map((step) => step.id)
    const on = resolveChapterSteps(nutrition, {
      ...PRO,
      mealTargetsEnabled: true,
    }).map((step) => step.id)

    expect(off).not.toContain("nutrition.mealBudget")
    expect(on).toContain("nutrition.mealBudget")
    expect(on.length).toBe(off.length + 1)
  })

  test("the fasting pill step appears only during an active fast", () => {
    const ids = resolveChapterSteps(nutrition, {
      ...PRO,
      hasActiveFast: true,
    }).map((step) => step.id)
    expect(ids).toContain("nutrition.fastingPill")
  })

  test("carb copy follows the net-carbs preference", () => {
    const step = nutrition.steps.find((s) => s.id === "nutrition.macros")!
    const body = step.body as (ctx: TourContext) => string
    expect(body({ ...PRO, netCarbsEnabled: true })).toContain("net carbs")
    expect(body({ ...PRO, netCarbsEnabled: false })).toContain("carbs")
    expect(body({ ...PRO, netCarbsEnabled: false })).not.toContain("net carbs")
  })
})

describe("free users", () => {
  const coach = findChapter("coach") as TourChapter

  test("the Coach chapter drops every AI step and stays meaningful", () => {
    // Every other Coach step is an AI surface, so the discovery step is what
    // keeps this chapter from resolving to nothing for a free user.
    const ids = resolveChapterSteps(coach, FREE).map((step) => step.id)
    expect(ids).toEqual(["coach.more"])
    expect(ids[0]).toBeDefined()
  })

  test("no free-user step mentions Pro or upgrading", () => {
    for (const chapter of WALKTHROUGH_CHAPTERS) {
      for (const step of resolveChapterSteps(chapter, FREE)) {
        const body =
          typeof step.body === "function" ? step.body(FREE) : step.body
        const copy = `${step.title} ${body}`
        // Word-boundary matched: "Progress" is a tab name, not a Pro mention.
        expect(copy).not.toMatch(/\bpro\b/i)
        expect(copy).not.toMatch(/\bupgrade\b/i)
        expect(copy).not.toMatch(/\bsubscri/i)
      }
    }
  })

  test("a chapter that resolves to zero steps never starts", () => {
    const allPro: TourChapter = {
      id: "coach",
      title: "Coach",
      route: "/coach",
      version: 1,
      kind: "hub",
      steps: [
        {
          id: "coach.only",
          anchor: "x",
          title: "t",
          body: "b",
          requiresPro: true,
        },
      ],
    }
    expect(resolveResumeIndex(undefined, 0, 1)).toBeNull()
    expect(
      resolveTourAction(
        input({ pathname: "/coach", chapters: [allPro], ctx: FREE })
      ).action
    ).toBe("none")
  })
})

describe("settings labels and legacy suppression", () => {
  const nutrition = findChapter("nutrition") as TourChapter

  test("labels reflect status and the user's own step count", () => {
    expect(walkthroughStatusLabel(undefined, nutrition, PRO)).toBe(
      "Not started"
    )
    expect(
      walkthroughStatusLabel(record({ status: "completed" }), nutrition, PRO)
    ).toBe("Completed")
    expect(
      walkthroughStatusLabel(record({ status: "skipped" }), nutrition, PRO)
    ).toBe("Skipped")
    expect(
      walkthroughStatusLabel(record({ stepIndex: 1 }), nutrition, PRO)
    ).toBe(`2 of ${resolveChapterSteps(nutrition, PRO).length}`)
  })

  test("denominators differ between free and Pro users", () => {
    const coach = findChapter("coach") as TourChapter
    expect(walkthroughStatusLabel(record(), coach, FREE)).toBe("1 of 1")
    expect(walkthroughStatusLabel(record(), coach, PRO)).not.toBe("1 of 1")
  })

  test("suppresses tours for users who already dismissed the old tooltips", () => {
    expect(deriveLegacySuppression([1, 2, 3], {})).toBe(true)
    expect(deriveLegacySuppression([1], {})).toBe(false)
    expect(deriveLegacySuppression(undefined, {})).toBe(false)
    // Never suppress once real walkthrough progress exists.
    expect(deriveLegacySuppression([1, 2, 3, 4], { today: record() })).toBe(
      false
    )
  })
})
