import { MetricAbout } from "./shared"
import { CustomDialScreen } from "./custom-dial"

/**
 * Cycle tracking, off by default in the dial catalogue.
 *
 * A cycle ring on the home screen of a phone someone else might glance at is a
 * disclosure the app made on the user's behalf. Turning it on is a choice made
 * once, in the dials sheet, and nothing here nags for it.
 */
export default function HealthReproductive() {
  return (
    <CustomDialScreen
      dial="reproductive"
      title="Cycle"
      subtitle="In your own hand"
      tab="body"
      create="Recorded in your words, shown only on this dial."
      empty="Nothing filed here yet. Make a metric for the part of your cycle you want recorded, or bind one to what your phone already tracks."
      about={
        <MetricAbout
          items={[
            {
              term: "Nothing here is predicted",
              detail:
                "OneRep records what you log and draws it back. It does not estimate a fertile window, does not forecast a next date, and does not adjust your training on either — three claims that need clinical grounding this app does not have.",
            },
            {
              term: "Who else sees it",
              detail:
                "The dial is off until you switch it on, and this data is never included in what Coach is given. It stays on the same server as the rest of your log and goes nowhere else.",
            },
          ]}
        />
      }
    />
  )
}
