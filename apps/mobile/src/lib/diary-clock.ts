import { useEffect, useState } from "react"
import { currentDateKey } from "./food-log"

export function diaryTime(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at)
}

export function useDiaryClock(timeZone: string) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])
  const time = diaryTime(now, timeZone)
  const [hour, minute] = time.split(":").map(Number)
  return {
    now,
    todayKey: currentDateKey(timeZone, now),
    nowMinutes: hour * 60 + minute,
  }
}

/** Interpret an explicit wall-clock time in the diary zone, including DST. */
export function diaryTimestamp(date: string, time: string, timeZone: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("Choose a valid date and time.")
  const wall = Date.parse(`${date}T${time}:00Z`)
  let candidate = wall
  for (let i = 0; i < 4; i++) {
    const at = new Date(candidate)
    const shown = Date.parse(
      `${currentDateKey(timeZone, at)}T${diaryTime(at, timeZone)}:00Z`
    )
    candidate += wall - shown
  }
  const at = new Date(candidate)
  if (currentDateKey(timeZone, at) !== date || diaryTime(at, timeZone) !== time)
    throw new Error(
      "That time does not exist on this date. Choose another time."
    )
  return at.toISOString()
}
