import { useState, type ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  GuidedTooltip,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui"
import { Info } from "@phosphor-icons/react"
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

type MetricTooltipProps = {
  label: string
  children: ReactNode
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  align?: React.ComponentProps<typeof TooltipContent>["align"]
}

/** Persistent, user-invoked help for metric definitions and chart legends. */
export function MetricTooltip({
  label,
  children,
  side = "top",
  align = "center",
}: MetricTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${label}`}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
          >
            <Info size={17} weight="regular" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          sideOffset={6}
          className="max-w-[min(20rem,calc(100vw-2rem))] leading-5"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
