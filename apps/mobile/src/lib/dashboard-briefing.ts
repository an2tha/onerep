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
  caloriesLeft = 0,
  scheduledWorkoutName,
  currentMealLabel = "meal",
}: {
  activeWorkout: boolean
  completedWorkout: boolean
  scheduledWorkout: boolean
  isToday: boolean
  foodLogCount: number
  proteinLeft: number
  waterProgress: number
  burnedCalories: number
  caloriesLeft?: number
  scheduledWorkoutName?: string
  currentMealLabel?: string
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

  if (scheduledWorkout && !completedWorkout) {
    return {
      action: "start_workout",
      title: scheduledWorkoutName ?? "Today’s workout",
      detail: "Start the planned session and OneRep will track each set.",
      actionLabel: "Start workout",
    }
  }

  if (completedWorkout && (proteinLeft > 15 || caloriesLeft > 250)) {
    const roundedProtein = Math.max(0, Math.round(proteinLeft))
    return {
      action: "log_recovery_food",
      title:
        roundedProtein > 15
          ? `${roundedProtein}g protein for recovery`
          : "Refuel after training",
      detail:
        caloriesLeft > 0
          ? `${Math.round(caloriesLeft)} kcal remain today. Log your recovery meal.`
          : "Log a protein-rich meal to support recovery.",
      actionLabel:
        burnedCalories > 0
          ? `Log recovery food`
          : `Log ${currentMealLabel.toLowerCase()}`,
    }
  }

  if (foodLogCount === 0) {
    return {
      action: "log_meal",
      title: `Log ${currentMealLabel.toLowerCase()}`,
      detail:
        caloriesLeft > 0
          ? `${Math.round(caloriesLeft)} kcal are available today.`
          : "Add what you ate to start today's nutrition record.",
      actionLabel: "Add food",
    }
  }

  if (waterProgress < 40) {
    return {
      action: "add_water",
      title: "Hydration is behind",
      detail: `You're at ${Math.max(0, Math.round(waterProgress))}% of today's water goal.`,
      actionLabel: "Add 250 ml",
    }
  }

  if (proteinLeft > 10) {
    return {
      action: "log_meal",
      title: `${Math.round(proteinLeft)}g protein left`,
      detail: "Add a protein-rich food to close the most important macro gap.",
      actionLabel: "Add protein",
    }
  }

  return {
    action: "review_day",
    title: "Today is on track",
    detail:
      caloriesLeft > 0
        ? `${Math.round(caloriesLeft)} kcal remain. Review the day before your next meal.`
        : "Your workout, nutrition, and hydration are up to date.",
    actionLabel: "Review today",
  }
}
