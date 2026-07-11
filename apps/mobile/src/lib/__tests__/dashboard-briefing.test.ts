import { describe, expect, test } from "bun:test"
import { buildDashboardBriefing } from "../dashboard-briefing"

const base = {
  activeWorkout: false,
  completedWorkout: false,
  scheduledWorkout: false,
  isToday: true,
  foodLogCount: 2,
  proteinLeft: 40,
  waterProgress: 70,
  burnedCalories: 0,
}

describe("dashboard briefing", () => {
  test("resuming an active workout is always the next action", () => {
    expect(
      buildDashboardBriefing({ ...base, activeWorkout: true }).action
    ).toBe("resume_workout")
  })

  test("completed training turns a protein gap into recovery guidance", () => {
    const briefing = buildDashboardBriefing({
      ...base,
      completedWorkout: true,
      burnedCalories: 320,
    })
    expect(briefing.action).toBe("log_recovery_food")
    expect(briefing.actionLabel).toContain("320 kcal")
  })

  test("a scheduled session is prioritized before generic logging", () => {
    expect(
      buildDashboardBriefing({
        ...base,
        scheduledWorkout: true,
        foodLogCount: 0,
      }).action
    ).toBe("start_workout")
  })

  test("past dates become review mode", () => {
    expect(buildDashboardBriefing({ ...base, isToday: false }).action).toBe(
      "review_day"
    )
  })
})
