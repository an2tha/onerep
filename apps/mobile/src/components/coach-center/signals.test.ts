import { test } from "node:test"
import assert from "node:assert/strict"
import { coachSignals } from "./signals"
const base = { today: "2026-10-16", logs: [], checkIns: [], goals: [] }
const goal = {
  _id: "g",
  title: "Consistency",
  startDate: "2026-10-01",
  endDate: "2026-10-20",
  tasks: [
    { _id: "a", title: "First", completed: true },
    { _id: "b", title: "Next", completed: false },
  ],
}
test("active recovery suppresses competing training and goal suggestions", () => {
  const signals = coachSignals({
    ...base,
    recovery: { active: { phase: "resting" } },
    goals: [goal],
    restart: { plan: { status: "active", stage: 0 } },
  })
  assert.deepEqual(
    signals.map((s) => s.kind),
    ["recovery"],
  )
})
test("an explicit restart plan takes precedence over generic prompts", () => {
  assert.equal(
    coachSignals({
      ...base,
      restart: { plan: { status: "active", stage: 1, action: "rest" } },
    })[0].kind,
    "restart",
  )
})
test("only today's daily check-in can trigger a recovery review", () => {
  const checkIn = {
    date: base.today,
    kind: "daily",
    energy: 2,
    sleepQuality: 4,
    soreness: 1,
    updatedAt: 1,
  }
  assert.equal(coachSignals({ ...base, checkIns: [checkIn] })[0].kind, "adjust")
  assert.equal(
    coachSignals({
      ...base,
      checkIns: [{ ...checkIn, date: "2026-10-15" }],
    }).some((s) => s.kind === "adjust"),
    false,
  )
  assert.equal(
    coachSignals({
      ...base,
      checkIns: [{ ...checkIn, kind: "post_workout" }],
    }).some((s) => s.kind === "adjust"),
    false,
  )
  assert.notEqual(
    coachSignals({ ...base, checkIns: [checkIn] })[0].key,
    coachSignals({ ...base, checkIns: [{ ...checkIn, updatedAt: 2 }] })[0].key,
  )
})
test("goal prompts skip completed tasks and never present expired or future goals as today's steps", () => {
  assert.equal(coachSignals({ ...base, goals: [goal] })[0].title, "Next")
  assert.equal(
    coachSignals({ ...base, goals: [{ ...goal, endDate: "2026-10-15" }] }).some(
      (s) => s.kind === "goal",
    ),
    false,
  )
  assert.equal(
    coachSignals({
      ...base,
      goals: [{ ...goal, startDate: "2026-10-18" }],
    }).some((s) => s.kind === "goal"),
    false,
  )
  assert.equal(
    coachSignals({ ...base, goals: [{ ...goal, endDate: "2026-10-15" }] }).some(
      (s) => s.kind === "revisit",
    ),
    true,
  )
})
test("week comparisons use records in exact date windows and exclude future logs", () => {
  const logs = [
    "2026-10-16",
    "2026-10-10",
    "2026-10-09",
    "2026-10-03",
    "2026-10-02",
    "2026-10-17",
  ].map((date) => ({ date }))
  const activity = coachSignals({ ...base, logs }).find(
    (s) => s.kind === "activity",
  )
  assert.equal(activity?.count, 2)
  assert.equal(activity?.previous, 2)
})
test("bounded history does not claim a complete previous-week comparison", () => {
  const activity = coachSignals({
    ...base,
    logs: Array.from({ length: 120 }, () => ({ date: base.today })),
  }).find((s) => s.kind === "activity")
  assert.equal(activity?.previous, undefined)
})
test("stale AI reviews are not surfaced as current advice", () => {
  const review = {
    id: "r",
    createdAt: Date.parse("2026-10-01"),
    headline: "Old review",
    summary: "Old summary",
  }
  assert.equal(
    coachSignals({ ...base, review }).some((s) => s.kind === "review"),
    false,
  )
  assert.equal(
    coachSignals({
      ...base,
      review: { ...review, createdAt: Date.parse("2026-10-16") },
    })[0].kind,
    "review",
  )
})
test("empty data prompts a check-in and better logging without invented activity", () => {
  assert.deepEqual(
    coachSignals(base).map((s) => s.kind),
    ["checkin", "logging"],
  )
})
