import { describe, test, expect } from "bun:test"
import {
  buildWeeklyReport,
  completedWeek,
  daysBetween,
  isoWeekKey,
  loggedDaysInWindow,
  missedLogTrigger,
  trainingLapseTrigger,
  usualLogMinutes,
  weeklyReportTrigger,
  weekStartOf,
  type MomentFoodLog,
  type MomentWorkoutLog,
} from "../moments"

/** A day of food logged at local `hours`, one entry per hour given. */
function foodDay(
  date: string,
  hours: number[],
  macros: { calories?: number; protein?: number } = {}
): MomentFoodLog {
  return {
    date,
    entries: hours.map((hour) => ({
      loggedAt: new Date(
        `${date}T${String(hour).padStart(2, "0")}:00:00`
      ).toISOString(),
      calories: macros.calories ?? 600,
      protein: macros.protein ?? 40,
    })),
  }
}

function workout(
  date: string,
  sets = 4,
  durationSeconds = 2700
): MomentWorkoutLog {
  return {
    date,
    durationSeconds,
    exercises: [
      { sets: Array.from({ length: sets }, () => ({ completed: true })) },
    ],
  }
}

// Wednesday.
const TODAY = "2026-04-15"

function habitDays(count: number, lastHour = 20) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(`${TODAY}T12:00:00`)
    day.setDate(day.getDate() - (index + 1))
    const hours = lastHour > 13 ? [8, 13, lastHour] : [lastHour]
    return foodDay(day.toISOString().slice(0, 10), hours)
  })
}

describe("usualLogMinutes", () => {
  test("is the median of each day's last entry", () => {
    expect(usualLogMinutes(habitDays(5, 20), TODAY)).toBe(20 * 60)
  })

  test("needs a few days before it claims to know anything", () => {
    expect(usualLogMinutes(habitDays(2), TODAY)).toBeNull()
  })

  test("ignores today, which is the day being judged", () => {
    const logs = [...habitDays(4, 19), foodDay(TODAY, [7])]
    expect(usualLogMinutes(logs, TODAY)).toBe(19 * 60)
  })

  test("clamps an early-riser habit up to the earliest polite hour", () => {
    expect(usualLogMinutes(habitDays(5, 8), TODAY)).toBe(11 * 60)
  })

  test("clamps a night owl back from midnight", () => {
    expect(usualLogMinutes(habitDays(5, 23), TODAY)).toBe(22 * 60 + 30)
  })
})

describe("loggedDaysInWindow", () => {
  test("counts only days with entries, today excluded", () => {
    const logs = [...habitDays(3), { date: TODAY, entries: [] }]
    expect(loggedDaysInWindow(logs, TODAY, 7)).toBe(3)
  })
})

describe("missedLogTrigger", () => {
  const logs = habitDays(6, 20)

  test("fires once the grace period after the usual time has passed", () => {
    const result = missedLogTrigger({
      foodLogs: logs,
      todayKey: TODAY,
      nowMinutes: 20 * 60 + 45,
    })
    expect(result?.key).toBe(TODAY)
    expect(result?.usualMinutes).toBe(20 * 60)
  })

  test("stays quiet before the grace period is up", () => {
    expect(
      missedLogTrigger({
        foodLogs: logs,
        todayKey: TODAY,
        nowMinutes: 20 * 60 + 30,
      })
    ).toBeNull()
  })

  test("stays quiet once anything is logged today", () => {
    expect(
      missedLogTrigger({
        foodLogs: [...logs, foodDay(TODAY, [9])],
        todayKey: TODAY,
        nowMinutes: 23 * 60,
      })
    ).toBeNull()
  })

  test("stays quiet for someone with no logging habit to miss", () => {
    expect(
      missedLogTrigger({
        foodLogs: habitDays(2),
        todayKey: TODAY,
        nowMinutes: 23 * 60,
      })
    ).toBeNull()
  })

  test("does not fire in the small hours of a new day", () => {
    expect(
      missedLogTrigger({ foodLogs: logs, todayKey: TODAY, nowMinutes: 60 })
    ).toBeNull()
  })
})

