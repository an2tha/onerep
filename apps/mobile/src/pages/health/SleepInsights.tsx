import { Message, choice, tr, translateError, uiLocale } from "@repo/ui/i18n"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  ArrowRight,
  ClockCounterClockwise,
  Sparkle,
} from "@phosphor-icons/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey, offsetDateKey } from "@/lib/food-log"
import { useAiFeatureGate } from "@/lib/ai-access"
import { DetailAtmosphere } from "@/components/detail-atmosphere"
import { MobileSheet } from "@/components/mobile-sheet"
import { SleepSky } from "@/components/sleep-sky"
import { formatHours } from "./shared"

function sleepReviewDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(uiLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function SleepReviewHistory({
  onClose,
  onSelect,
}: {
  onClose: () => void
  onSelect: (date: string) => void
}) {
  const reviews = useQuery(api.logs.sleep.reviewHistory, { limit: 30 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = reviews?.find((review) => review._id === selectedId)
  return (
    <MobileSheet
      onClose={onClose}
      ariaLabel={tr("Sleep Coach recommendation history")}
      maxHeight="90svh"
      panelClassName="sleep-review-history-sheet"
      overlayClassName="bg-[#020511]/70 backdrop-blur-[10px]"
      showHandle
    >
      <div className="sleep-review-history-sky" aria-hidden="true">
        <SleepSky />
      </div>
      <div className="sleep-review-history-content">
        <div className="sleep-review-history-header">
          {selected ? (
            <button
              type="button"
              className="sleep-review-history-back"
              onClick={() => setSelectedId(null)}
              aria-label={tr("Back to past recommendations")}
            >
              <ArrowLeft size={16} weight="bold" />
            </button>
          ) : (
            <ClockCounterClockwise size={22} aria-hidden="true" />
          )}
          <div>
            <h2>
              {selected
                ? sleepReviewDate(selected.date)
                : tr("Past recommendations")}
            </h2>
            <p>
              {selected
                ? tr("Coach’s reading of this night")
                : tr("Sleep advice, paired with the night behind it.")}
            </p>
          </div>
        </div>
        {selected ? (
          <article className="sleep-review-history-detail">
            <div className="sleep-review-history-full-review">
              {selected.review}
            </div>
            <button
              type="button"
              className="sleep-review-history-night-button"
              onClick={() => onSelect(selected.date)}
            >
              <Message
                text={"See this night’s sleep data{{value0}}"}
                values={{ value0: <ArrowRight size={15} weight="bold" /> }}
              />
            </button>
          </article>
        ) : reviews === undefined ? (
          <div className="sleep-review-history-loading" role="status">
            {tr("Reading your review history…")}
          </div>
        ) : reviews.length === 0 ? (
          <p className="sleep-review-history-empty">
            {tr("Your first AI sleep review will appear here.")}
          </p>
        ) : (
          <ol className="sleep-review-history-list">
            {reviews.map((review) => (
              <li key={review._id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(review._id)}
                  aria-label={tr(
                    "Read Sleep Coach recommendation for {{value0}}",
                    { value0: sleepReviewDate(review.date) }
                  )}
                >
                  <span className="sleep-review-history-date">
                    {sleepReviewDate(review.date)}
                  </span>
                  <span className="sleep-review-history-copy">
                    {review.review
                      .split(/\n+/)[0]
                      .replace(/^What stands out:\s*/i, "")}
                  </span>
                  <span className="sleep-review-history-open">
                    <Message
                      text={"Read recommendation {{value0}}"}
                      values={{
                        value0: <ArrowRight size={13} weight="bold" />,
                      }}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </MobileSheet>
  )
}

export default function SleepInsights({
  strainMode = false,
}: {
  strainMode?: boolean
}) {
  const [searchParams] = useSearchParams()
  const today = currentDateKey()
  const requestedDate = searchParams.get("date") ?? ""
  const initialDate =
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    requestedDate <= today &&
    Number.isFinite(Date.parse(requestedDate)) &&
    new Date(requestedDate).toISOString().slice(0, 10) === requestedDate
      ? requestedDate
      : today
  const [date, setDate] = useState(initialDate)
  const data = useQuery(api.logs.sleep.dashboard, { date })
  const generate = useAction(api.ai.sleepReview.generate),
    preferences = useMutation(api.logs.sleep.preferences)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const recentReviews = useQuery(api.logs.sleep.reviewHistory, { limit: 1 })
  const [trend, setTrend] = useState<"quality" | "duration" | "consistency">(
    "quality"
  )
  const trendValue = (d: NonNullable<typeof data>["history"][number]) =>
    strainMode
      ? d.strain.score
      : trend === "duration"
        ? (d.sleep?.minutes ?? null)
        : trend === "consistency"
          ? (d.sleep?.parts.find((p) => p.key === "consistency")?.score ?? null)
          : (d.sleep?.score ?? null)
  const night = data?.sleep,
    strain = data?.strain
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    if (data?.review?.status !== "pending") return
    const timer = window.setInterval(() => setClock(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [data?.review?.status])
  const reviewPending =
    data?.review?.status === "pending" &&
    Math.max(clock, Date.now()) - data.review.updatedAt < 120000
  const colors: Record<string, string> = {
    Light: "#8595cb",
    Deep: "#5964ab",
    REM: "#bb9cdf",
    Awake: "#e2bd90",
    Unclassified: "#657185",
  }
  async function review() {
    if (busy || !requireAiAccess(1, "sleep_review")) return
    setBusy(true)
    setError(translateError(""))
    try {
      await generate({ date })
    } catch (e) {
      setError(
        translateError(
          e instanceof Error
            ? e.message
            : tr("Review unavailable. Please retry.")
        )
      )
    } finally {
      setBusy(false)
    }
  }
  async function savePreferences(
    automaticReview: boolean,
    targetMinutes: number
  ) {
    setError(translateError(""))
    try {
      await preferences({ automaticReview, targetMinutes })
    } catch {
      setError(translateError(tr("Could not save preferences. Please retry.")))
    }
  }
  const stages = night
    ? [
        ...night.stages,
        ...(night.unclassifiedMinutes > 0
          ? [{ label: tr("Unclassified"), minutes: night.unclassifiedMinutes }]
          : []),
        ...(night.awake !== null
          ? [{ label: tr("Awake"), minutes: night.awake }]
          : []),
      ]
    : []
  return (
    <DetailAtmosphere tone={strainMode ? "health" : "sleep"}>
      <main className="sleep-detail">
        <Link to="/health" className="inline-flex items-center gap-2 text-sm">
          <Message
            text={"{{value0}} Health"}
            values={{ value0: <ArrowLeft /> }}
          />
        </Link>
        <div className="sleep-date-nav">
          <button
            aria-label={tr("Previous day")}
            onClick={() => setDate(offsetDateKey(date, -1))}
          >
            <ArrowLeft />
          </button>
          <input
            aria-label={
              strainMode ? tr("Strain date") : tr("Sleep date (waking day)")
            }
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value)
            }}
          />
          <button
            aria-label={tr("Next day")}
            disabled={date >= today}
            onClick={() => setDate(offsetDateKey(date, 1))}
          >
            <ArrowRight />
          </button>
        </div>
        {strainMode ? (
          <>
            <h1 className="text-3xl font-semibold">
              {tr("The weight of your day.")}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {tr("Physiological strain and training load, together.")}
            </p>
          </>
        ) : (
          <section className="sleep-night-intro">
            <h2>{tr("Sleep, understood.")}</h2>
            {data === undefined ? (
              <p role="status">{tr("Reading your night…")}</p>
            ) : night ? (
              <>
                <div className="sleep-night-score">
                  {night.score}
                  <span className="text-xl opacity-70"> / 100</span>
                </div>
                <p>
                  <Message
                    text={"{{value0}} · {{value1}} asleep"}
                    values={{
                      value0: night.band,
                      value1: formatHours(night.minutes),
                    }}
                  />
                </p>
                <p className="mt-2 text-sm text-[#c1cde4]">
                  <Message
                    text={"{{value0}} data confidence · waking {{value1}}"}
                    values={{ value0: night.confidence, value1: date }}
                  />
                </p>
              </>
            ) : (
              <>
                <p className="mt-6">
                  {tr("No sleep recorded for this night.")}
                </p>
                <p className="text-sm text-[#c1cde4]">
                  {tr(
                    "Sync your wearable or add sleep in Health. A new reading may arrive later today."
                  )}
                </p>
              </>
            )}
          </section>
        )}
        {!strainMode && night && (
          <>
            <dl className="sleep-metrics">
              <div>
                <dt>{tr("Asleep")}</dt>
                <dd>{formatHours(night.minutes)}</dd>
              </div>
              <div>
                <dt>{tr("Baseline")}</dt>
                <dd>
                  {night.baseline === null
                    ? tr("Building")
                    : formatHours(night.baseline)}
                </dd>
              </div>
              <div>
                <dt>{tr("Recorded efficiency")}</dt>
                <dd>
                  {night.efficiency === null
                    ? tr("Unavailable")
                    : tr("{{value0}}%", {
                        value0: Math.round(night.efficiency),
                      })}
                </dd>
              </div>
            </dl>
            <section className="sleep-section">
              <h2>{tr("Your night, in detail")}</h2>
              {night.startedAt !== null && night.endedAt !== null && (
                <p className="mb-3 text-sm text-muted-foreground">
                  <Message
                    text={"{{value0}} – {{value1}} · main sleep period"}
                    values={{
                      value0: new Date(night.startedAt).toLocaleTimeString(
                        uiLocale(),
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      ),
                      value1: new Date(night.endedAt).toLocaleTimeString(
                        uiLocale(),
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      ),
                    }}
                  />
                </p>
              )}
              {night.napMinutes !== null && night.napMinutes > 0 && (
                <p className="mb-3 text-sm text-muted-foreground">
                  <Message
                    text={
                      "An additional {{value0}} of sleep was recorded outside this main period."
                    }
                    values={{ value0: formatHours(night.napMinutes) }}
                  />
                </p>
              )}
              <div
                className="sleep-stage-bar"
                aria-label={tr("Recorded sleep stage proportions")}
              >
                {stages.map((s) => (
                  <span
                    key={s.label}
                    style={{
                      width: `${(s.minutes / (night.minutes + (night.awake ?? 0))) * 100}%`,
                      background: colors[s.label],
                    }}
                  />
                ))}
              </div>
              <div className="sleep-stage-legend">
                {stages.map((s) => (
                  <span key={s.label}>
                    <i style={{ background: colors[s.label] }} />
                    {s.label} {formatHours(s.minutes)} ·{" "}
                    {Math.round(
                      (s.minutes / (night.minutes + (night.awake ?? 0))) * 100
                    )}
                    %
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {tr(
                  "Stage totals, not a chronological timeline. Your wearable estimates stages; unclassified time stays visible."
                )}
              </p>
            </section>
            <section className="sleep-section">
              <h2>{tr("What shaped your score")}</h2>
              {night.parts.map((p) => (
                <div className="sleep-contributor" key={p.key}>
                  <span>
                    {p.label}{" "}
                    <small className="text-muted-foreground">
                      <Message
                        text={"{{value0}}% weight"}
                        values={{ value0: p.weight }}
                      />
                    </small>
                  </span>
                  <span>{Math.round(p.score)}/100</span>
                  <p>{p.detail}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {tr(
                  "Available components share the weight. Confidence describes coverage, not medical accuracy. Missing data never counts as zero."
                )}
              </p>
            </section>
            <section className="sleep-section">
              <h2>{tr("Tonight’s focus")}</h2>
              <p>{night.tip}</p>
              {night.observations.map((o) => (
                <p key={o} className="mt-3 text-sm text-muted-foreground">
                  {o}
                </p>
              ))}
              <p className="mt-3 text-sm text-muted-foreground">
                <Message
                  text={
                    "{{value0}} below your goal across {{value1}} recorded nights. This is a goal shortfall, not a precise repayment target."
                  }
                  values={{
                    value0: formatHours(night.shortfall),
                    value1: night.shortfallNights,
                  }}
                />
              </p>
            </section>
            <section className="sleep-section">
              <h2>{tr("A second look with Coach")}</h2>
              <button
                className="sleep-action"
                onClick={review}
                disabled={busy || reviewPending}
              >
                <Sparkle />
                {busy || reviewPending
                  ? tr("Reviewing your sleep…")
                  : tr("Review my sleep with AI")}
              </button>
              {data?.review?.review && (
                <div className="mt-5 text-sm leading-7 whitespace-pre-line">
                  {data.review.review}
                </div>
              )}
              {data?.reviewStale && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {tr(
                    "New readings have arrived. Review again for an updated interpretation."
                  )}
                </p>
              )}
              {data?.review?.status === "error" && (
                <p role="alert" className="sleep-error mt-3">
                  {data.review.error}
                </p>
              )}
              <Link
                to={`/coach?sleep=1&sleepDate=${date}`}
                className="mt-5 inline-flex items-center gap-2 text-sm underline underline-offset-4"
              >
                <Message
                  text={"Continue in sleep mode {{value0}}"}
                  values={{ value0: <ArrowRight /> }}
                />
              </Link>
              {(recentReviews?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="sleep-review-history-trigger"
                  onClick={() => setHistoryOpen(true)}
                >
                  <span>
                    <strong>{tr("Past recommendations")}</strong>
                    <small>
                      {tr("Revisit what Sleep Coach noticed before")}
                    </small>
                  </span>
                  <ClockCounterClockwise size={18} aria-hidden="true" />
                </button>
              )}
            </section>
            {historyOpen && (
              <SleepReviewHistory
                onClose={() => setHistoryOpen(false)}
                onSelect={(reviewDate) => {
                  setDate(reviewDate)
                  setHistoryOpen(false)
                }}
              />
            )}
          </>
        )}
        {strainMode &&
          (data === undefined ? (
            <p role="status" className="mt-8">
              {tr("Reading your day…")}
            </p>
          ) : (
            strain && (
              <>
                <section className="sleep-section">
                  <div className="sleep-night-score">
                    {strain.score ?? "—"}
                    <span className="text-xl text-muted-foreground">
                      {" "}
                      / 100
                    </span>
                  </div>
                  <p>
                    <Message
                      text={"{{value0}} · {{value1}} data confidence"}
                      values={{
                        value0: strain.band,
                        value1: strain.confidence,
                      }}
                    />
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <Message
                      text={"{{value0}} Higher means more demand."}
                      values={{
                        value0: choice(
                          date === today
                            ? "Today so far. Updates when readings sync."
                            : "Based on the recorded day."
                        ),
                      }}
                    />
                  </p>
                  {data?.strainBaseline !== null &&
                    data?.strainBaseline !== undefined && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        <Message
                          text={"Your recent typical day: {{value0}}/100."}
                          values={{ value0: Math.round(data.strainBaseline) }}
                        />
                      </p>
                    )}
                </section>
                <section className="sleep-section">
                  <h2>{tr("Two sides of strain")}</h2>
                  {[
                    {
                      label: tr("Physiological strain"),
                      score: strain.physiological,
                    },
                    { label: tr("Training load"), score: strain.training },
                  ].map((p) => (
                    <div key={p.label} className="sleep-contributor">
                      <span>{p.label}</span>
                      <span>
                        {p.score ?? tr("Unavailable")}
                        {p.score !== null ? "/100" : ""}
                      </span>
                    </div>
                  ))}
                  {strain.parts.map((p) => (
                    <p key={p.key} className="text-sm text-muted-foreground">
                      <Message
                        text={
                          "{{value0}}: {{value1}}% of available weight · approximately {{value2}} composite points."
                        }
                        values={{
                          value0: p.label,
                          value1: p.weight,
                          value2: p.contribution,
                        }}
                      />
                    </p>
                  ))}
                  <p className="mt-4 text-sm text-muted-foreground">
                    {strain.explanation}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tr(
                      "A OneRep estimate. Daily energy and steps cannot measure mental stress or continuous cardiovascular strain. Unrecorded training remains unknown."
                    )}
                  </p>
                </section>
                <section className="sleep-section">
                  <h2>{tr("How training accumulated")}</h2>
                  {strain.workouts.length ? (
                    [...strain.workouts]
                      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
                      .map((w) => (
                        <div className="sleep-contributor" key={w.id}>
                          <span>{w.name}</span>
                          <span>
                            <Message
                              text={"{{value0}} load units"}
                              values={{ value0: w.load }}
                            />
                          </span>
                          <p>
                            <Message
                              text={
                                "{{value0}} · {{value1}} min · {{value2}} hard sets{{value3}}"
                              }
                              values={{
                                value0: w.startedAt
                                  ? new Date(w.startedAt).toLocaleTimeString(
                                      uiLocale(),
                                      {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }
                                    )
                                  : tr("Time unavailable"),
                                value1: Math.round(w.minutes),
                                value2: w.hardSets ?? 0,
                                value3: choice(
                                  w.estimated
                                    ? " · estimated effort"
                                    : " · recorded intensity"
                                ),
                              }}
                            />
                          </p>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {tr("No workouts recorded for this day.")}
                    </p>
                  )}
                </section>
                <section className="sleep-section">
                  <h2>{tr("Strain meets recovery")}</h2>
                  <p>
                    {data?.recovery?.status === "unknown" || !data?.recovery
                      ? tr(
                          "More sleep, HRV, or resting-heart-rate history is needed to interpret recovery."
                        )
                      : data.recovery.status === "compromised"
                        ? tr(
                            "Recovery signals are below your usual pattern. Consider how you feel before adding more demand."
                          )
                        : (strain.score ?? 0) >= 70
                          ? tr(
                              "A demanding day with stable recovery signals. Leave room to recover and check how you feel tomorrow."
                            )
                          : tr(
                              "Demand is relatively light and recovery signals are stable. Your plan and how you feel can guide what comes next."
                            )}
                  </p>
                  <Link
                    className="mt-4 inline-block text-sm underline"
                    to="/health/recovery"
                  >
                    {tr("See recovery breakdown")}
                  </Link>
                </section>
              </>
            )
          ))}
        {data && (
          <>
            <section className="sleep-section">
              <h2>{strainMode ? tr("Recent strain") : tr("Recent nights")}</h2>
              {!strainMode && (
                <div
                  className="mb-3 flex gap-3 text-sm"
                  aria-label={tr("Sleep trend")}
                >
                  {(["quality", "duration", "consistency"] as const).map(
                    (item) => (
                      <button
                        key={item}
                        className="min-h-11 capitalize underline-offset-4"
                        style={{
                          textDecoration: trend === item ? "underline" : "none",
                        }}
                        aria-pressed={trend === item}
                        onClick={() => setTrend(item)}
                      >
                        {item}
                      </button>
                    )
                  )}
                </div>
              )}
              <div className="sleep-history">
                {data.history.map((d) => (
                  <button
                    key={d.date}
                    aria-label={tr("{{value0}}: {{value1}} {{value2}}", {
                      value0: d.date,
                      value1: trendValue(d) ?? "unavailable",
                      value2: choice(
                        !strainMode && trend === "duration"
                          ? "minutes"
                          : "score"
                      ),
                    })}
                    title={tr("{{value0}}: {{value1}}", {
                      value0: d.date,
                      value1: trendValue(d) ?? "unavailable",
                    })}
                    onClick={() => setDate(d.date)}
                  >
                    <span
                      style={{
                        height: `${trendValue(d) === null ? 3 : !strainMode && trend === "duration" ? Math.min(100, trendValue(d)! / 6) : trendValue(d)}%`,
                        opacity:
                          trendValue(d) === null
                            ? 0.15
                            : d.date === date
                              ? 1
                              : 0.65,
                        background: strainMode ? "#c28e6f" : "#8196d1",
                      }}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {tr(
                  "Select a day to explore it. Missing days are not zero scores."
                )}
              </p>
              <Link
                to={strainMode ? "/health/sleep" : "/health/strain"}
                className="mt-4 inline-flex items-center gap-2 text-sm underline"
              >
                {strainMode
                  ? tr("See how you slept")
                  : tr("Explore daily strain")}
                <ArrowRight />
              </Link>
            </section>
            {!strainMode && (
              <section className="sleep-section">
                <h2>{tr("Your sleep preferences")}</h2>
                <label className="flex items-center justify-between gap-4 text-sm">
                  <Message
                    text={"Sleep goal{{value0}}"}
                    values={{
                      value0: (
                        <select
                          aria-label={tr("Sleep goal")}
                          value={data.preferences.targetMinutes}
                          onChange={(e) =>
                            void savePreferences(
                              data.preferences.automaticReview,
                              Number(e.target.value)
                            )
                          }
                          className="rounded bg-background p-2"
                        >
                          {[420, 450, 480, 510, 540, 570, 600].map((m) => (
                            <option value={m} key={m}>
                              {formatHours(m)}
                            </option>
                          ))}
                        </select>
                      ),
                    }}
                  />
                </label>
                <label className="mt-5 flex items-center gap-3 text-sm">
                  <Message
                    text={"{{value0}}Automatic review after each night syncs"}
                    values={{
                      value0: (
                        <input
                          type="checkbox"
                          checked={data.preferences.automaticReview}
                          onChange={(e) =>
                            void savePreferences(
                              e.target.checked,
                              data.preferences.targetMinutes
                            )
                          }
                        />
                      ),
                    }}
                  />
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  {tr(
                    "Uses your AI allowance and existing AI processing settings. Regular insights are always available."
                  )}
                </p>
              </section>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="sleep-error mt-4">
            {error}
          </p>
        )}
        {aiAccessModal}
      </main>
    </DetailAtmosphere>
  )
}
