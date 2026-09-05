/** Calendar context must survive every route in a backdated food log. */
export function isFoodLogDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

export function isFoodLogTime(value: string | null): value is string {
  return !!value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function foodLogTime(atMinutes?: number, now = new Date()) {
  const minutes =
    atMinutes === undefined
      ? now.getHours() * 60 + now.getMinutes()
      : Math.max(0, Math.min(1439, Math.round(atMinutes)))
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

export function foodLogContextParams(date: string, time?: string | null) {
  const params = new URLSearchParams({ date })
  if (isFoodLogTime(time ?? null)) params.set("time", time!)
  return params.toString()
}

/** Use the selected calendar day, including when no explicit time was chosen. */
export function foodLogTimestamp(
  date: string,
  time?: string | null,
  now = new Date()
) {
  if (!isFoodLogDate(date)) throw new Error("Choose a valid date")
  const clock = isFoodLogTime(time ?? null)
    ? time!
    : foodLogTime(undefined, now)
  const at = new Date(`${date}T${clock}:00`)
  return at.toISOString()
}
