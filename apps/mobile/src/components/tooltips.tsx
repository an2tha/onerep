import type { ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import { GuidedTooltip } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { hapticMedium } from "@/lib/haptics"

/**
 * One-off contextual hints that are not part of the guided walkthrough.
 * Everything else moved into `@/lib/walkthrough/chapters`; kept as an object so
 * adding another one-off does not reshape the call sites.
 */
export const APP_TOOLTIP_IDS = {
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
      onComplete={async () => {
        await markCompleted({ tooltipId: id })
      }}
    >
      {children}
    </GuidedTooltip>
  )
}

export { MetricTooltip } from "@repo/ui"
