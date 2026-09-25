import { Message, tr, translateError } from "@repo/ui/i18n"
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
        ? tr("Track {{value0}} in {{value1}}", {
            value0: healthBinding.label.toLowerCase(),
            value1: healthBinding.unit,
          })
        : "")
    if (described.length < 3 || generating) {
      setError(translateError(tr("Describe what you want to track.")))
      return
    }
    setGenerating(true)
    setError(translateError(""))
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
      toast.success(tr("{{value0}} added", { value0: generated.title }))
      setRequest("")
      setHealthBinding(null)
      onClose()
    } catch (caught) {
      setError(
        translateError(
          caught instanceof Error
            ? caught.message
            : tr("Coach could not create that metric.")
        )
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
              <Message
                text={"Track something new in {{value0}}"}
                values={{ value0: tab }}
              />
            </h2>
            <button
              type="button"
              disabled={generating}
              onClick={onClose}
              aria-label={tr("Close metric builder")}
              className="native-toolbar-button -mt-1 -mr-2 px-0"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            {tr(
              "Coach will choose the controls, unit, target, and visualization. Try caffeine, stretching, sleep, steps, or a training habit."
            )}
          </p>
          <label className="mt-5 block">
            <span className="sr-only">
              {tr("Describe a custom progress metric")}
            </span>
            <textarea
              autoFocus
              rows={4}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder={tr(
                "For example: Track caffeine in 50 mg increments with a 400 mg daily limit"
              )}
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-[14px] leading-5 outline-none focus:border-foreground/35"
            />
          </label>
          {isHealthSyncSupportedPlatform() && (
            <div className="mt-4">
              <GroupedList label={tr("Where the numbers come from")}>
                <DisclosureRow
                  title={
                    healthBinding
                      ? healthBinding.label
                      : tr("Fill from {{value0}}", {
                          value0: healthProviderLabel(),
                        })
                  }
                  detail={
                    healthBinding
                      ? tr(
                          "Read each day in {{value0}}. Type a value and that day stays yours.",
                          { value0: healthBinding.unit }
                        )
                      : tr("Optional. Otherwise you type it in yourself.")
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
            {generating ? tr("Coach is designing it…") : tr("Generate metric")}
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
