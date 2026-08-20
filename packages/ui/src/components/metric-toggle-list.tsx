import type { ReactNode } from "react"
import { GroupedList } from "./mobile-ui"
import { CompactSwitch, SettingsRow } from "./settings-controls"
import { SettingsSectionLabel } from "./settings-display"

export type MetricToggleItem = {
  key: string
  label: string
  detail?: string
  enabled: boolean
  /** Greyed and unresponsive, with `disabledReason` shown in place of detail. */
  disabled?: boolean
  disabledReason?: string
}

export type MetricToggleGroup = {
  key: string
  label: string
  detail?: string
  items: MetricToggleItem[]
}

/**
 * A long opt-in list, grouped, one switch per row.
 *
 * Built for the health-sync screen but deliberately knows nothing about health:
 * it takes groups of labelled switches and reports which one moved. The screen
 * above it owns the catalogue, the persistence, and what a toggle means, so a
 * second list of this shape — notifications, coach permissions — does not have
 * to reinvent the row.
 *
 * Sends one key per change rather than the whole map. A screen that echoed the
 * full selection back would silently switch off anything it had not heard of,
 * which is how a client built against an older list quietly narrows a newer
 * one.
 */
export function MetricToggleList({
  groups,
  onToggle,
  onInteract,
  busy = false,
  footer,
}: {
  groups: MetricToggleGroup[]
  onToggle: (key: string, enabled: boolean) => void
  /** Fired before the change lands — hook a haptic here. */
  onInteract?: () => void
  busy?: boolean
  footer?: ReactNode
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.key}>
          <SettingsSectionLabel title={group.label} detail={group.detail} />
          <GroupedList label={group.label}>
            {group.items.map((item) => (
              <SettingsRow
                key={item.key}
                label={item.label}
                detail={
                  item.disabled && item.disabledReason
                    ? item.disabledReason
                    : item.detail
                }
              >
                <CompactSwitch
                  checked={item.enabled}
                  disabled={busy || item.disabled}
                  onInteract={onInteract}
                  onChange={(next: boolean) => onToggle(item.key, next)}
                  label={item.label}
                />
              </SettingsRow>
            ))}
          </GroupedList>
        </div>
      ))}
      {footer}
    </>
  )
}
