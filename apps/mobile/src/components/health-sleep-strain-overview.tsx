import { Message, tr, uiLocale } from "@repo/ui/i18n"
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
    <section className="health-insight-accordion" data-open={open}>
      <button
        type="button"
        className="health-insight-trigger"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="health-insight-summary">
          <strong>{title}</strong>
          <p>{summary}</p>
        </div>
        {score !== null && (
          <span
            className="health-insight-score"
            aria-label={tr("{{value0}} out of 100", { value0: score })}
          >
            {score}
            <small className="ml-0.5 text-xs text-muted-foreground">/100</small>
          </span>
        )}
        <CaretDown className="health-insight-chevron" size={16} />
      </button>
      <div
        className="health-insight-reveal"
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        aria-hidden={!open}
        inert={!open}
      >
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
    tr("{{value0}}h {{value1}}m", {
      value0: Math.floor(minutes / 60),
      value1: Math.round(minutes % 60),
    })
  const nightDate =
    night?.date === today
      ? tr("Last night")
      : night
        ? tr("Last recorded · {{value0}}", {
            value0: new Date(`${night.date}T12:00:00`).toLocaleDateString(
              uiLocale(),
              { month: "short", day: "numeric" }
            ),
          })
        : tr("Your night, explained")
  return (
    <section aria-label={tr("Sleep and strain insights")} className="mt-6">
      <Overview
        title={tr("Sleep quality")}
        summary={
          data === undefined
            ? tr("Loading your sleep overview…")
            : night
              ? tr("{{value0}} · {{value1}} · {{value2}}", {
                  value0: nightDate,
                  value1: duration(night.minutes),
                  value2: night.band.toLowerCase(),
                })
              : tr("Duration, sleep stages, and a focus for tonight")
        }
        score={night?.score ?? null}
        night
      >
        <p>
          {night?.tip ??
            tr(
              "See how you slept, what shaped your score, and what might help tonight. Sync your wearable to build your first night."
            )}
        </p>
        {night && (
          <div className="health-insight-values">
            <span>
              <Message
                text={"{{value0}} data confidence"}
                values={{ value0: night.confidence }}
              />
            </span>
            <span>
              {night.efficiency === null
                ? tr("Duration-based estimate")
                : tr("{{value0}}% recorded efficiency", {
                    value0: Math.round(night.efficiency),
                  })}
            </span>
          </div>
        )}
        <Link
          className="health-insight-link"
          to={night ? `/health/sleep?date=${night.date}` : "/health/sleep"}
        >
          <Message
            text={"Explore your sleep{{value0}}"}
            values={{ value0: <ArrowRight size={18} /> }}
          />
        </Link>
      </Overview>
      <Overview
        title={tr("Daily strain")}
        summary={
          data === undefined
            ? tr("Loading your strain overview…")
            : strain?.score != null
              ? tr("{{value0}} demand · today so far", { value0: strain.band })
              : tr("Your whole-day demand and training load")
        }
        score={strain?.score ?? null}
      >
        <p>
          {strain?.score != null
            ? tr(
                "See how your daily activity and workouts contribute to demand, alongside your recovery."
              )
            : tr(
                "A single view of physiological strain and training load. Your score builds as activity and workout readings arrive."
              )}
        </p>
        <div className="health-insight-values">
          <span>
            <Message
              text={"Physiological {{value0}}"}
              values={{
                value0:
                  strain?.physiological != null
                    ? tr("{{value0}}/100", { value0: strain.physiological })
                    : tr("· no reading"),
              }}
            />
          </span>
          <span>
            <Message
              text={"Training {{value0}}"}
              values={{
                value0:
                  strain?.training != null
                    ? tr("{{value0}}/100", { value0: strain.training })
                    : tr("· no reading"),
              }}
            />
          </span>
        </div>
        <Link className="health-insight-link" to="/health/strain">
          <Message
            text={"Explore daily strain{{value0}}"}
            values={{ value0: <ArrowRight size={18} /> }}
          />
        </Link>
      </Overview>
    </section>
  )
}
