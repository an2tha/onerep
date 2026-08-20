import { Capacitor } from "@capacitor/core"
import { Check, X } from "@phosphor-icons/react"
import {
  bindableMetrics,
  platformMetricGroups,
  metricsForPlatform,
  type PlatformMetric,
} from "../../../../convex/lib/platformHealthMetrics"
import { GroupedList, ListRow } from "@repo/ui"
import { MobileSheet } from "@/components/mobile-sheet"
import { healthProviderLabel } from "@/lib/health-provider"
import { hapticSelection } from "@/lib/haptics"

/**
 * Metrics this phone's store can hand over, in the order the catalogue groups
 * them, with the rest still listed. Hiding a metric the other platform has
 * produces the worst bug report there is — "your app does not do blood
 * pressure" from someone who simply cannot see why — so the ones this phone
 * cannot deliver stay on screen, unpickable, wearing the reason.
 */
function pickableHere(): {
  metrics: PlatformMetric[]
  supported: Set<string>
} {
  const bindable = bindableMetrics()
  const platform = Capacitor.getPlatform()
  if (platform !== "ios" && platform !== "android") {
    return { metrics: bindable, supported: new Set() }
  }
  const supported = new Set(
    metricsForPlatform(platform).map((metric) => metric.key)
  )
  return { metrics: bindable, supported }
}

export function HealthMetricPicker({
  selectedKey,
  onSelect,
  onClose,
}: {
  selectedKey: string | null
  onSelect: (metric: PlatformMetric | null) => void
  onClose: () => void
}) {
  const { metrics, supported } = pickableHere()
  const groups = platformMetricGroups(metrics)
  const storeName = healthProviderLabel()

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/45"
      panelClassName="sheet-panel mx-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border-t border-border bg-card"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 className="text-[20px] font-bold">Fill from {storeName}</h2>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Each day is read from {storeName}. Type a figure yourself and that
            day keeps yours.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close health metric picker"
          className="native-toolbar-button -mt-1 -mr-2 px-0"
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <GroupedList label="Entry method">
          <ListRow
            title="Type it myself"
            detail="No reading is pulled in"
            onClick={() => {
              hapticSelection()
              onSelect(null)
            }}
            trailing={
              selectedKey === null ? (
                <Check size={16} weight="bold" aria-label="Selected" />
              ) : undefined
            }
          />
        </GroupedList>

        {groups.map((group) => (
          <div key={group.group} className="mt-4">
            <p className="native-section-title mb-2">{group.label}</p>
            <GroupedList label={group.label}>
              {group.metrics.map((metric) => {
                const available = supported.has(metric.key)
                return (
                  <ListRow
                    key={metric.key}
                    title={metric.label}
                    detail={
                      available
                        ? metric.detail
                        : (metric.gap ??
                          `${storeName} does not record this one.`)
                    }
                    value={available ? metric.unit : undefined}
                    className={available ? undefined : "opacity-55"}
                    onClick={
                      available
                        ? () => {
                            hapticSelection()
                            onSelect(metric)
                          }
                        : undefined
                    }
                    trailing={
                      selectedKey === metric.key ? (
                        <Check size={16} weight="bold" aria-label="Selected" />
                      ) : undefined
                    }
                  />
                )
              })}
            </GroupedList>
          </div>
        ))}
      </div>
    </MobileSheet>
  )
}
