import { useState } from "react"
import { CaretRight } from "@phosphor-icons/react"
import { hapticSelection } from "@/lib/haptics"
import {
  CustomMetricBuilderSheet,
  type CustomMetricTab,
} from "@/components/custom-metric-builder-sheet"
import { cn } from "@/lib/utils"

/**
 * The way in to making a metric of your own.
 *
 * A labelled row rather than a fourth icon in the Health header. Creating a
 * metric is something most people do a handful of times ever, and the three
 * circles up there — correct a reading, log a value, choose dials — are all
 * things you do weekly. A rare, consequential action hidden behind an unlabelled
 * glyph next to three frequent ones is how you end up with people who never
 * find it and people who tap it by accident.
 *
 * `tab` is the `customProgressMetrics` axis, not a dial. It only decides where
 * an *unbound* metric files: anything bound to a catalogue reading is sorted by
 * that binding, so a glucose metric made from the Body screen still lands on
 * Vitals. Each dial screen passes the closest tab it has; the Health page
 * passes "body", which is where a metric with no reading behind it belongs
 * until the user says otherwise.
 */
export function TrackSomethingNew({
  tab,
  detail,
  className,
}: {
  tab: CustomMetricTab
  detail: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          hapticSelection()
          setOpen(true)
        }}
        className={cn(
          "flex min-h-14 w-full items-center justify-between gap-3 border-y border-border px-1 py-3.5 text-left transition-colors active:bg-muted/45",
          className
        )}
      >
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">Track something new</p>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
        <CaretRight
          size={14}
          weight="bold"
          className="shrink-0 text-muted-foreground"
        />
      </button>

      {open && (
        <CustomMetricBuilderSheet tab={tab} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
