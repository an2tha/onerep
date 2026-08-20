import { MetricAbout } from "./shared"
import { CustomDialScreen } from "./custom-dial"

/** Time spent deliberately doing nothing, and whatever else you count as rest. */
export default function HealthMindfulness() {
  return (
    <CustomDialScreen
      dial="mindfulness"
      title="Mindfulness"
      subtitle="Rest you chose rather than rest you needed"
      tab="body"
      create="Breathwork, journalling, or whatever rest looks like for you."
      empty="Nothing filed here yet. Bind a metric to mindful minutes, or make one for breathwork, journalling or whatever you actually do."
      about={
        <MetricAbout
          items={[
            {
              term: "Mindful minutes",
              detail:
                "Written by whatever app you meditate with, if it talks to Apple Health or Health Connect. OneRep only reads the total; it has no idea what you were doing and does not pretend to.",
            },
            {
              term: "This is not recovery",
              detail:
                "The recovery dial is built from sleep, resting rate and variability — things measured off your body. This one counts a decision you made. They are related and they are not the same number.",
            },
          ]}
        />
      }
    />
  )
}
