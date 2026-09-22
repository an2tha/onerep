import { defineCatalog, type Spec } from "@json-render/core"
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react"
import { schema } from "@json-render/react/schema"
import { z } from "zod"
import type { CoachPreparation } from "../../../../packages/models/src/coachPreparation"

const catalog = defineCatalog(schema, {
  components: {
    Preparation: {
      props: z.object({ title: z.string() }),
      slots: ["default"],
      description: "Existing information relevant to the coach request",
    },
    Fact: {
      props: z.object({ label: z.string(), value: z.string() }),
      description: "A labeled fact from the user's saved data",
    },
  },
  actions: {},
})

const { registry } = defineRegistry(catalog, {
  components: {
    Preparation: ({ props, children }) => (
      <section
        aria-label={props.title}
        className="space-y-3 rounded-xl border border-border p-4"
      >
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{props.title}</h3>
          <p className="text-xs text-muted-foreground">
            From your saved data. Coach is preparing your answer.
          </p>
        </div>
        <dl className="space-y-2">{children}</dl>
      </section>
    ),
    Fact: ({ props }) => (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <dt className="min-w-0 break-words">{props.label}</dt>
        <dd className="font-medium tabular-nums">{props.value}</dd>
      </div>
    ),
  },
})

/** Jev chooses the candidate; trusted code assembles its fixed JSON composition. */
export function coachPreparationSpec(preparation: CoachPreparation): Spec {
  const children = preparation.rows.map((_, index) => `fact-${index}`)
  return {
    root: "preparation",
    elements: {
      preparation: {
        type: "Preparation",
        props: { title: preparation.title },
        children,
      },
      ...Object.fromEntries(
        preparation.rows.map((row, index) => [
          children[index],
          { type: "Fact", props: row },
        ])
      ),
    },
  }
}

export default function CoachPreparationPreview({
  preparation,
}: {
  preparation: CoachPreparation
}) {
  return (
    <JSONUIProvider registry={registry}>
      <Renderer spec={coachPreparationSpec(preparation)} registry={registry} />
    </JSONUIProvider>
  )
}
