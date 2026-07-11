export type DashboardActionKey =
  | "resume_workout"
  | "start_workout"
  | "log_recovery_food"
  | "log_meal"
  | "add_water"
  | "review_day"

export type DashboardBriefing = {
  action: DashboardActionKey
  title: string
  actionLabel: string
}

export function buildDashboardBriefing({
  activeWorkout,
  completedWorkout,
  scheduledWorkout,
  isToday,
  foodLogCount,
  proteinLeft,
  waterProgress,
  burnedCalories,
}: {
  activeWorkout: boolean
  completedWorkout: boolean
  scheduledWorkout: boolean
  isToday: boolean
  foodLogCount: number
  proteinLeft: number
  waterProgress: number
  burnedCalories: number
}): DashboardBriefing {
  if (!isToday) {
    return {
      action: "review_day",
      title: "Review this day",
      actionLabel: "Review",
    }
  }

  if (activeWorkout) {
    return {
      action: "resume_workout",
      title: "Workout in progress",
      actionLabel: "Resume",
    }
  }

  if (completedWorkout && proteinLeft > 15) {
    return {
      action: "log_recovery_food",
      title: `${Math.round(proteinLeft)}g protein still to go`,
      actionLabel:
        burnedCalories > 0
          ? `Fuel +${Math.round(burnedCalories)} kcal`
          : "Log food",
    }
  }

  if (scheduledWorkout && !completedWorkout) {
    return {
      action: "start_workout",
      title: "Today’s workout is ready",
      actionLabel: "Start",
    }
  }

  if (foodLogCount === 0) {
    return {
      action: "log_meal",
      title: "Log your first meal",
      actionLabel: "Log food",
    }
  }

  if (waterProgress < 50) {
    return {
      action: "add_water",
      title: `${Math.max(0, Math.round(100 - waterProgress))}% hydration left`,
      actionLabel: "Add 250 ml",
    }
  }

  return {
    action: "review_day",
    title:
      proteinLeft > 0
        ? `${Math.round(proteinLeft)}g protein left`
        : "On track today",
    actionLabel: "Review",
  }
}