describe("trainingLapseTrigger", () => {
  const trained = [
    workout("2026-04-01"),
    workout("2026-04-03"),
    workout("2026-04-06"),
    workout("2026-04-10"),
  ]

  test("fires after four days off", () => {
    const result = trainingLapseTrigger({
      workoutLogs: trained,
      todayKey: "2026-04-15",
    })
    expect(result?.daysSince).toBe(5)
    expect(result?.lastWorkoutDate).toBe("2026-04-10")
  })

  test("stays quiet inside the gap", () => {
    expect(
      trainingLapseTrigger({ workoutLogs: trained, todayKey: "2026-04-13" })
    ).toBeNull()
  })

  test("stays quiet for someone who never trained here", () => {
    expect(
      trainingLapseTrigger({
        workoutLogs: [workout("2026-04-01")],
        todayKey: TODAY,
      })
    ).toBeNull()
  })

  test("does not count days marked as deliberate rest", () => {
    expect(
      trainingLapseTrigger({
        workoutLogs: trained,
        todayKey: "2026-04-15",
        restDates: ["2026-04-13", "2026-04-14"],
      })
    ).toBeNull()
  })

  test("still fires when only part of the gap was planned", () => {
    const result = trainingLapseTrigger({
      workoutLogs: trained,
      todayKey: "2026-04-17",
      restDates: ["2026-04-13", "2026-04-14"],
    })
    expect(result?.idleDays).toBe(5)
    expect(result?.daysSince).toBe(7)
    expect(result?.idleDates).toEqual([
      "2026-04-11",
      "2026-04-12",
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
    ])
  })

  test("reports the gap it would mark as rest", () => {
    const result = trainingLapseTrigger({
      workoutLogs: trained,
      todayKey: "2026-04-15",
    })
    expect(result?.idleDates).toEqual([
      "2026-04-11",
      "2026-04-12",
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
    ])
  })

  test("re-arms weekly rather than daily", () => {
    const first = trainingLapseTrigger({
      workoutLogs: trained,
      todayKey: "2026-04-15",
    })
    const nextDay = trainingLapseTrigger({
      workoutLogs: trained,
      todayKey: "2026-04-16",
    })
    const nextWeek = trainingLapseTrigger({
      workoutLogs: trained,
      todayKey: "2026-04-21",
    })
    expect(nextDay?.key).toBe(first?.key)
    expect(nextWeek?.key).not.toBe(first?.key)
  })
})

describe("week arithmetic", () => {
  test("weekStartOf returns Monday, including for a Sunday", () => {
    expect(weekStartOf("2026-04-15")).toBe("2026-04-13")
    expect(weekStartOf("2026-04-19")).toBe("2026-04-13")
    expect(weekStartOf("2026-04-13")).toBe("2026-04-13")
  })

  test("isoWeekKey numbers the week the Monday belongs to", () => {
    expect(isoWeekKey("2026-04-13")).toBe("2026-W16")
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01")
  })

  test("daysBetween counts calendar days", () => {
    expect(daysBetween("2026-04-10", "2026-04-15")).toBe(5)
  })

  test("the current week closes on Sunday evening", () => {
    expect(completedWeek("2026-04-19", 17 * 60)).toEqual({
      start: "2026-04-06",
      end: "2026-04-12",
    })
    expect(completedWeek("2026-04-19", 18 * 60)).toEqual({
      start: "2026-04-13",
      end: "2026-04-19",
    })
  })

  test("midweek still reports on the week that finished", () => {
    expect(completedWeek("2026-04-15", 12 * 60)).toEqual({
      start: "2026-04-06",
      end: "2026-04-12",
    })
  })
})

