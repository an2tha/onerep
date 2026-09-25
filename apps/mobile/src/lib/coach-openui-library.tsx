import { Message, tr } from "@repo/ui/i18n"
import { createContext, useContext, useState } from "react"
import { createLibrary, defineComponent } from "@openuidev/react-lang"
import { openuiLibrary } from "@openuidev/react-ui"
import { z } from "zod/v4"
import type {
  CoachOperation,
  CoachGoalTaskDraft,
  CoachUiAction,
} from "./coach-chat"

export type CoachOpenUIActions = {
  onAction: (action: CoachUiAction) => void
  onContinue: (message: string) => void
  onSubmitInteractive: (
    operation: Extract<CoachOperation, { type: "log_nutrition" }>
  ) => Promise<void>
  onPinGoal: (goal: {
    title: string
    detail: string
    durationDays: number
    tasks: CoachGoalTaskDraft[]
  }) => Promise<void>
}
export const CoachOpenUIContext = createContext<CoachOpenUIActions | null>(null)

const Goal = defineComponent({
  name: "CoachGoal",
  description: tr(
    "A proposed goal with measurable tasks. The user can explicitly pin it; rendering never saves it."
  ),
  props: z.object({
    title: z.string(),
    detail: z.string(),
    durationDays: z.number().int().min(1).max(365),
    tasks: z
      .array(z.object({ title: z.string(), detail: z.string() }))
      .min(1)
      .max(6),
  }),
  component: ({ props }) => {
    const actions = useContext(CoachOpenUIContext)
    const [status, setStatus] = useState("idle")
    return (
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="font-semibold">{props.title}</h3>
        <p>{props.detail}</p>
        <p className="text-sm text-muted-foreground">
          <Message
            text={"{{value0}} days"}
            values={{ value0: props.durationDays }}
          />
        </p>
        <ul className="space-y-2">
          {props.tasks.map((task, index) => (
            <li key={index}>
              <strong>{task.title}</strong>
              <p>{task.detail}</p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-foreground px-4 text-background disabled:opacity-50"
          disabled={!actions || status === "saving" || status === "saved"}
          onClick={async () => {
            if (!actions || status === "saving" || status === "saved") return
            setStatus("saving")
            try {
              await actions.onPinGoal({
                ...props,
                tasks: props.tasks.map((task) => ({
                  ...task,
                  completed: false,
                })),
              })
              setStatus("saved")
            } catch {
              setStatus("error")
            }
          }}
        >
          {status === "saved"
            ? tr("Pinned")
            : status === "saving"
              ? tr("Pinning…")
              : tr("Pin goal")}
        </button>
        {status === "error" && (
          <p role="alert">{tr("Couldn’t pin this goal. Try again.")}</p>
        )}
      </section>
    )
  },
})

const MealLog = defineComponent({
  name: "MealLog",
  description: tr(
    "Editable meal preview. Macros are per serving; quantity scales them. Saves only when the user taps Log meal. Do not also emit a log_nutrition operation for this meal."
  ),
  props: z.object({
    name: z.string(),
    meal: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
    calories: z.number().min(0).max(10000),
    protein: z.number().min(0).max(1000),
    carbs: z.number().min(0).max(1000),
    fat: z.number().min(0).max(1000),
    assumptions: z.array(z.string()).max(6),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  component: ({ props }) => {
    const actions = useContext(CoachOpenUIContext)
    const [quantity, setQuantity] = useState(1)
    const [meal, setMeal] = useState(props.meal)
    const [status, setStatus] = useState("idle")
    const locked = status === "saving" || status === "saved"
    return (
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="font-semibold">{props.name}</h3>
        <p>
          <Message
            text={
              "{{value0}} kcal · {{value1}} g protein · {{value2}} g carbs · {{value3}} g fat"
            }
            values={{
              value0: Math.round(props.calories * quantity),
              value1: Math.round(props.protein * quantity),
              value2: Math.round(props.carbs * quantity),
              value3: Math.round(props.fat * quantity),
            }}
          />
        </p>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <Message
            text={"Servings{{value0}}"}
            values={{
              value0: (
                <input
                  className="w-24 rounded-lg border border-border bg-background p-2"
                  type="number"
                  min={0.25}
                  max={20}
                  step={0.25}
                  value={quantity}
                  disabled={locked}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isFinite(value))
                      setQuantity(Math.min(20, Math.max(0.25, value)))
                  }}
                />
              ),
            }}
          />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <Message
            text={"Meal{{value0}}"}
            values={{
              value0: (
                <select
                  aria-label={tr("Meal")}
                  className="rounded-lg border border-border bg-background p-2"
                  value={meal}
                  disabled={locked}
                  onChange={(event) =>
                    setMeal(event.target.value as typeof meal)
                  }
                >
                  {["Breakfast", "Lunch", "Dinner", "Snack"].map((value) => (
                    <option key={value} value={value}>
                      {tr(value)}
                    </option>
                  ))}
                </select>
              ),
            }}
          />
        </label>
        {props.assumptions.map((assumption, index) => (
          <p className="text-sm text-muted-foreground" key={index}>
            {assumption}
          </p>
        ))}
        <button
          type="button"
          className="min-h-11 rounded-lg bg-foreground px-4 text-background disabled:opacity-50"
          disabled={!actions || locked}
          onClick={async () => {
            if (!actions || locked) return
            setStatus("saving")
            try {
              await actions.onSubmitInteractive({
                type: "log_nutrition",
                confirmation: "auto",
                summary: tr("Log {{value0}}", { value0: props.name }),
                assumptions: props.assumptions,
                warnings: [],
                name: props.name,
                meal,
                ...(props.date ? { date: props.date } : {}),
                calories: props.calories * quantity,
                protein: props.protein * quantity,
                carbs: props.carbs * quantity,
                fat: props.fat * quantity,
              })
              setStatus("saved")
            } catch {
              setStatus("error")
            }
          }}
        >
          {status === "saved"
            ? tr("Logged")
            : status === "saving"
              ? tr("Logging…")
              : tr("Log meal")}
        </button>
        {status === "error" && (
          <p role="alert">{tr("Couldn’t log this meal. Try again.")}</p>
        )}
      </section>
    )
  },
})

export const coachOpenUILibrary = createLibrary({
  root: "Stack",
  components: [...Object.values(openuiLibrary.components), Goal, MealLog],
})
