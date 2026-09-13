import { useId, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { useQuery } from "convex/react"
import { ArrowRight, CaretDown } from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { SleepSky } from "./sleep-sky"
import "./detail-atmosphere.css"

function Overview({
  title,
  summary,
  score,
  night,
  children,
}: {
  title: string
  summary: string
  score: number | null
  night?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <section
      className="health-insight-accordion"
      data-open={open}
    >
      <button
        type="button"
        className="health-insight-trigger"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(value => !value)}
      >
        <div className="health-insight-summary">
          <strong>{title}</strong>
          <p>{summary}</p>
        </div>
        {score !== null && (
          <span
            className="health-insight-score"
            aria-label={`${score} out of 100`}
          >
            {score}
            <small className="ml-0.5 text-xs text-muted-foreground">/100</small>
          </span>
        )}
        <CaretDown className="health-insight-chevron" size={16} />
      </button>
      <div className="health-insight-reveal" id={`${id}-panel`} role="region" aria-labelledby={`${id}-trigger`} aria-hidden={!open} inert={!open}>
        <div className="health-insight-clip">
          <div className="health-insight-expanded">
            <div className={night ? "health-insight-night" : undefined}>
              {night && <SleepSky active={open} />}
              {children}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function HealthSleepStrainOverview() {
  const today = currentDateKey()
  const data = useQuery(api.logs.sleep.dashboard, { date: today })
  const night =
    data?.sleep ??
    [...(data?.history ?? [])].reverse().find((day) => day.sleep)?.sleep ??
    null
  const strain = data?.strain
  const duration = (minutes: number) =>
    `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`
  const nightDate =
    night?.date === today
      ? "Last night"
      : night
        ? `Last recorded · ${new Date(`${night.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : "Your night, explained"
  return (
    <section aria-label="Sleep and strain insights" className="mt-6">
      <Overview
        title="Sleep quality"
        summary={
          data === undefined
            ? "Loading your sleep overview…"
            : night
              ? `${nightDate} · ${duration(night.minutes)} · ${night.band.toLowerCase()}`
              : "Duration, sleep stages, and a focus for tonight"
        }
        score={night?.score ?? null}
        night
      >
        <p>
          {night?.tip ??
            "See how you slept, what shaped your score, and what might help tonight. Sync your wearable to build your first night."}
        </p>
        {night && (
          <div className="health-insight-values">
            <span>{night.confidence} data confidence</span>
            <span>
              {night.efficiency === null
                ? "Duration-based estimate"
                : `${Math.round(night.efficiency)}% recorded efficiency`}
            </span>
          </div>
        )}
        <Link
          className="health-insight-link"
          to={night ? `/health/sleep?date=${night.date}` : "/health/sleep"}
        >
          Explore your sleep
          <ArrowRight size={18} />
        </Link>
      </Overview>
      <Overview
        title="Daily strain"
        summary={
          data === undefined
            ? "Loading your strain overview…"
            : strain?.score != null
              ? `${strain.band} demand · today so far`
              : "Your whole-day demand and training load"
        }
        score={strain?.score ?? null}
      >
        <p>
          {strain?.score != null
            ? "See how your daily activity and workouts contribute to demand, alongside your recovery."
            : "A single view of physiological strain and training load. Your score builds as activity and workout readings arrive."}
        </p>
        <div className="health-insight-values">
          <span>
            Physiological{" "}
            {strain?.physiological != null
              ? `${strain.physiological}/100`
              : "· no reading"}
          </span>
          <span>
            Training{" "}
            {strain?.training != null
              ? `${strain.training}/100`
              : "· no reading"}
          </span>
        </div>
        <Link className="health-insight-link" to="/health/strain">
          Explore daily strain
          <ArrowRight size={18} />
        </Link>
      </Overview>
    </section>
  )
}