describe("buildWeeklyReport", () => {
  const foodLogs = [
    foodDay("2026-04-13", [8, 13, 19], { calories: 700, protein: 50 }),
    foodDay("2026-04-14", [8, 13, 19], { calories: 700, protein: 50 }),
    foodDay("2026-04-15", [8, 13, 19], { calories: 700, protein: 50 }),
  ]
  const workoutLogs = [
    workout("2026-04-07"),
    workout("2026-04-14", 5),
    workout("2026-04-16", 6),
  ]

  const report = buildWeeklyReport({
    start: "2026-04-13",
    end: "2026-04-19",
    foodLogs,
    workoutLogs,
    bodyMeasurements: [
      { loggedAt: "2026-04-13T07:00:00.000Z", weightKg: 80 },
      { loggedAt: "2026-04-18T07:00:00.000Z", weightKg: 79.4 },
    ],
    calorieTarget: 2100,
    proteinTarget: 150,
  })

  test("counts only the week's sessions and compares with the one before", () => {
    expect(report.training.workouts).toBe(2)
    expect(report.training.completedSets).toBe(11)
    expect(report.training.previousWorkouts).toBe(1)
  })

  test("averages nutrition over logged days, not over seven", () => {
    expect(report.nutrition.loggedDays).toBe(3)
    expect(report.nutrition.averageCalories).toBe(2100)
    expect(report.nutrition.onTargetDays).toBe(3)
  })

  test("reads weight as the change across the week", () => {
    expect(report.body.weightDeltaKg).toBe(-0.6)
    expect(report.body.latestWeightKg).toBe(79.4)
  })

  test("returns all seven days, empty ones included", () => {
    expect(report.days).toHaveLength(7)
    expect(report.days.map((day) => day.date)).toEqual([
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
      "2026-04-18",
      "2026-04-19",
    ])
    expect(report.days[1].sets).toBe(5)
    expect(report.days[1].loggedFood).toBe(true)
    expect(report.days[5].sets).toBe(0)
    expect(report.days[5].loggedFood).toBe(false)
  })

  test("labels the week and says something about it", () => {
    expect(report.weekKey).toBe("2026-W16")
    expect(report.headline).toContain("2 sessions")
    expect(report.highlights.length).toBeGreaterThan(0)
  })
})

describe("a week with a target", () => {
  const args = {
    start: "2026-04-13",
    end: "2026-04-19",
    foodLogs: [],
    workoutLogs: [workout("2026-04-14"), workout("2026-04-16")],
    bodyMeasurements: [],
    calorieTarget: 2000,
    proteinTarget: 150,
  }

  test("leads with the promise when it was kept", () => {
    const report = buildWeeklyReport({ ...args, target: 2 })
    expect(report.metTarget).toBe(true)
    expect(report.headline).toBe(
      "You said 2. You did 2. Nothing further from me."
    )
  })

  test("and when it was not", () => {
    const report = buildWeeklyReport({ ...args, target: 4 })
    expect(report.metTarget).toBe(false)
    expect(report.headline).toContain("You said 4, you did 2")
  })

  test("says nothing about a target that was never set", () => {
    const report = buildWeeklyReport(args)
    expect(report.target).toBeNull()
    expect(report.metTarget).toBeNull()
  })

  test("an empty week still reports when a target was set for it", () => {
    expect(
      weeklyReportTrigger({
        todayKey: "2026-04-20",
        nowMinutes: 10 * 60,
        foodLogs: [],
        workoutLogs: [],
        bodyMeasurements: [],
        calorieTarget: 2000,
        proteinTarget: 150,
        target: 3,
      })
    ).not.toBeNull()
  })
})

describe("weeklyReportTrigger", () => {
  test("skips a week with nothing in it", () => {
    expect(
      weeklyReportTrigger({
        todayKey: "2026-04-20",
        nowMinutes: 10 * 60,
        foodLogs: [],
        workoutLogs: [],
        bodyMeasurements: [],
        calorieTarget: 2000,
        proteinTarget: 150,
      })
    ).toBeNull()
  })

  test("reports the finished week when there is anything to say", () => {
    const result = weeklyReportTrigger({
      todayKey: "2026-04-20",
      nowMinutes: 10 * 60,
      foodLogs: [foodDay("2026-04-15", [8, 19])],
      workoutLogs: [workout("2026-04-16")],
      bodyMeasurements: [],
      calorieTarget: 2000,
      proteinTarget: 150,
    })
    expect(result?.key).toBe("2026-W16")
    expect(result?.report.start).toBe("2026-04-13")
    expect(result?.report.end).toBe("2026-04-19")
  })
})
