import { MetricAbout } from "./shared"
import { CustomDialScreen } from "./custom-dial"

/**
 * What you ate, in the terms you chose to count it in.
 *
 * Deliberately not a second copy of the Nutrition tab. Calories and macros are
 * already scored there against a target the app set; this screen is for the
 * things nobody else counts — caffeine, sodium, fibre, water with electrolytes
 * in it — which people invent metrics for precisely because no app ships them.
 */
export default function HealthNutrition() {
  return (
    <CustomDialScreen
      dial="nutrition"
      title="Nutrition"
      subtitle="The intake you asked to count"
      tab="nutrition"
      create="Caffeine, sodium, fibre — anything the food log does not total."
      empty="Nothing filed here yet. Create a metric for something you want to count — caffeine, sodium, fibre — and it will show up on this dial."
      about={
        <MetricAbout
          items={[
            {
              term: "Where these come from",
              detail:
                "Metrics you made, either typed in by hand or filled from Apple Health or Health Connect if you bound one to a reading. A figure you typed always beats a synced one for the same day.",
            },
            {
              term: "Why calories are not here",
              detail:
                "They have their own tab, their own target and their own maths. Repeating them behind this dial would give you two numbers for the same day that could disagree by a late-logged meal.",
            },
            {
              term: "The ring",
              detail:
                "Only metrics you gave a target to are graded. Something you are merely watching sits in the list without moving the ring, because there is no honest way to mark a number nobody set a goal for.",
            },
          ]}
        />
      }
    />
  )
}
