import { MetricAbout } from "./shared"
import { CustomDialScreen } from "./custom-dial"

/**
 * Glucose, pressure, oxygen, temperature.
 *
 * Separate from Heart on purpose. The heart dial is a screen about resting
 * rate and variability against your own baseline; a finger-prick glucose
 * reading behind a ring labelled "Heart" is a filing error the reader has to
 * undo every time they open it.
 */
export default function HealthVitals() {
  return (
    <CustomDialScreen
      dial="vitals"
      title="Vitals"
      subtitle="Readings you take, not totals you accumulate"
      tab="body"
      create="A reading you take rather than a total you accumulate."
      empty="Nothing filed here yet. Bind a metric to blood glucose, blood pressure, oxygen saturation or body temperature and it will land on this dial."
      about={
        <MetricAbout
          items={[
            {
              term: "OneRep does not interpret these",
              detail:
                "No thresholds, no colours, no warnings. Reference ranges for glucose and blood pressure depend on medication, time since eating and a diagnosis the app does not have, and an app that guesses at those is worse than one that stays quiet.",
            },
            {
              term: "Where these come from",
              detail:
                "A cuff, a monitor or a meter that writes to Apple Health or Health Connect, or your own hand. Type a figure and that day keeps yours — a reading you trust should beat one a device took while you were moving.",
            },
            {
              term: "One reading a day",
              detail:
                "Each metric holds one value per day. If your meter writes several, the chart shows the day rather than every prick, which is the resolution a trend can actually be read at.",
            },
          ]}
        />
      }
    />
  )
}
