import { tr } from "@repo/ui/i18n"

export type RestartReason = "energy" | "starting" | "schedule" | "unsure"
export type RestartAction = "walk" | "gym" | "home" | "rest"
export type RestartChoices = {
  reason: RestartReason
  action: RestartAction
  anchor: string
}
export type RestartPlan = Partial<RestartChoices> & {
  status: "active" | "completed" | "paused" | "dismissed"
  stage: number
  lastActionOn?: string
}
export const reasons = () => [
  {
    id: "energy" as const,
    title: tr("My energy is low"),
    detail: tr("Make room for a gentler day."),
  },
  {
    id: "starting" as const,
    title: tr("Getting started feels hard"),
    detail: tr("Make the first step smaller."),
  },
  {
    id: "schedule" as const,
    title: tr("My routine has changed"),
    detail: tr("Find a place for it in your day."),
  },
  {
    id: "unsure" as const,
    title: tr("I'm not sure"),
    detail: tr("You don't have to explain it."),
  },
]
export const actions = () => [
  {
    id: "walk" as const,
    title: tr("Step outside"),
    detail: tr("A few easy minutes, at your pace."),
    prep: tr("Put your shoes by the door"),
    task: tr("Take a short walk"),
    instruction: tr(
      "Step outside and walk for a few comfortable minutes. You decide when to head back.",
    ),
  },
  {
    id: "gym" as const,
    title: tr("Return to the gym"),
    detail: tr("One familiar exercise is enough."),
    prep: tr("Put your gym clothes out"),
    task: tr("Do one familiar exercise"),
    instruction: tr(
      "Start with an easy warm-up. Choose one familiar exercise at a comfortable effort. Stopping there counts.",
    ),
  },
  {
    id: "home" as const,
    title: tr("Move a little at home"),
    detail: tr("No equipment or travel needed."),
    prep: tr("Make a little space to move"),
    task: tr("Move gently for a few minutes"),
    instruction: tr(
      "Choose a familiar movement that feels comfortable. Keep it easy and stop whenever you need to.",
    ),
  },
  {
    id: "rest" as const,
    title: tr("Make time to rest"),
    detail: tr("A deliberate pause can be your start."),
    prep: tr("Choose a comfortable place to rest"),
    task: tr("Take a little time for yourself"),
    instruction: tr(
      "Settle somewhere comfortable. Put your phone aside if you like. Let this be time with nothing to complete.",
    ),
  },
]
export const anchors = () => [
  tr("After school"),
  tr("After work"),
  tr("After breakfast"),
  tr("When I get home"),
]
