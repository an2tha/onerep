import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type DotBackgroundProps = {
  children?: ReactNode
  className?: string
  gridClassName?: string
  fadeClassName?: string
}

export function DotBackground({
  children,
  className,
  gridClassName,
  fadeClassName,
}: DotBackgroundProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 [background-image:radial-gradient(color-mix(in_srgb,var(--foreground)_16%,transparent)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_78%)] [background-size:18px_18px] opacity-[0.38]",
          gridClassName
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--foreground)_9%,transparent),transparent_68%)]",
          fadeClassName
        )}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
