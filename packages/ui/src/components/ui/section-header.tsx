import * as React from "react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  title: string
  sub?: string
  action?: React.ReactNode
  className?: string
}

function SectionHeader({
  title,
  sub,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-2.5 flex items-end justify-between gap-3", className)}>
      <div className="flex flex-col">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {sub && (
          <p className="mt-0.5 text-[11px] leading-none text-muted-foreground/60">{sub}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center">{action}</div>}
    </div>
  )
}

export { SectionHeader }
