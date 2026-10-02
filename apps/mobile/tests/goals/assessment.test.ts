import { expect, test } from "bun:test"
import {
  buildGoalAssessment,
  assessmentDate,
  MUSCLE_GROUPS,
} from "../../../../convex/lib/goalAssessment"
import { assessmentFixture } from "./assessment-fixture"

test("whole-body model includes every group, stable personal baselines and six factors", () => {
  const a = buildGoalAssessment(assessmentFixture())
  expect(a.coverage).toBe(86)
  expect(a.score).toBeGreaterThanOrEqual(95)
  expect(a.muscles.map((m) => m.muscle)).toEqual(MUSCLE_GROUPS)
  expect(a.muscles.find((m) => m.muscle === "chest")?.direct).toBe(8)
  expect(a.muscles.find((m) => m.muscle === "triceps")?.weighted).toBe(4)
  expect(a.muscles.find((m) => m.muscle === "calves")?.score).toBeNull()
  expect(a.signals.hrv.baselineReadings).toBe(25)
  expect(a.suggestions[0].id).toBe("hold")
})

test("poor sleep and cardiac signals override otherwise good training", () => {
  const input = assessmentFixture()
  input.health.slice(0, 3).forEach((r) => {
    r.sleepMinutes = 280
    r.hrvMs = 35
    r.restingHeartRateBpm = 65
  })
  const a = buildGoalAssessment(input)
  expect(a.severe).toBe(true)
  expect(a.score).toBeLessThanOrEqual(40)
  expect(a.suggestions[0].id).toBe("ease-load")
  expect(a.suggestions.some((s) => s.id === "volume-low")).toBe(false)
})

test("missing and stale data stay unknown, not failed or cleared to add work", () => {
  const input = assessmentFixture()
  input.health = input.health.filter(
    (r) => r.date < assessmentDate(input.today, -7)
  )
  const a = buildGoalAssessment(input)
  expect(a.score).toBeNull()
  expect(a.signals.sleep.recent).toBeNull()
  expect(a.factors.find((f) => f.id === "recovery")?.score).toBeNull()
  input.workouts = []
  input.health = []
  const empty = buildGoalAssessment(input)
  expect(empty.coverage).toBe(0)
  expect(empty.muscles.every((m) => m.score === null)).toBe(true)
  expect(empty.suggestions.some((s) => s.id === "volume-low")).toBe(false)
})

test("providers are not pooled and manual HRV cannot stand in for sensor readings", () => {
  const input = assessmentFixture()
  input.health.slice(0, 3).forEach((r) => (r.provider = "health_connect"))
  expect(buildGoalAssessment(input).signals.hrv.baseline).toBeNull()
  input.health = input.health.map((r) => ({ ...r, manualFields: ["hrvMs"] }))
  expect(buildGoalAssessment(input).signals.hrv.recent).toBeNull()
})

test("warmups, incomplete sets, future logs and duplicate muscle aliases are excluded", () => {
  const input = assessmentFixture()
  input.catalog.press = {
    primaryMuscles: ["chest", "pectorals"],
    secondaryMuscles: ["chest", "triceps", "triceps"],
  }
  input.workouts = [
    {
      date: input.today,
      durationSeconds: 100,
      exercises: [
        {
          id: "press",
          sets: [
            { completed: true },
            { completed: true, type: "warmup" },
            { completed: false },
            { completed: true, type: "warm-up" },
          ],
        },
      ],
    },
    {
      date: assessmentDate(input.today, 1),
      durationSeconds: 100,
      exercises: [{ id: "press", sets: [{ completed: true }] }],
    },
  ]
  const a = buildGoalAssessment(input)
  expect(a.context.workingSets).toBe(1)
  expect(a.muscles.find((m) => m.muscle === "chest")?.direct).toBe(1)
  expect(a.muscles.find((m) => m.muscle === "chest")?.indirect).toBe(0)
  expect(a.muscles.find((m) => m.muscle === "triceps")?.indirect).toBe(1)
})

test("linked and dismissed imported workouts never inflate exercise time", () => {
  const input = assessmentFixture()
  input.activities = [
    {
      date: input.today,
      provider: "apple_health",
      externalId: "a",
      durationSeconds: 3600,
      linkedDate: input.today,
    },
    {
      date: input.today,
      provider: "apple_health",
      externalId: "b",
      durationSeconds: 3600,
      dismissedAt: 0,
    },
    ...[1, 2].map(() => ({
      date: input.today,
      provider: "apple_health",
      externalId: "c",
      durationSeconds: 1800,
    })),
  ]
  expect(buildGoalAssessment(input).context.minutes).toBe(150)
})

test("partial food logs prompt review without changing the overall score", () => {
  const input = assessmentFixture()
  const before = buildGoalAssessment(input).score
  input.food = [
    {
      date: assessmentDate(input.today, -1),
      entries: [{ protein: 20, calories: 200 }],
    },
  ]
  const a = buildGoalAssessment(input)
  expect(a.score).toBe(before)
  expect(a.suggestions.some((s) => s.id === "protein")).toBe(true)
})

test("incomplete windows and recovery plans withhold scoring and load increases", () => {
  const input = assessmentFixture()
  input.truncated = true
  let a = buildGoalAssessment(input)
  expect(a.score).toBeNull()
  expect(a.factors.find((f) => f.id === "training")?.score).toBeNull()
  expect(a.suggestions.some((s) => s.id.startsWith("volume"))).toBe(false)
  input.truncated = false
  input.paused = true
  a = buildGoalAssessment(input)
  expect(a.score).toBeNull()
  expect(a.suggestions[0].id).toBe("recovery-plan")
})

test("consecutive substantial sessions combine with recovery warnings", () => {
  const input = assessmentFixture()
  input.workouts.slice(0, 2).forEach((w, i) => {
    w.date = assessmentDate(input.today, -i)
    ;(w.exercises[0] as { sets: unknown[] }).sets.push({ completed: true })
  })
  input.health.slice(0, 3).forEach((r) => (r.sleepMinutes = 330))
  const a = buildGoalAssessment(input)
  expect(a.muscles.find((m) => m.muscle === "chest")?.closeSpacing).toBe(true)
  expect(a.suggestions.some((s) => s.id === "spacing")).toBe(true)
})

test("declining comparable lifts suppress load increases; missing effort stays ungraded", () => {
  const input = assessmentFixture()
  for (const w of input.workouts.slice(0, 2))
    for (const ex of w.exercises as { sets: { weight: number }[] }[])
      for (const s of ex.sets) s.weight = 40
  let a = buildGoalAssessment(input)
  expect(a.suggestions.some((s) => s.id === "performance")).toBe(true)
  for (const w of input.workouts)
    for (const ex of w.exercises as { sets: { rir?: number }[] }[])
      for (const s of ex.sets) delete s.rir
  a = buildGoalAssessment(input)
  expect(a.factors.find((f) => f.id === "performance")?.score).toBeNull()
})
