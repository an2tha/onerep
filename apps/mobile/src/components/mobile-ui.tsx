import type { ComponentType, ReactNode } from "react"
import { cn } from "@/lib/utils"

type IconComponent = ComponentType<{
  size?: number
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
  className?: string
}>

type Tone = "neutral" | "food" | "water" | "workout" | "progress"

const toneVars: Record<Tone, string> = {
  neutral:
    "[--tone:var(--foreground)] [--tone-bg:color-mix(in_srgb,var(--foreground)_7%,transparent)]",
  food: "[--tone:var(--accent-food)] [--tone-bg:var(--accent-food-bg)]",
  water: "[--tone:var(--accent-water)] [--tone-bg:var(--accent-water-bg)]",
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
        "motion-page mx-auto min-h-svh w-full max-w-xl bg-background text-foreground md:max-w-5xl",
        bottomInset === "nav"
          ? "pb-[calc(var(--app-safe-bottom-lg)+5.5rem)] md:pb-10"
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
        "motion-item flex items-center justify-between gap-3 px-4 md:px-6",
        compact
          ? "pt-[var(--app-safe-top)] pb-2.5"
          : "pt-[calc(var(--app-safe-top)+0.25rem)] pb-3.5"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          {subtitle && (
            <p className="truncate text-[10px] font-bold tracking-[0.16em] text-muted-foreground/55 uppercase">
              {subtitle}
            </p>
          )}
          <h1
            className={cn(
              "truncate font-semibold tracking-tight",
              compact
                ? "text-[1.22rem] leading-snug"
                : "text-[1.45rem] leading-tight"
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
        "motion-item mb-2.5 flex items-end justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[13px] font-bold tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">
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
        "motion-card min-h-[68px] rounded-[18px] border border-border/55 bg-card px-3 py-2.5 transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out",
        toneVars[tone],
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold text-muted-foreground/70">
          {label}
        </p>
        {Icon && (
          <span className="motion-pop flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--tone-bg)] text-[var(--tone)]">
            <Icon size={14} weight="bold" />
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-[18px] leading-tight font-bold tracking-tight tabular-nums">
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
        "md:backdrop-blur-0 fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-xl gap-2 border-t border-border/50 bg-background/86 px-4 pt-3 pb-[var(--app-safe-bottom)] backdrop-blur-xl md:static md:max-w-none md:border-0 md:bg-transparent md:px-0 md:py-0",
        "motion-card",
        className
      )}
    >
      {danger && <DockButton action={danger} variant="danger" />}
      {secondary && <DockButton action={secondary} variant="secondary" />}
      <DockButton action={primary} variant="primary" className="flex-1" />
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
        "motion-pressable flex h-12 min-w-12 items-center justify-center gap-2 rounded-[20px] px-4 text-[13px] font-bold active:opacity-85 disabled:opacity-45",
        variant === "primary" && "bg-foreground text-background",
        variant === "secondary" && "bg-muted text-foreground",
        variant === "danger" && "bg-destructive/10 text-destructive",
        className
      )}
    >
      {Icon && <Icon size={15} weight="bold" />}
      {action.label}
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
        "motion-card flex flex-col items-center rounded-[22px] border border-dashed border-border/60 bg-card/70 px-5 py-6 text-center",
        toneVars[tone],
        className
      )}
    >
      <span className="motion-pop flex h-11 w-11 items-center justify-center rounded-full bg-[var(--tone-bg)] text-[var(--tone)]">
        <Icon size={20} weight="bold" />
      </span>
      <p className="mt-3 text-[15px] font-bold tracking-tight">{title}</p>
      {detail && (
        <p className="mt-1 max-w-[17rem] text-[12px] leading-5 text-muted-foreground/65">
          {detail}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
