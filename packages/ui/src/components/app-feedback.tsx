import {
  ArrowsClockwise,
  CloudArrowUp,
  Info,
  Warning,
  WifiSlash,
  X,
} from "@phosphor-icons/react"
import { useState, type ReactNode } from "react"

import { APP_ACCENT_COLORS, tint } from "../lib/design-tokens"
import { cn } from "../lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip"

export function MetricTooltip({
  label,
  children,
  side = "top",
  align = "center",
}: {
  label: string
  children: ReactNode
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  align?: React.ComponentProps<typeof TooltipContent>["align"]
}) {
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
            <Info size={17} aria-hidden />
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

export type SyncStatusView = {
  tone: "error" | "warning" | "pending" | "success" | string
  title: string
  body: string
  canRetry: boolean
}

export function OfflineSyncStatus({
  status,
  online,
  syncing,
  onRetry,
  onDismiss,
}: {
  status: SyncStatusView
  online: boolean
  syncing: boolean
  onRetry: () => void
  onDismiss: () => void
}) {
  const accent =
    status.tone === "error"
      ? APP_ACCENT_COLORS.danger
      : APP_ACCENT_COLORS.caution
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[10000] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[10px] border px-3 py-2 shadow-xl backdrop-blur-md",
          online
            ? "text-foreground"
            : "border-border/50 bg-card/95 text-foreground"
        )}
        style={
          online
            ? {
                borderColor: tint(accent, 32),
                backgroundColor: `color-mix(in srgb, ${accent} 15%, var(--background))`,
              }
            : undefined
        }
      >
        <div className="flex h-11 w-8 shrink-0 items-center justify-center">
          {status.tone === "error" ? (
            <Warning size={15} weight="bold" />
          ) : online ? (
            <CloudArrowUp size={15} weight="bold" />
          ) : (
            <WifiSlash size={15} weight="bold" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-tight font-semibold">
            {status.title}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {status.body}
          </p>
        </div>
        {status.canRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={syncing}
            aria-busy={syncing}
            aria-label={
              status.tone === "error"
                ? "Try saving your changes again"
                : "Save your changes now"
            }
            className="min-h-11 rounded-[8px] bg-foreground px-3 text-[13px] font-semibold text-background"
          >
            <span className="inline-flex items-center gap-1">
              {syncing && (
                <ArrowsClockwise size={11} className="animate-spin" />
              )}
              {syncing
                ? "Saving"
                : status.tone === "error"
                  ? "Try again"
                  : "Save now"}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          disabled={syncing}
          aria-label="Dismiss the unsaved changes message"
          className="flex h-11 w-11 items-center justify-center rounded-[8px] text-muted-foreground transition-colors active:bg-muted disabled:opacity-40"
        >
          <X size={12} weight="bold" />
        </button>
      </div>
    </div>
  )
}
