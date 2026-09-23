import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowUpRight,
  Barbell,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  Drop,
  ForkKnife,
  MagnifyingGlass,
  NotePencil,
  PencilSimple,
  Pill,
  Plus,
  Smiley,
  X,
} from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { ReactiveOrbField } from "@/components/reactive-orb-field"
import { MobileSheet } from "@/components/mobile-sheet"
import {
  QuickActionDrawer,
  type QuickActionId,
} from "@/dashboard/quick-action-drawers"
import { useWaterUnit } from "@/lib/use-water-unit"
import { formatWater } from "@/lib/measurement-system"
import { toast } from "@repo/ui"
import { TrackerStudio, type JournalMetric } from "./journal/tracker-studio"
import { metricValue, shiftDay, trackerIcon } from "./journal/trackers"
import "./journal.css"

const moods = ["Rough", "Low", "Steady", "Good", "Great"]
function calendarDate(key: string) {
  return new Date(`${key}T12:00:00`)
}

export default function Journal() {
  const preferences = useQuery(api.users.users.getPreferences, {})
  const today = currentDateKey(
    preferences?.lastActiveTimezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [selected, setSelected] = useState<string | null>(null)
  const date = selected ?? today
  const start = shiftDay(date, -((calendarDate(date).getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(start, i))
  const entries = useQuery(api.logs.journal.getWeek, { start, end: days[6] })
  const entry = entries?.find((item) => item.date === date)
  const metrics = useQuery(api.logs.journal.trackers, { date })
  const water = useQuery(api.logs.water.getDay, { date })
  const food = useQuery(api.logs.foodLogs.getDay, { date })
  const workouts = useQuery(api.logs.workouts.getLog, { date })
  const waterUnit = useWaterUnit()
  const save = useMutation(api.logs.journal.save)
  const increment = useMutation(api.logs.journal.incrementTracker)
  const setValue = useMutation(api.customProgressMetrics.setValue)
  const clearValue = useMutation(api.customProgressMetrics.clearValue)
  const [studio, setStudio] = useState<true | JournalMetric | null>(null)
  const [editing, setEditing] = useState<{
    metric: JournalMetric
    date: string
  } | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [quickAction, setQuickAction] = useState<QuickActionId | null>(null)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const loaded = entries !== undefined && metrics !== undefined
  function openMetric(metric: JournalMetric) {
    setDraft(
      metric.entries.find((item) => item.date === date)?.value.toString() ?? ""
    )
    setEditing({ metric, date })
    setError("")
    setStudio(null)
  }
  async function act(action: () => Promise<unknown>) {
    if (pending) return
    setPending(true)
    try {
      await action()
    } catch {
      toast.error("Could not save. Please try again.")
    } finally {
      setPending(false)
    }
  }
  async function saveEntry(event: React.FormEvent) {
    event.preventDefault()
    if (!editing || pending || draft.trim() === "") return
    setPending(true)
    setError("")
    try {
      await setValue({
        metricId: editing.metric._id,
        date: editing.date,
        value: Number(draft),
      })
      setEditing(null)
    } catch {
      setError(
        "Could not save your reading. Your value is here, please try again."
      )
    } finally {
      setPending(false)
    }
  }
  const recorded =
    metrics?.filter((metric) =>
      metric.entries.some((item) => item.date === date)
    ).length ?? 0
  const visibleMetrics = (metrics ?? []).filter(
    (metric) =>
      (filter === "all" ||
        metric.tab === filter ||
        (filter === "unlogged" &&
          !metric.entries.some((item) => item.date === date))) &&
      `${metric.title} ${metric.description}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  const heading =
    date === today
      ? "Today, in your own words."
      : calendarDate(date).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
  const quickLogs = [
    {
      id: "food",
      title: "Food",
      Icon: ForkKnife,
      detail: food === undefined ? "Loading…" : `${food.length} entries`,
      tone: "food",
    },
    {
      id: "water",
      title: "Water",
      Icon: Drop,
      detail:
        water === undefined
          ? "Loading…"
          : formatWater(
              water.reduce((sum, item) => sum + item.amountMl, 0),
              waterUnit
            ),
      tone: "water",
    },
    {
      id: "workout",
      title: "Training",
      Icon: Barbell,
      detail:
        workouts === undefined ? "Loading…" : `${workouts.length} sessions`,
      tone: "workout",
    },
    {
      id: "supplements",
      title: "Supplements",
      Icon: Pill,
      detail: "Log an intake",
      tone: "progress",
    },
  ] as const
  return (
    <main className="journal-page app-hero desktop-canvas min-h-svh bg-background text-foreground lg:pl-72">
      <ReactiveOrbField className="journal-hero-wash progress-hero-wash" />
      <header className="journal-heading">
        <p className="journal-kicker">THE DETAILS BEHIND YOUR PROGRESS</p>
        <div className="journal-section-heading">
          <h1 className="app-title">Journal</h1>
          <label className="journal-calendar">
            <CalendarBlank size={22} />
            <input
              type="date"
              aria-label="Choose journal date"
              max={today}
              value={date}
              onChange={(event) => {
                if (event.target.value && event.target.value <= today)
                  setSelected(event.target.value)
              }}
            />
          </label>
        </div>
        <p className="journal-intro">{heading}</p>
      </header>
      <div className="journal-date-navigation">
        <button
          aria-label="Previous week"
          onClick={() => setSelected(shiftDay(date, -7))}
        >
          <CaretLeft size={18} />
        </button>
        <span>
          {calendarDate(date).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </span>
        <button
          aria-label="Next week"
          disabled={shiftDay(start, 7) > today}
          onClick={() =>
            setSelected(shiftDay(date, 7) > today ? today : shiftDay(date, 7))
          }
        >
          <CaretRight size={18} />
        </button>
        {date !== today && (
          <button className="journal-today" onClick={() => setSelected(null)}>
            Today
          </button>
        )}
      </div>
      <div className="journal-week" aria-label="Journal dates">
        {days.map((day) => {
          const hasEntry = entries?.some(
            (item) =>
              item.date === day &&
              (item.mood !== undefined ||
                Boolean(item.notes) ||
                item.caffeine !== undefined ||
                item.alcohol !== undefined ||
                item.lowCarb != null ||
                item.addedSugar != null)
          )
          const hasMetric = metrics?.some((metric) =>
            metric.entries.some((item) => item.date === day)
          )
          return (
            <button
              key={day}
              aria-pressed={date === day}
              aria-current={day === today ? "date" : undefined}
              aria-label={`${calendarDate(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${hasEntry || hasMetric ? ", has entries" : ""}`}
              disabled={day > today}
              onClick={() => setSelected(day)}
            >
              <span className="journal-weekday">
                {calendarDate(day).toLocaleDateString(undefined, {
                  weekday: "short",
                })}
              </span>
              <span>{calendarDate(day).getDate()}</span>
              <span
                className="journal-day-dot"
                data-logged={Boolean(hasEntry || hasMetric)}
              />
            </button>
          )
        })}
      </div>
      <div className="journal-body">
        <section aria-label="Quick log">
          <div className="journal-section-heading">
            <h2>Quick log</h2>
            <span className="journal-caption">Already part of your day</span>
          </div>
          <div className="journal-quick-grid">
            {quickLogs.map(({ id, title, Icon, detail, tone }) => (
              <button
                key={id}
                className="journal-quick app-surface"
                onClick={() => setQuickAction(id)}
              >
                <span className="journal-glyph" data-tone={tone}>
                  <Icon size={25} weight="duotone" />
                </span>
                <strong>{title}</strong>
                <small>{detail}</small>
                <Plus className="journal-quick-plus" size={15} />
              </button>
            ))}
          </div>
        </section>
        <section aria-busy={!loaded} aria-labelledby="journal-trackers-title">
          <div className="journal-section-heading">
            <div>
              <h2 id="journal-trackers-title">Your trackers</h2>
              <p className="journal-caption">
                {loaded
                  ? `${recorded} of ${metrics?.length ?? 0} logged · ${date === today ? "today" : calendarDate(date).toLocaleDateString()}`
                  : "Loading your trackers…"}
              </p>
            </div>
            <button
              className="journal-add"
              onClick={() => setStudio(true)}
              disabled={!loaded}
            >
              <Plus size={18} /> Track anything
            </button>
          </div>
          <div
            className="journal-filters"
            role="group"
            aria-label="Filter trackers"
          >
            {[
              ["all", "All"],
              ["unlogged", "To log"],
              ["training", "Training"],
              ["nutrition", "Nutrition"],
              ["body", "Wellbeing"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {(metrics?.length ?? 0) > 5 && (
            <label className="journal-search">
              <MagnifyingGlass size={18} />
              <input
                aria-label="Find your tracker"
                placeholder="Find your tracker…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          {!loaded && <p role="status">Loading journal…</p>}
          {loaded && metrics?.length === 0 && (
            <div className="journal-empty app-surface">
              <span className="journal-glyph" data-tone="workout">
                <Barbell size={28} weight="duotone" />
              </span>
              <h3>Track what moves you.</h3>
              <p>
                Energy before a lift. Minutes on the trail. A habit you want to
                keep. Start with an idea or build your own.
              </p>
              <button className="journal-save" onClick={() => setStudio(true)}>
                Choose your first trackers <ArrowUpRight size={18} />
              </button>
              <small>
                Readings, daily totals and yes/no habits. Built around your
                routine.
              </small>
            </div>
          )}
          {loaded &&
            (metrics?.length ?? 0) > 0 &&
            visibleMetrics.length === 0 && (
              <p className="journal-empty-filter">
                {filter === "unlogged" && !search
                  ? "Everything tracked for this day. You're all caught up."
                  : "No trackers match. Try another category or search."}
              </p>
            )}
          <div className="journal-tracker-grid">
            {visibleMetrics.map((metric) => {
              const Icon = trackerIcon(metric.title)
              const value = metric.entries.find(
                (item) => item.date === date
              )?.value
              const history = Array.from({ length: 7 }, (_, i) => ({
                date: shiftDay(date, i - 6),
                value: metric.entries.find(
                  (item) => item.date === shiftDay(date, i - 6)
                )?.value,
              }))
              const max = Math.max(
                1,
                metric.target ?? 0,
                ...history.map((item) => item.value ?? 0)
              )
              return (
                <article
                  key={metric._id}
                  className="journal-tracker app-surface"
                  data-tone={metric.accent}
                >
                  <button
                    className="journal-tracker-main"
                    onClick={() => openMetric(metric)}
                  >
                    <span className="journal-glyph" data-tone={metric.accent}>
                      <Icon size={23} weight="duotone" />
                    </span>
                    <span>
                      <strong>{metric.title}</strong>
                      <small>
                        {metric.tab === "body"
                          ? "Wellbeing"
                          : metric.tab === "training"
                            ? "Training"
                            : "Nutrition"}
                      </small>
                    </span>
                    <PencilSimple size={17} />
                  </button>
                  <div className="journal-tracker-reading">
                    <button
                      onClick={() => openMetric(metric)}
                      aria-label={`Log ${metric.title}`}
                    >
                      <span data-empty={value === undefined}>
                        {metricValue(value, metric.kind, metric.unit)}
                      </span>
                    </button>
                    {metric.kind === "counter" ? (
                      <button
                        className="journal-increment"
                        aria-label={`Add ${metric.step} ${metric.unit} to ${metric.title}`}
                        disabled={pending}
                        onClick={() =>
                          void act(() =>
                            increment({ metricId: metric._id, date })
                          )
                        }
                      >
                        +{metric.step}
                      </button>
                    ) : metric.kind === "toggle" ? (
                      <div
                        className="journal-segment"
                        role="group"
                        aria-label={metric.title}
                      >
                        {[0, 1].map((next) => (
                          <button
                            key={next}
                            aria-pressed={value === next}
                            disabled={pending}
                            onClick={() =>
                              void act(() =>
                                setValue({
                                  metricId: metric._id,
                                  date,
                                  value: next,
                                })
                              )
                            }
                          >
                            {next ? <Check size={18} /> : <X size={18} />}
                            <span className="sr-only">
                              {next ? "Yes" : "No"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        className="journal-increment"
                        aria-label={`Log ${metric.title}`}
                        onClick={() => openMetric(metric)}
                      >
                        <Plus size={19} />
                      </button>
                    )}
                  </div>
                  {metric.target != null && metric.kind !== "toggle" && (
                    <p className="journal-target">
                      Target{" "}
                      {metricValue(metric.target, metric.kind, metric.unit)}
                      {value !== undefined && value >= metric.target && (
                        <span>
                          <Check size={12} /> Reached
                        </span>
                      )}
                    </p>
                  )}
                  <div
                    className="journal-history"
                    role="img"
                    aria-label={`Last seven days: ${history.map((item) => `${item.date}: ${metricValue(item.value, metric.kind, metric.unit)}`).join(", ")}`}
                  >
                    {history.map((item) => (
                      <span
                        key={item.date}
                        data-recorded={item.value !== undefined}
                        style={
                          {
                            "--bar-height": `${item.value === undefined ? 8 : Math.max(12, (item.value / max) * 100)}%`,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                  </div>
                  <div className="journal-trend-caption">
                    <span>Last 7 days</span>
                    <span>
                      {
                        history.filter((item) => item.value !== undefined)
                          .length
                      }{" "}
                      days logged
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
        <section
          className="journal-reflection app-surface"
          aria-label="Daily reflection"
        >
          <div className="journal-section-heading">
            <div>
              <p className="journal-kicker">MORE THAN NUMBERS</p>
              <h2>How did it feel?</h2>
            </div>
            <Smiley size={26} weight="duotone" />
          </div>
          <div
            className="journal-mood-scale"
            role="group"
            aria-label="Daily mood"
          >
            {moods.map((mood, i) => (
              <button
                key={mood}
                aria-pressed={entry?.mood === i + 1}
                disabled={!loaded || pending}
                onClick={() =>
                  void act(() => save({ date, values: { mood: i + 1 } }))
                }
              >
                <span>{i + 1}</span>
                {mood}
              </button>
            ))}
          </div>
          <button
            className="journal-note"
            onClick={() => {
              setDraft(entry?.notes ?? "")
              setError("")
              setNotesOpen(true)
            }}
            disabled={!loaded}
          >
            <NotePencil size={22} />
            <span>
              {entry?.notes || "A win, a tough session, something to remember…"}
            </span>
            <PencilSimple size={17} />
          </button>
        </section>
        {entry &&
          (entry.caffeine !== undefined ||
            entry.alcohol !== undefined ||
            entry.lowCarb != null ||
            entry.addedSugar != null) && (
            <details className="journal-legacy">
              <summary>Earlier journal entries</summary>
              <p>
                {entry.caffeine !== undefined &&
                  `Caffeine: ${entry.caffeine} mg. `}
                {entry.alcohol !== undefined &&
                  `Alcohol: ${entry.alcohol} drinks. `}
                {entry.lowCarb != null &&
                  `Low carb: ${entry.lowCarb ? "yes" : "no"}. `}
                {entry.addedSugar != null &&
                  `Added sugar: ${entry.addedSugar ? "yes" : "no"}.`}
              </p>
            </details>
          )}
      </div>
      {studio && (
        <TrackerStudio
          metrics={metrics ?? []}
          editing={studio === true ? undefined : studio}
          onClose={() => setStudio(null)}
          onChoose={openMetric}
        />
      )}
      {editing && (
        <MobileSheet
          ariaLabel={`Log ${editing.metric.title}`}
          onClose={() => setEditing(null)}
        >
          <form className="journal-form" onSubmit={saveEntry}>
            <div className="journal-section-heading">
              <h2>{editing.metric.title}</h2>
              <button
                type="button"
                aria-label="Close reading"
                onClick={() => setEditing(null)}
              >
                <X size={22} />
              </button>
            </div>
            <p className="journal-caption">
              {calendarDate(editing.date).toLocaleDateString(undefined, {
                dateStyle: "long",
              })}
            </p>
            {editing.metric.description && <p>{editing.metric.description}</p>}
            {editing.metric.kind === "toggle" ? (
              <fieldset>
                <legend>Did you do this?</legend>
                <div className="journal-moods">
                  {[0, 1].map((value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="habit"
                        required
                        value={value}
                        checked={draft === String(value)}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                      {value ? "Yes" : "No"}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label>
                {editing.metric.kind === "counter" ? "Daily total" : "Reading"}
                {editing.metric.unit && ` (${editing.metric.unit})`}
                <input
                  autoFocus
                  required
                  type="number"
                  min={0}
                  max={1000000}
                  step="any"
                  inputMode="decimal"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <button className="journal-save" disabled={pending}>
              {pending ? "Saving…" : "Save reading"}
            </button>
            <div className="journal-editor-actions">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setStudio(editing.metric)
                  setEditing(null)
                }}
              >
                Edit tracker & target
              </button>
              <button
                type="button"
                disabled={
                  pending ||
                  !editing.metric.entries.some(
                    (item) => item.date === editing.date
                  )
                }
                onClick={() =>
                  void act(async () => {
                    await clearValue({
                      metricId: editing.metric._id,
                      date: editing.date,
                    })
                    setEditing(null)
                  })
                }
              >
                Clear this day's reading
              </button>
            </div>
          </form>
        </MobileSheet>
      )}
      {notesOpen && (
        <MobileSheet ariaLabel="Daily note" onClose={() => setNotesOpen(false)}>
          <form
            className="journal-form"
            onSubmit={(event) => {
              event.preventDefault()
              void act(async () => {
                await save({ date, values: { notes: draft.trim() } })
                setNotesOpen(false)
              })
            }}
          >
            <div className="journal-section-heading">
              <h2>Leave a note</h2>
              <button
                type="button"
                aria-label="Close note"
                onClick={() => setNotesOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
            <label>
              What stood out?
              <textarea
                autoFocus
                rows={6}
                maxLength={4000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <button className="journal-save" disabled={pending}>
              {pending ? "Saving…" : "Save note"}
            </button>
          </form>
        </MobileSheet>
      )}
      <QuickActionDrawer
        id={quickAction}
        dateKey={date}
        onClose={() => setQuickAction(null)}
      />
    </main>
  )
}
