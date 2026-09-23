import type { Icon } from "@phosphor-icons/react"
import {
  BatteryHigh,
  Barbell,
  Bed,
  Brain,
  Coffee,
  Fire,
  Footprints,
  Heartbeat,
  Leaf,
  Lightning,
  Moon,
  Mountains,
  PersonSimpleWalk,
  Pill,
  Plant,
  Snowflake,
  Sun,
  Target,
  Timer,
  Waves,
  Wine,
  Wind,
} from "@phosphor-icons/react"

export type TrackerDefinition = {
  title: string
  description: string
  tab: "body" | "nutrition" | "training"
  kind: "number" | "counter" | "toggle"
  unit: string
  step: number
  target?: number
  accent: "food" | "water" | "workout" | "progress"
}
export type TrackerTemplate = TrackerDefinition & { icon: Icon }
const template = (
  title: string,
  icon: Icon,
  tab: TrackerDefinition["tab"],
  kind: TrackerDefinition["kind"],
  unit: string,
  step: number,
  description: string
): TrackerTemplate => ({
  title,
  icon,
  tab,
  kind,
  unit,
  step,
  description,
  accent:
    tab === "training" ? "workout" : tab === "nutrition" ? "food" : "progress",
})
export const TRACKER_TEMPLATES: TrackerTemplate[] = [
  template(
    "Energy",
    BatteryHigh,
    "body",
    "number",
    "/ 10",
    1,
    "How much energy you had today, from 0 to 10."
  ),
  template(
    "Muscle soreness",
    Barbell,
    "training",
    "number",
    "/ 10",
    1,
    "How sore your muscles feel, from 0 to 10."
  ),
  template(
    "Sleep duration",
    Moon,
    "body",
    "number",
    "hours",
    0.25,
    "Hours asleep, including naps if you want to track total rest."
  ),
  template(
    "Sleep quality",
    Bed,
    "body",
    "number",
    "/ 10",
    1,
    "How restorative last night's sleep felt."
  ),
  template(
    "Stress",
    Brain,
    "body",
    "number",
    "/ 10",
    1,
    "Your perceived stress, from 0 to 10."
  ),
  template(
    "Focus",
    Target,
    "body",
    "number",
    "/ 10",
    1,
    "How focused you felt throughout the day."
  ),
  template(
    "Walking",
    PersonSimpleWalk,
    "training",
    "counter",
    "min",
    10,
    "Time spent walking outside workouts."
  ),
  template(
    "Steps",
    Footprints,
    "training",
    "counter",
    "steps",
    1000,
    "Your total daily step count."
  ),
  template(
    "Mobility",
    Waves,
    "training",
    "counter",
    "min",
    5,
    "Stretching, mobility drills and movement breaks."
  ),
  template(
    "Session effort",
    Fire,
    "training",
    "number",
    "/ 10",
    1,
    "How hard your session felt overall."
  ),
  template(
    "Zone 2 cardio",
    Heartbeat,
    "training",
    "counter",
    "min",
    10,
    "Time spent at your chosen easy aerobic intensity."
  ),
  template(
    "Rest day",
    Bed,
    "training",
    "toggle",
    "",
    1,
    "Record an intentional day off training."
  ),
  template(
    "Outdoor time",
    Sun,
    "body",
    "counter",
    "min",
    15,
    "Time you spent outdoors."
  ),
  template(
    "Meditation",
    Wind,
    "body",
    "counter",
    "min",
    5,
    "Time set aside for meditation or breathwork."
  ),
  template(
    "Reading",
    Brain,
    "body",
    "counter",
    "min",
    15,
    "A little time away from the feed."
  ),
  template(
    "Screen time",
    Lightning,
    "body",
    "number",
    "hours",
    0.25,
    "Time spent on screens today."
  ),
  template("Sauna", Fire, "body", "counter", "min", 10, "Time in the sauna."),
  template(
    "Cold exposure",
    Snowflake,
    "body",
    "counter",
    "min",
    1,
    "Time spent in a cold shower or plunge."
  ),
  template(
    "Hiking",
    Mountains,
    "training",
    "counter",
    "min",
    15,
    "Time on the trail."
  ),
  template(
    "Fibre",
    Plant,
    "nutrition",
    "number",
    "g",
    1,
    "Dietary fibre for the day."
  ),
  template(
    "Fruit and veg",
    Leaf,
    "nutrition",
    "counter",
    "servings",
    1,
    "Servings of fruit and vegetables."
  ),
  template(
    "Creatine",
    Pill,
    "nutrition",
    "number",
    "g",
    1,
    "Your creatine intake."
  ),
  template(
    "Caffeine",
    Coffee,
    "nutrition",
    "counter",
    "mg",
    50,
    "Total caffeine intake."
  ),
  template(
    "Alcohol",
    Wine,
    "nutrition",
    "counter",
    "drinks",
    1,
    "Number of alcoholic drinks."
  ),
  template(
    "Eating window",
    Timer,
    "nutrition",
    "number",
    "hours",
    0.5,
    "Time between your first and last meal."
  ),
]
export function trackerIcon(title: string) {
  return (
    TRACKER_TEMPLATES.find(
      (item) => item.title.toLowerCase() === title.toLowerCase()
    )?.icon ?? Target
  )
}
export function metricValue(
  value: number | undefined,
  kind: string,
  unit: string
) {
  if (value === undefined) return "Not logged"
  if (kind === "toggle") return value > 0 ? "Yes" : "No"
  return `${Number(value.toFixed(2)).toLocaleString()}${unit ? ` ${unit}` : ""}`
}
export function shiftDay(key: string, offset: number) {
  const date = new Date(`${key}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
