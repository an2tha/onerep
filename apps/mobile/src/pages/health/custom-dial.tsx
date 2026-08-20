import type { ReactNode } from "react"
import {
  DialCustomMetrics,
  useCustomMetricsByDial,
} from "@/components/dial-custom-metrics"
import { TrackSomethingNew } from "@/components/track-something-new"
import type { CustomMetricTab } from "@/components/custom-metric-builder-sheet"
import { AREA_TONES, DialHero, HealthDetailShell, NoReadings } from "./shared"

/**
 * The shell the four newer dials share.
 *
 * Recovery, Sleep, Activity, Heart and Body each grade a signal the app scores
 * itself, so each of those screens is written by hand around its own maths.
 * Nutrition, Vitals, Mindfulness and Cycle have no such maths — everything on
 * them is a metric the user defined — so writing four near-identical files
 * would have been four places to fix the same layout bug.
 */
export function CustomDialScreen({
  dial,
  title,
  subtitle,
  empty,
  create,
  tab = "body",
  about,
}: {
  dial: string
  title: string
  subtitle: string
  /** What to say when nothing under this dial has been logged. */
  empty: string
  /** The line under "Track something new", in this dial's own terms. */
  create: string
  /**
   * Where an unbound metric made from this screen files. Bound ones ignore it
   * and sort by their catalogue reading, which is why every screen here can
   * safely default to the same tab.
   */
  tab?: CustomMetricTab
  about?: ReactNode
}) {
  const { loading, byDial, scores } = useCustomMetricsByDial()
  const rows = byDial[dial] ?? []
  const score = scores[dial] ?? null
  const tone = AREA_TONES[dial] ?? AREA_TONES.recovery

  return (
    <HealthDetailShell
      title={title}
      subtitle={subtitle}
      heroFill={score}
      about={rows.length > 0 ? about : undefined}
    >
      {loading ? (
        <div
          className="mx-auto size-44 animate-pulse rounded-full bg-muted"
          data-route-loading="true"
        />
      ) : rows.length === 0 ? (
        <NoReadings detail={empty} />
      ) : (
        <>
          {/*
            No ring unless something here carries a target. A dial drawn at
            zero because nobody set one is a failing grade the user never
            agreed to be marked against.
          */}
          {score !== null && (
            <DialHero
              tone={tone}
              score={score}
              caption={`${rows.length} metric${rows.length === 1 ? "" : "s"}`}
            />
          )}
          <DialCustomMetrics dial={dial} tone={tone} />
        </>
      )}

      {/*
        Outside the empty branch as well as the full one. Somebody looking at
        "nothing filed here yet" is the single most likely person in the app to
        want to make a metric, and telling them to go back and find the row on
        the previous screen is a joke at their expense.
      */}
      <TrackSomethingNew tab={tab} detail={create} />
    </HealthDetailShell>
  )
}
