/**
 * The health sync card: state now, and the one next action.
 *
 * It answers the question the block previously split across five places —
 * a section label, a floating progress bar, an always-present repair card, a
 * raw error paragraph and a journal — with the state in a word, a line about
 * what last happened, and a single button that is the useful move for that
 * state. Everything else the page used to shout belongs behind it.
 *
 * The rule itself lives in `lib/health-sync-presentation.ts` as a pure
 * function, so what each state says can be tested without rendering a page.
 */

import { Message, tr } from "@repo/ui/i18n"
import { Warning } from "@phosphor-icons/react"
import { PrimaryButton, SummaryBlock, SettingsStatusPill } from "@repo/ui"
import {
  healthSyncPresentation,
  type HealthSyncAction,
} from "@/lib/health-sync-presentation"
import type { HealthSyncStatus } from "@/lib/health-sync-status"

export function HealthSyncSummary({
  providerLabel,
  providerAvailable,
  consentMissing,
  enabled,
  lastSyncedAt,
  status,
  needsPermission,
  error,
  onAction,
}: {
  providerLabel: string
  providerAvailable: boolean
  /** Wearable consent is off, so there is nothing to read even if sync is on. */
  consentMissing: boolean
  enabled: boolean
  lastSyncedAt?: number | null
  status: HealthSyncStatus
  /** Access was refused: the fix is a grant, not a retry. */
  needsPermission?: boolean
  /** A failure worth acting on, already phrased for a person. */
  error?: string | null
  onAction: (action: HealthSyncAction) => void
}) {
  const running = status.running
  const presentation = healthSyncPresentation({
    providerLabel,
    providerAvailable,
    consentMissing,
    enabled,
    running,
    phase: status.phase,
    needsPermission,
    lastSyncedAt,
    error: error ?? status.lastError,
    lastActivity: status.recent[0] ?? null,
  })

  const busy = running || presentation.state === "running"

  return (
    <div className="px-[var(--app-page-x)] pt-4">
      <SummaryBlock
        title={tr("{{value0}} sync", { value0: providerLabel })}
        value={
          <SettingsStatusPill
            label={presentation.label}
            strong={
              presentation.state === "connected" ||
              presentation.state === "running"
            }
          />
        }
        detail={presentation.detail}
        action={
          presentation.action ? (
            <PrimaryButton
              className="min-h-10 px-4 text-[13px]"
              disabled={busy}
              aria-busy={busy}
              onClick={() => onAction(presentation.action as HealthSyncAction)}
            >
              {presentation.actionLabel}
            </PrimaryButton>
          ) : undefined
        }
      >
        {/* Progress and failure both live inside the card, where the state they
            belong to is. */}
        {running && (
          <>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-3/5 animate-pulse rounded-full bg-foreground" />
            </div>
            <p className="native-row-detail mt-2">
              {status.phase ?? tr("Syncing…")}
            </p>
          </>
        )}
        {!running && error && (
          <p className="native-row-detail mt-3 flex items-start gap-2 text-destructive">
            <Warning
              size={16}
              weight="bold"
              aria-hidden
              className="mt-0.5 shrink-0"
            />
            <Message text={"{{value0}}"} values={{ value0: error }} />
          </p>
        )}
      </SummaryBlock>
    </div>
  )
}
