import { Message, tr, translateError } from "@repo/ui/i18n"
import { useState } from "react"
import { useMutation } from "convex/react"
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { MobileSheet } from "@/components/mobile-sheet"
import {
  TRACKER_TEMPLATES,
  type TrackerDefinition,
  trackerIcon,
} from "./trackers"

export type JournalMetric = TrackerDefinition & {
  _id: Id<"customProgressMetrics">
  entries: { date: string; value: number }[]
}
export function TrackerStudio({
  metrics,
  onClose,
  onChoose,
  editing,
}: {
  metrics: JournalMetric[]
  onClose: () => void
  onChoose: (metric: JournalMetric) => void
  editing?: JournalMetric
}) {
  const [search, setSearch] = useState("")
  const [custom, setCustom] = useState(Boolean(editing))
  const [draft, setDraft] = useState<TrackerDefinition>(
    editing ?? {
      title: "",
      description: "",
      tab: "body",
      kind: "number",
      unit: "",
      step: 1,
      accent: "progress",
    }
  )
  const [goal, setGoal] = useState(editing?.target?.toString() ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [confirmRemove, setConfirmRemove] = useState(false)
  const create = useMutation(api.customProgressMetrics.saveDefinition)
  const update = useMutation(api.customProgressMetrics.updateDefinition)
  const remove = useMutation(api.customProgressMetrics.remove)
  async function save(definition: TrackerDefinition) {
    if (pending) return
    setPending(true)
    setError(translateError(""))
    try {
      const { title, description, tab, kind, unit, step, accent } = definition
      const values = {
        title: title.trim(),
        description,
        tab,
        kind,
        unit,
        step,
        accent,
      }
      if (!values.title) throw new Error("Give your tracker a name.")
      const target = custom
        ? goal === ""
          ? undefined
          : Number(goal)
        : definition.target
      const id = editing
        ? await update({
            metricId: editing._id,
            ...values,
            target: target ?? null,
          })
        : await create({
            ...values,
            ...(target === undefined ? {} : { target }),
          })
      onChoose({ ...values, target, _id: id, entries: editing?.entries ?? [] })
    } catch (caught) {
      setError(
        translateError(
          caught instanceof Error
            ? caught.message
            : tr("Could not save your tracker. Please try again.")
        )
      )
    } finally {
      setPending(false)
    }
  }
  const matching = TRACKER_TEMPLATES.filter((item) =>
    `${item.title} ${item.description} ${item.tab}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  const existing = metrics.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <MobileSheet
      ariaLabel={editing ? "Edit tracker" : "Track anything"}
      onClose={onClose}
    >
      <div className="journal-studio">
        <div className="journal-section-heading">
          <div>
            <p className="journal-kicker">{tr("YOUR JOURNAL, YOUR RULES")}</p>
            <h2>
              {editing
                ? tr("Edit tracker")
                : custom
                  ? tr("Make it yours")
                  : tr("Track anything")}
            </h2>
          </div>
          <button aria-label={tr("Close tracker builder")} onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        {!custom ? (
          <>
            <label className="journal-search">
              <MagnifyingGlass size={20} />
              <input
                autoFocus
                aria-label={tr("Search trackers")}
                placeholder={tr("Sleep, mobility, fibre, anything…")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              className="journal-create"
              onClick={() => {
                setDraft((current) => ({ ...current, title: search }))
                setCustom(true)
              }}
            >
              <Plus size={21} />
              <span>
                <strong>{tr("Create a custom tracker")}</strong>
                <small>
                  {tr("A number, a daily total or a yes/no habit. You decide.")}
                </small>
              </span>
            </button>
            {existing.length > 0 && (
              <>
                <h3>{tr("Your trackers")}</h3>
                <div className="journal-template-grid">
                  {existing.map((metric) => {
                    const Icon = trackerIcon(metric.title)
                    return (
                      <button key={metric._id} onClick={() => onChoose(metric)}>
                        <Icon size={22} weight="duotone" />
                        <span>
                          {metric.title}
                          <small>{tr("Log a value")}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            <h3>
              <Message
                text={"Start with an idea {{value0}}"}
                values={{
                  value0: (
                    <span className="text-muted-foreground">
                      {matching.length}
                    </span>
                  ),
                }}
              />
            </h3>
            <div className="journal-template-grid">
              {matching.map((template) => {
                const { icon: Icon, ...definition } = template
                const found = metrics.find(
                  (metric) =>
                    metric.title.toLowerCase() === template.title.toLowerCase()
                )
                return (
                  <button
                    key={template.title}
                    disabled={pending || (!found && metrics.length >= 100)}
                    onClick={() =>
                      found ? onChoose(found) : void save(definition)
                    }
                  >
                    <Icon size={22} weight="duotone" />
                    <span>
                      {template.title}
                      <small>
                        {found
                          ? tr("Already tracking")
                          : template.kind === "toggle"
                            ? tr("Yes / no")
                            : template.unit}
                      </small>
                    </span>
                    <Plus size={15} />
                  </button>
                )
              })}
            </div>
            {matching.length === 0 && (
              <p className="text-muted-foreground">
                {tr(
                  "No preset matches. Create exactly the tracker you need above."
                )}
              </p>
            )}
          </>
        ) : (
          <form
            className="journal-definition"
            onSubmit={(event) => {
              event.preventDefault()
              void save(draft)
            }}
          >
            <label>
              <Message
                text={"Name{{value0}}"}
                values={{
                  value0: (
                    <input
                      required
                      maxLength={48}
                      value={draft.title}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                      placeholder={tr("e.g. Time on the climbing wall")}
                    />
                  ),
                }}
              />
            </label>
            <label>
              <Message
                text={"What does it mean to you?{{value0}}"}
                values={{
                  value0: (
                    <input
                      maxLength={180}
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({ ...draft, description: event.target.value })
                      }
                      placeholder={tr("Optional description")}
                    />
                  ),
                }}
              />
            </label>
            <div className="journal-form-pair">
              <label>
                <Message
                  text={"Track as{{value0}}"}
                  values={{
                    value0: (
                      <select
                        value={draft.kind}
                        disabled={Boolean(editing)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            kind: event.target
                              .value as TrackerDefinition["kind"],
                          })
                        }
                      >
                        <option value="number">{tr("A reading")}</option>
                        <option value="counter">{tr("A daily total")}</option>
                        <option value="toggle">{tr("Yes / no")}</option>
                      </select>
                    ),
                  }}
                />
              </label>
              <label>
                <Message
                  text={"Category{{value0}}"}
                  values={{
                    value0: (
                      <select
                        value={draft.tab}
                        onChange={(event) => {
                          const tab = event.target
                            .value as TrackerDefinition["tab"]
                          setDraft({
                            ...draft,
                            tab,
                            accent:
                              tab === "nutrition"
                                ? "food"
                                : tab === "training"
                                  ? "workout"
                                  : "progress",
                          })
                        }}
                      >
                        <option value="body">{tr("Wellbeing")}</option>
                        <option value="training">{tr("Training")}</option>
                        <option value="nutrition">{tr("Nutrition")}</option>
                      </select>
                    ),
                  }}
                />
              </label>
            </div>
            {draft.kind !== "toggle" && (
              <>
                <div className="journal-form-pair">
                  <label>
                    <Message
                      text={"Unit{{value0}}"}
                      values={{
                        value0: (
                          <input
                            maxLength={16}
                            value={draft.unit}
                            onChange={(event) =>
                              setDraft({ ...draft, unit: event.target.value })
                            }
                            placeholder={tr("min, reps, km…")}
                          />
                        ),
                      }}
                    />
                  </label>
                  <label>
                    <Message
                      text={"Quick-add amount{{value0}}"}
                      values={{
                        value0: (
                          <input
                            type="number"
                            required
                            min={0.01}
                            max={10000}
                            step="any"
                            value={draft.step}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                step: Number(event.target.value),
                              })
                            }
                          />
                        ),
                      }}
                    />
                  </label>
                </div>
                <label>
                  <Message
                    text={"Daily target (optional){{value0}}"}
                    values={{
                      value0: (
                        <input
                          type="number"
                          min={0}
                          max={1000000}
                          step="any"
                          value={goal}
                          onChange={(event) => setGoal(event.target.value)}
                          placeholder={tr(
                            "Leave empty to track without a goal"
                          )}
                        />
                      ),
                    }}
                  />
                </label>
              </>
            )}
            <button
              className="journal-save"
              disabled={pending || (!editing && metrics.length >= 100)}
            >
              {pending
                ? tr("Saving…")
                : editing
                  ? tr("Save tracker")
                  : tr("Create tracker")}
            </button>
            {!editing && (
              <button type="button" onClick={() => setCustom(false)}>
                {tr("Back to tracker ideas")}
              </button>
            )}
            {editing && (
              <div className="journal-danger">
                {confirmRemove ? (
                  <>
                    <p>
                      <Message
                        text={
                          "Remove “{{value0}}” and all its history? This cannot be undone."
                        }
                        values={{ value0: editing.title }}
                      />
                    </p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={async () => {
                        setPending(true)
                        try {
                          await remove({ metricId: editing._id })
                          onClose()
                        } catch {
                          setError(
                            translateError(
                              tr("Could not remove tracker. Please try again.")
                            )
                          )
                        } finally {
                          setPending(false)
                        }
                      }}
                    >
                      {tr("Remove tracker and history")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(false)}
                    >
                      {tr("Keep tracker")}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmRemove(true)}>
                    {tr("Remove tracker…")}
                  </button>
                )}
              </div>
            )}
          </form>
        )}
        {pending && <p role="status">{tr("Saving tracker…")}</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {metrics.length >= 100 && !editing && (
          <p>
            {tr(
              "You have 100 trackers. Edit or remove one before adding another."
            )}
          </p>
        )}
      </div>
    </MobileSheet>
  )
}
