import type { ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import { GuidedTooltip } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { hapticMedium } from "@/lib/haptics"

export const APP_TOOLTIP_IDS = {
  dashboardLogMeal: 1,
  dashboardWater: 2,
  dashboardWorkout: 3,
  dashboardGoals: 4,
  profileMobile: 5,
  profileDesktop: 6,
  foodsSearch: 20,
  nutritionAdd: 30,
  waterQuickAdd: 40,
  workoutsStart: 50,
  supplementsCreate: 60,
  progressCheckIn: 70,
  coachMessage: 80,
  coachStarters: 81,
  coachNewChat: 82,
  settingsTargets: 90,
} as const

type AppTooltipId = (typeof APP_TOOLTIP_IDS)[keyof typeof APP_TOOLTIP_IDS]

type AppTooltipProps = {
  id: AppTooltipId
  content: ReactNode
  children: ReactNode
  className?: string
  targetClassName?: string
  side?: React.ComponentProps<typeof GuidedTooltip>["side"]
  align?: React.ComponentProps<typeof GuidedTooltip>["align"]
  enabled?: boolean
}

export function AppTooltip({
  id,
  content,
  children,
  className,
  targetClassName,
  side = "bottom",
  align = "center",
  enabled = true,
}: AppTooltipProps) {
  const completed = useQuery(api.users.tooltips.isTooltipCompleted, { id })
  const markCompleted = useMutation(api.users.tooltips.markTooltipCompleted)

  return (
    <GuidedTooltip
      id={id}
      order={id}
      enabled={enabled}
      completed={completed !== false}
      content={content}
      className={className}
      targetClassName={targetClassName}
      side={side}
      align={align}
      onOpenHaptic={hapticMedium}
      onComplete={() => markCompleted({ tooltipId: id })}
    >
      {children}
    </GuidedTooltip>
  )
}

export { MetricTooltip } from "@repo/ui"
