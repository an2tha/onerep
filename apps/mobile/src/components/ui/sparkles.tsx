import type { ReactNode } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

type SparklesProps = {
  children?: ReactNode
  className?: string
  sparkleClassName?: string
  count?: number
}

const positions = [
  { left: "8%", top: "18%", delay: 0, scale: 0.8 },
  { left: "24%", top: "68%", delay: 0.8, scale: 1 },
  { left: "62%", top: "12%", delay: 1.4, scale: 0.7 },
  { left: "84%", top: "42%", delay: 0.35, scale: 1.1 },
  { left: "72%", top: "78%", delay: 1.05, scale: 0.85 },
  { left: "42%", top: "34%", delay: 1.75, scale: 0.65 },
]

export function Sparkles({
  children,
  className,
  sparkleClassName,
  count = 6,
}: SparklesProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {positions.slice(0, count).map((sparkle, index) => (
          <motion.span
            key={index}
            className={cn(
              "absolute h-1.5 w-1.5 rounded-full bg-foreground/45 shadow-[0_0_14px_color-mix(in_srgb,var(--foreground)_35%,transparent)]",
              sparkleClassName
            )}
            style={{ left: sparkle.left, top: sparkle.top }}
            initial={{ opacity: 0.18, scale: sparkle.scale }}
            animate={{
              opacity: [0.18, 0.72, 0.18],
              scale: [sparkle.scale, sparkle.scale * 1.45, sparkle.scale],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              delay: sparkle.delay,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  )
}
