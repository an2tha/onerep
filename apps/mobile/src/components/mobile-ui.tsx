import type { ComponentType, ReactNode } from "react"
import { cn } from "@/lib/utils"

type IconComponent = ComponentType<{
  size?: number
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
  className?: string
}>

type Tone = "neutral" | "food" | "water" | "supplement" | "workout" | "progress"

const toneVars: Record<Tone, string> = {
  neutral:
    "[--tone:var(--foreground)] [--tone-bg:color-mix(in_srgb,var(--foreground)_7%,transparent)]",
  food: "[--tone:var(--accent-food)] [--tone-bg:var(--accent-food-bg)]",
  water: "[--tone:var(--accent-water)] [--tone-bg:var(--accent-water-bg)]",
  supplement:
    "[--tone:var(--accent-supplement)] [--tone-bg:var(--accent-supplement-bg)]",
  workout:
    "[--tone:var(--accent-workout)] [--tone-bg:var(--accent-workout-bg)]",
  progress:
    "[--tone:var(--accent-progress)] [--tone-bg:var(--accent-progress-bg)]",
}

export function MobilePage({
  children,
  className,
  bottomInset = "nav",
}: {
  children: ReactNode
  className?: string
  bottomInset?: "nav" | "none"
}) {
  return (
    <main
      className={cn(
        "motion-page mx-auto min-h-svh w-full max-w-xl bg-transparent text-foreground md:max-w-6xl",
        bottomInset === "nav"
          ? "pb-[calc(var(--app-safe-bottom-lg)+6.5rem)] md:pb-10"
          : "pb-[var(--app-safe-bottom-lg)]",
        className
      )}
    >
      {children}
    </main>
  )
}

export function PageHeader({
  title,
  subtitle,
  leading,
  trailing,
  compact = false,
}: {
  title: string
  subtitle?: string
  leading?: ReactNode
  trailing?: ReactNode
  compact?: boolean
}) {
  return (
    <header
      className={cn(
        "motion-item app-header px-4 md:px-6",
        compact
          ? "pt-[var(--app-safe-top)] pb-3"
          : "pt-[calc(var(--app-safe-top)+0.25rem)] pb-5"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0">
          {subtitle && (
            <p className="app-eyebrow truncate">
              {subtitle}
            </p>
          )}
          <h1
            className={cn(
              "app-title truncate",
              compact && "text-[1.32rem] md:text-[1.55rem]"
            )}
          >
            {title}
          </h1>
        </div>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  )
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "motion-item app-section-header",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="app-section-title">{title}</h2>
        {subtitle && (
          <p className="app-section-subtitle">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: string
  value: string | number
  detail?: string
  icon?: IconComponent
  tone?: Tone
  className?: string
}) {
  return (
    <div
      className={cn(
        "motion-card app-rail-surface min-h-[72px] px-3 py-2.5 transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out",
        toneVars[tone],
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-bold text-muted-foreground/72">
          {label}
        </p>
        {Icon && (
          <span className="app-icon-button motion-pop h-7 w-7 shrink-0 bg-muted/55 text-muted-foreground/70">
            <Icon size={14} weight="bold" />
          </span>
        )}
      </div>
      <p className="app-display mt-1 truncate text-[20px] tabular-nums">
        {value}
      </p>
      {detail && (
        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/60">
          {detail}
        </p>
      )}
    </div>
  )
}

type DockAction = {
  label: string
  onClick: () => void
  icon?: IconComponent
  disabled?: boolean
}

export function ActionDock({
  primary,
  secondary,
  danger,
  className,
}: {
  primary: DockAction
  secondary?: DockAction
  danger?: DockAction
  className?: string
}) {
  return (
    <div
      className={cn(
        "md:backdrop-blur-0 fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-xl flex-wrap items-stretch gap-2 border-t border-border/50 bg-background/92 px-3 pt-3 pb-[var(--app-safe-bottom)] backdrop-blur-xl md:static md:max-w-none md:flex-nowrap md:border-0 md:bg-transparent md:px-0 md:py-0",
        "motion-card",
        className
      )}
    >
      {danger && (
        <DockButton action={danger} variant="danger" className="basis-14 grow" />
      )}
      {secondary && (
        <DockButton
          action={secondary}
          variant="secondary"
          className="basis-14 grow"
        />
      )}
      <DockButton action={primary} variant="primary" className="basis-32 grow-[2]" />
    </div>
  )
}

function DockButton({
  action,
  variant,
  className,
}: {
  action: DockAction
  variant: "primary" | "secondary" | "danger"
  className?: string
}) {
  const Icon = action.icon
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={cn(
        "motion-pressable flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] px-3 text-[13px] font-bold active:opacity-85 disabled:opacity-45",
        variant === "primary" && "bg-foreground text-background",
        variant === "secondary" && "bg-muted text-foreground",
        variant === "danger" && "bg-destructive/10 text-destructive",
        className
      )}
    >
      {Icon && <Icon size={15} weight="bold" className="shrink-0" />}
      <span className="min-w-0 truncate">{action.label}</span>
    </button>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
  tone = "neutral",
  className,
}: {
  icon: IconComponent
  title: string
  detail?: string
  action?: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <div
      className={cn(
        "motion-card app-empty flex-col items-center px-5 py-5 text-center",
        toneVars[tone],
        className
      )}
    >
      <span className="app-icon-button motion-pop h-10 w-10 bg-muted/55 text-muted-foreground/70">
        <Icon size={20} weight="bold" />
      </span>
      <p className="mt-3 text-[15px] font-bold">{title}</p>
      {detail && (
        <p className="mt-1 max-w-[17rem] text-[12px] leading-5 text-muted-foreground/65">
          {detail}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
