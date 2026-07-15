import {
  ArrowsClockwise,
  CheckCircle,
  CloudArrowUp,
  Warning,
  WifiSlash,
} from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { cn } from "../lib/utils"

export function SettingsSectionIntro({ children }: { children: ReactNode }) {
  return (
    <p className="native-supporting px-[var(--app-page-x)] pb-2 md:max-w-xl">
      {children}
    </p>
  )
}

export function SettingsSectionLabel({
  title,
  detail,
  danger = false,
}: {
  title: string
  detail?: string
  danger?: boolean
}) {
  return (
    <div className="px-[var(--app-page-x)] pt-7 pb-2">
      <h2
        className={cn(
          "text-[15px] font-semibold tracking-tight",
          danger ? "text-destructive" : "text-foreground"
        )}
      >
        {title}
      </h2>
      {detail && <p className="native-row-detail mt-0.5">{detail}</p>}
    </div>
  )
}

export function SettingsLoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading settings"
      className="flex min-h-[45svh] flex-col items-center justify-center px-6 text-center"
    >
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70" />
      <p className="native-section-title mt-4">Loading settings</p>
      <p className="native-row-detail mt-1 max-w-[18rem]">
        Syncing your preferences, goals, and account controls.
      </p>
    </div>
  )
}

export function SettingsStatusPill({
  label,
  strong = false,
}: {
  label: string
  strong?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-2.5 text-[13px] font-semibold",
        strong
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  )
}

export function SyncStatusIcon({
  status,
  online,
  syncing,
}: {
  status: string
  online: boolean
  syncing: boolean
}) {
  if (syncing)
    return (
      <ArrowsClockwise
        size={18}
        aria-hidden
        className="animate-spin text-muted-foreground"
      />
    )
  if (status === "error")
    return <Warning size={18} aria-hidden className="text-destructive" />
  if (!online)
    return <WifiSlash size={18} aria-hidden className="text-muted-foreground" />
  return status === "synced" ? (
    <CheckCircle size={18} aria-hidden className="text-muted-foreground" />
  ) : (
    <CloudArrowUp size={18} aria-hidden className="text-muted-foreground" />
  )
}

export type AiUsageView = {
  count: number
  remaining: number
  limit: number
  month: string
}

function formatUsageMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return "This month"
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function AiUsageProgress({ usage }: { usage?: AiUsageView | null }) {
  const limit = usage?.limit ?? 150
  const count = usage?.count ?? 0
  const remaining = usage?.remaining ?? limit
  const percent =
    limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0
  return (
    <div className="px-[var(--app-page-x)] py-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="native-row-title">Monthly requests</p>
          <p className="native-row-detail mt-0.5">
            {formatUsageMonth(usage?.month ?? "")} · {remaining} request
            {remaining === 1 ? "" : "s"} left
          </p>
        </div>
        <p className="native-row-value shrink-0">
          {count}/{limit}
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Monthly AI usage"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={count}
      >
        <div
          className="h-full rounded-full transition-[width,background-color]"
          style={{
            width: `${percent}%`,
            backgroundColor:
              remaining <= 15 ? "var(--status-danger)" : "var(--foreground)",
          }}
        />
      </div>
      <p className="native-row-detail mt-2">
        Shared across AI metrics, workout generation, and food photo analysis.
      </p>
    </div>
  )
}
