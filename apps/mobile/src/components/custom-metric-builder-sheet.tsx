import { useState } from "react"
import { Sparkle, X } from "@phosphor-icons/react"
import { useAction, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { DisclosureRow, GroupedList, toast } from "@repo/ui"
import { MobileSheet } from "@/components/mobile-sheet"
import { HealthMetricPicker } from "@/components/health-metric-picker"
import {
  healthProviderLabel,
  isHealthSyncSupportedPlatform,
} from "@/lib/health-provider"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import type { PlatformMetric } from "../../../../convex/lib/platformHealthMetrics"

/** The tabs a generated metric can belong to. The library has nothing to chart. */
export type CustomMetricTab = "body" | "nutrition" | "training"

/**
 * Lifted out of Progress when custom metrics moved to Health, so the two pages
 * cannot drift into two subtly different builders.
 */
export function CustomMetricBuilderSheet({
  tab,
  onClose,
}: {
  tab: CustomMetricTab
  onClose: () => void
}) {
  const [request, setRequest] = useState("")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")
  /**
   * The catalogue metric this new one reads from, or null for the typed-by-hand
   * default. Binding is a second tap on purpose: most metrics people invent
   * ("stretched today") have no reading behind them anywhere.
   */
  const [healthBinding, setHealthBinding] = useState<PlatformMetric | null>(
    null
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const generateCustomMetric = useAction(
    api.ai.metricGeneration.generateCustomProgressMetric
  )
  const saveCustomMetric = useMutation(api.customProgressMetrics.saveDefinition)

  async function createCustomMetric() {
    // A bound metric already says what it is, so the description is optional
    // there — asking someone to write a sentence about blood glucose after
    // they picked "Blood glucose" from a list is busywork.
    const described =
      request.trim() ||
      (healthBinding
        ? `Track ${healthBinding.label.toLowerCase()} in ${healthBinding.unit}`
        : "")
    if (described.length < 3 || generating) {
      setError("Describe what you want to track.")
      return
    }
    setGenerating(true)
    setError("")
    try {
      const generated = await generateCustomMetric({ tab, request: described })
      await saveCustomMetric({
        title: generated.title,
        description: generated.description,
        tab: generated.tab,
        kind: generated.kind,
        // The catalogue's unit wins over the model's guess: the sync writes
        // mmol/L whatever the card claims to be showing, and a card labelled
        // mg/dL over an mmol/L number is worse than no card.
        unit: healthBinding ? healthBinding.unit : generated.unit,
        step: generated.step,
        ...(generated.target == null ? {} : { target: generated.target }),
        accent: generated.accent,
        ...(healthBinding ? { healthMetricKey: healthBinding.key } : {}),
      })
      hapticMedium()
      toast.success(`${generated.title} added`)
      setRequest("")
      setHealthBinding(null)
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Coach could not create that metric."
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      <MobileSheet
        onClose={() => {
          if (generating) return
          onClose()
        }}
        overlayClassName="bg-black/45"
        panelClassName="sheet-panel mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-card"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void createCustomMetric()
          }}
          className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-[20px] font-bold">
              Track something new in {tab}
            </h2>
            <button
              type="button"
              disabled={generating}
              onClick={onClose}
              aria-label="Close metric builder"
              className="native-toolbar-button -mt-1 -mr-2 px-0"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            Coach will choose the controls, unit, target, and visualization. Try
            caffeine, stretching, sleep, steps, or a training habit.
          </p>
          <label className="mt-5 block">
            <span className="sr-only">Describe a custom progress metric</span>
            <textarea
              autoFocus
              rows={4}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="For example: Track caffeine in 50 mg increments with a 400 mg daily limit"
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-[14px] leading-5 outline-none focus:border-foreground/35"
            />
          </label>
          {isHealthSyncSupportedPlatform() && (
            <div className="mt-4">
              <GroupedList label="Where the numbers come from">
                <DisclosureRow
                  title={
                    healthBinding
                      ? healthBinding.label
                      : `Fill from ${healthProviderLabel()}`
                  }
                  detail={
                    healthBinding
                      ? `Read each day in ${healthBinding.unit}. Type a value and that day stays yours.`
                      : "Optional. Otherwise you type it in yourself."
                  }
                  onClick={() => {
                    hapticSelection()
                    setPickerOpen(true)
                  }}
                />
              </GroupedList>
            </div>
          )}
          {error && (
            <p className="mt-2 text-[11px] text-destructive" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={
              generating || (request.trim().length < 3 && !healthBinding)
            }
            className="motion-tactile mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-[13px] font-bold text-background disabled:opacity-35"
          >
            <Sparkle
              size={16}
              weight="fill"
              className={generating ? "animate-pulse" : undefined}
            />
            {generating ? "Coach is designing it…" : "Generate metric"}
          </button>
        </form>
      </MobileSheet>

      {pickerOpen && (
        <HealthMetricPicker
          selectedKey={healthBinding?.key ?? null}
          onSelect={(metric) => {
            setHealthBinding(metric)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
