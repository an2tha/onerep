import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { CaretLeft, CaretRight, Check, Minus, X } from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { MobileSheet } from "@/components/mobile-sheet"
import { QuickActionDrawer } from "@/dashboard/quick-action-drawers"
import { useWaterUnit } from "@/lib/use-water-unit"
import { formatWater } from "@/lib/measurement-system"
import { toast } from "@repo/ui"
import "./journal.css"

type Field = "alcohol" | "caffeine" | "mood" | "notes"
const fields = {
  alcohol: { label: "Alcohol", icon: "🍷", unit: "drinks", max: 100 },
  caffeine: { label: "Caffeine", icon: "☕", unit: "mg", max: 5000 },
  mood: { label: "Daily mood", icon: "☺", unit: "", max: 5 },
  notes: { label: "Notes", icon: "✎", unit: "", max: 4000 },
}
function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00`)
}
function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
function shift(key: string, days: number) {
  const day = dateFromKey(key)
  day.setDate(day.getDate() + days)
  return dateKey(day)
}
const moods = ["Very low", "Low", "Okay", "Good", "Great"]

export default function Journal() {
  const preferences = useQuery(api.users.users.getPreferences, {})
  const today = currentDateKey(
    preferences?.lastActiveTimezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [selected, setSelected] = useState<string | null>(null)
  const date = selected ?? today
  const start = shift(date, -((dateFromKey(date).getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => shift(start, index))
  const entries = useQuery(api.logs.journal.getWeek, { start, end: days[6] })
  const entry = entries?.find((item) => item.date === date)
  const water = useQuery(api.logs.water.getDay, { date })
  const waterUnit = useWaterUnit()
  const save = useMutation(api.logs.journal.save)
  const [editing, setEditing] = useState<{ field: Field; date: string } | null>(
    null
  )
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [waterOpen, setWaterOpen] = useState(false)
  function edit(field: Field) {
    setDraft(String(entry?.[field] ?? ""))
    setError("")
    setEditing({ field, date })
  }
  async function saveDraft(event: React.FormEvent) {
    event.preventDefault()
    if (!editing || pending) return
    setPending(true)
    setError("")
    try {
      await save({
        date: editing.date,
        values: {
          [editing.field]:
            editing.field === "notes" ? draft.trim() : Number(draft),
        },
      })
      setEditing(null)
    } catch {
      setError(
        "Could not save your entry. Your changes are here, please try again."
      )
    } finally {
      setPending(false)
    }
  }
  async function setHabit(
    field: "lowCarb" | "addedSugar",
    value: boolean | null
  ) {
    if (pending) return
    setPending(true)
    try {
      await save({ date, values: { [field]: value } })
    } catch {
      toast.error("Could not save. Please try again.")
    } finally {
      setPending(false)
    }
  }
  const loaded = entries !== undefined
  const heading =
    date === today
      ? "Today's entries"
      : date === shift(today, -1)
        ? "Yesterday's entries"
        : dateFromKey(date).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
          })
  return (
    <main className="journal-page desktop-canvas min-h-svh bg-background text-foreground lg:pl-72">
      <header className="journal-heading">
        <h1 className="app-title">Journal</h1>
        <div className="journal-month">
          <span>
            {dateFromKey(date).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </span>
          <div>
            <button
              aria-label="Previous week"
              onClick={() => setSelected(shift(date, -7))}
            >
              <CaretLeft size={19} />
            </button>
            <button
              aria-label="Next week"
              disabled={shift(start, 7) > today}
              onClick={() =>
                setSelected(shift(date, 7) > today ? today : shift(date, 7))
              }
            >
              <CaretRight size={19} />
            </button>
          </div>
        </div>
      </header>
      <div className="journal-week" aria-label="Journal dates">
        {days.map((day) => {
          const logged = entries?.some(
            (item) =>
              item.date === day &&
              (item.alcohol !== undefined ||
                item.caffeine !== undefined ||
                item.mood !== undefined ||
                item.lowCarb != null ||
                item.addedSugar != null ||
                Boolean(item.notes))
          )
          return (
            <button
              key={day}
              aria-label={`${dateFromKey(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${logged ? ", has entries" : ""}`}
              aria-pressed={date === day}
              aria-current={day === today ? "date" : undefined}
              disabled={day > today}
              onClick={() => setSelected(day)}
            >
              <span className="journal-weekday">
                {dateFromKey(day).toLocaleDateString(undefined, {
                  weekday: "short",
                })}
              </span>
              <span>{dateFromKey(day).getDate()}</span>
              <span className="journal-day-mark" data-logged={Boolean(logged)}>
                {logged && <Check size={16} weight="bold" />}
              </span>
            </button>
          )
        })}
      </div>
      <section className="journal-entries" aria-busy={!loaded}>
        <div className="journal-section-heading">
          <h2>{heading}</h2>
          {date !== today && (
            <button onClick={() => setSelected(null)}>Today</button>
          )}
        </div>
        <p className="journal-section-label">During the day</p>
        {!loaded && (
          <p role="status" className="text-muted-foreground">
            Loading entries…
          </p>
        )}
        {(
          [
            "alcohol",
            "water",
            "caffeine",
            "lowCarb",
            "mood",
            "addedSugar",
            "notes",
          ] as const
        ).map((field) => {
          if (field === "lowCarb" || field === "addedSugar")
            return (
              <div className="journal-row" key={field}>
                <span aria-hidden="true" className="journal-icon">
                  {field === "lowCarb" ? "🥖" : "🍬"}
                </span>
                <span className="journal-label">
                  {field === "lowCarb" ? "Low carb" : "Added sugar"}
                </span>
                <div
                  className="journal-segment"
                  role="group"
                  aria-label={field === "lowCarb" ? "Low carb" : "Added sugar"}
                >
                  {([false, null, true] as const).map((value, i) => {
                    const Icon = [X, Minus, Check][i]
                    return (
                      <button
                        key={i}
                        aria-label={["No", "Not recorded", "Yes"][i]}
                        aria-pressed={(entry?.[field] ?? null) === value}
                        disabled={!loaded || pending}
                        onClick={() => void setHabit(field, value)}
                      >
                        <Icon size={18} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          const info =
            field === "water"
              ? { label: "Hydration", icon: "💧", unit: "" }
              : fields[field]
          const value =
            field === "water"
              ? water === undefined
                ? "Loading…"
                : water.length
                  ? formatWater(
                      water.reduce((sum, item) => sum + item.amountMl, 0),
                      waterUnit
                    )
                  : "Not recorded"
              : field === "mood"
                ? entry?.mood
                  ? moods[entry.mood - 1]
                  : "Not recorded"
                : field === "notes"
                  ? entry?.notes || "Add a note"
                  : entry?.[field] !== undefined
                    ? `${entry[field]} ${info.unit}`
                    : "Not recorded"
          return (
            <button
              className="journal-row journal-edit-row"
              key={field}
              disabled={!loaded}
              onClick={() =>
                field === "water" ? setWaterOpen(true) : edit(field)
              }
            >
              <span aria-hidden="true" className="journal-icon">
                {info.icon}
              </span>
              <span className="journal-label">{info.label}</span>
              <span className="journal-value">{value}</span>
              <CaretRight className="shrink-0" size={19} />
            </button>
          )
        })}
        <p className="journal-footnote">
          A little context for your training, nutrition and recovery.
        </p>
      </section>
      {editing && (
        <MobileSheet
          ariaLabel={fields[editing.field].label}
          onClose={() => {
            if (!pending) setEditing(null)
          }}
        >
          <form className="journal-form" onSubmit={saveDraft}>
            <div className="journal-section-heading">
              <h2>{fields[editing.field].label}</h2>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(null)}
                aria-label="Close entry"
              >
                <X size={22} />
              </button>
            </div>
            <p className="text-muted-foreground">
              {dateFromKey(editing.date).toLocaleDateString(undefined, {
                dateStyle: "long",
              })}
            </p>
            {editing.field === "mood" ? (
              <fieldset>
                <legend>How did you feel?</legend>
                <div className="journal-moods">
                  {moods.map((mood, i) => (
                    <label key={mood}>
                      <input
                        type="radio"
                        name="mood"
                        value={i + 1}
                        checked={draft === String(i + 1)}
                        onChange={(event) => setDraft(event.target.value)}
                        required
                        disabled={pending}
                      />
                      <span>{mood}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label>
                {fields[editing.field].label}
                {editing.field !== "notes" &&
                  ` (${fields[editing.field].unit})`}
                {editing.field === "notes" ? (
                  <textarea
                    autoFocus
                    value={draft}
                    maxLength={4000}
                    disabled={pending}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={5}
                  />
                ) : (
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={fields[editing.field].max}
                    step={editing.field === "alcohol" ? "0.5" : "1"}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    required
                    disabled={pending}
                  />
                )}
              </label>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <button type="submit" disabled={pending} className="journal-save">
              {pending ? "Saving…" : "Save entry"}
            </button>
          </form>
        </MobileSheet>
      )}
      <QuickActionDrawer
        id={waterOpen ? "water" : null}
        dateKey={date}
        onClose={() => setWaterOpen(false)}
      />
    </main>
  )
}
