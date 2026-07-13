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
  detail: string
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
      detail: "See what you logged and make any corrections.",
      actionLabel: "Review",
    }
  }

  if (activeWorkout) {
    return {
      action: "resume_workout",
      title: "Workout in progress",
      detail: "Your active session is ready to continue.",
      actionLabel: "Resume",
    }
  }

  if (completedWorkout && proteinLeft > 15) {
    return {
      action: "log_recovery_food",
      title: `${Math.round(proteinLeft)}g protein still to go`,
      detail: "A recovery meal will help close today's gap.",
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
      detail: "Your planned session is ready to start.",
      actionLabel: "Start",
    }
  }

  if (foodLogCount === 0) {
    return {
      action: "log_meal",
      title: "Log your first meal",
      detail: "Start today's record with what you ate.",
      actionLabel: "Log food",
    }
  }

  if (waterProgress < 50) {
    return {
      action: "add_water",
      title: `${Math.max(0, Math.round(100 - waterProgress))}% hydration left`,
      detail: "A glass of water is the simplest next win.",
      actionLabel: "Add 250 ml",
    }
  }

  return {
    action: "review_day",
    title:
      proteinLeft > 0
        ? `${Math.round(proteinLeft)}g protein left`
        : "On track today",
    detail:
      proteinLeft > 0
        ? "Review today's food and choose a protein-rich option."
        : "Everything important is moving in the right direction.",
    actionLabel: "Review",
  }
}
