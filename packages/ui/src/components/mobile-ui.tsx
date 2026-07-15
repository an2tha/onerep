import { CaretRight } from "@phosphor-icons/react"
import type {
  ButtonHTMLAttributes,
  ComponentType,
  InputHTMLAttributes,
  ReactNode,
} from "react"

import { cn } from "../lib/utils"

type IconComponent = ComponentType<{
  size?: number
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
  className?: string
}>

export type MobileTone =
  "neutral" | "food" | "water" | "supplement" | "workout" | "progress"

const toneVars: Record<MobileTone, string> = {
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

export function AppScaffold({
  children,
  className,
  bottomInset = "tabs",
}: {
  children: ReactNode
  className?: string
  bottomInset?: "tabs" | "none"
}) {
  return (
    <main
      className={cn(
        "native-page mx-auto min-h-svh w-full max-w-xl text-foreground md:max-w-6xl",
        bottomInset === "tabs"
          ? "pb-[calc(var(--app-safe-bottom)+5.75rem)] lg:pb-10"
          : "pb-[var(--app-safe-bottom)]",
        className
      )}
    >
      {children}
    </main>
  )
}

export function NavigationBar({
  title,
  subtitle,
  leading,
  trailing,
  large = true,
  className,
}: {
  title: string
  subtitle?: string
  leading?: ReactNode
  trailing?: ReactNode
  large?: boolean
  className?: string
}) {
  return (
    <header className={cn("native-navigation-bar", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <div className="min-w-0">
          {subtitle && <p className="native-supporting truncate">{subtitle}</p>}
          <h1
            className={cn(
              large ? "native-large-title" : "native-title",
              "truncate"
            )}
          >
            {title}
          </h1>
        </div>
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-1">{trailing}</div>
      )}
    </header>
  )
}

export function GroupedList({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <section className={cn("native-group", className)} aria-label={label}>
      {children}
    </section>
  )
}

export type ListRowProps = {
  title: ReactNode
  detail?: ReactNode
  value?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  className?: string
}

export function ListRow({
  title,
  detail,
  value,
  leading,
  trailing,
  onClick,
  disabled,
  busy,
  className,
}: ListRowProps) {
  const content = (
    <>
      {leading && <span className="native-row-leading">{leading}</span>}
      <span className="min-w-0 flex-1 text-left">
        <span className="native-row-title block">{title}</span>
        {detail && (
          <span className="native-row-detail mt-0.5 block">{detail}</span>
        )}
      </span>
      {value && <span className="native-row-value shrink-0">{value}</span>}
      {trailing && <span className="shrink-0">{trailing}</span>}
    </>
  )

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      className={cn("native-list-row w-full", className)}
    >
      {content}
    </button>
  ) : (
    <div className={cn("native-list-row", className)}>{content}</div>
  )
}

export function DisclosureRow(props: Omit<ListRowProps, "trailing">) {
  return (
    <ListRow
      {...props}
      trailing={
        <CaretRight size={18} aria-hidden className="text-muted-foreground" />
      }
    />
  )
}

export function SummaryBlock({
  title,
  value,
  detail,
  action,
  tone = "neutral",
  children,
  className,
}: {
  title: string
  value?: ReactNode
  detail?: ReactNode
  action?: ReactNode
  tone?: MobileTone
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cn("native-summary", toneVars[tone], className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="native-supporting">{title}</p>
          {value && <div className="native-summary-value mt-1">{value}</div>}
          {detail && <p className="native-row-detail mt-2">{detail}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}

export function StatRow({
  label,
  value,
  detail,
  color,
}: {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  color?: string
}) {
  return (
    <div className="native-stat-row">
      <span className="flex min-w-0 items-center gap-2">
        {color && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        )}
        <span className="native-row-title truncate">{label}</span>
      </span>
      <span className="text-right">
        <span className="native-row-value block">{value}</span>
        {detail && <span className="native-row-detail block">{detail}</span>}
      </span>
    </div>
  )
}

export function PrimaryButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={cn("native-primary-button", className)} />
  )
}

export function ToolbarButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={cn("native-toolbar-button", className)} />
  )
}

export function FormField({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
}) {
  const id =
    props.id ??
    `field-${props.name ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  return (
    <label htmlFor={id} className="native-field">
      <span className="native-field-label">{label}</span>
      <input {...props} id={id} className={cn("native-input", className)} />
      {error ? (
        <span className="native-field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="native-field-hint">{hint}</span>
      ) : null}
    </label>
  )
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
    <AppScaffold
      className={className}
      bottomInset={bottomInset === "nav" ? "tabs" : "none"}
    >
      {children}
    </AppScaffold>
  )
}

export function PageHeader({
  compact = false,
  ...props
}: Omit<React.ComponentProps<typeof NavigationBar>, "large"> & {
  compact?: boolean
}) {
  return <NavigationBar {...props} large={!compact} />
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
        "flex items-end justify-between gap-4 px-[var(--app-page-x)] pt-6 pb-2",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="native-section-title">{title}</h2>
        {subtitle && <p className="native-row-detail mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
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
  tone?: MobileTone
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 border-y border-border px-[var(--app-page-x)] py-5 text-left",
        toneVars[tone],
        className
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center text-[var(--tone)]">
        <Icon size={21} weight="regular" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="native-row-title font-semibold">{title}</p>
        {detail && <p className="native-row-detail mt-1 max-w-xl">{detail}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}
