import {
  SleepAnalysis,
  SleepPreferencesForm,
} from "@repo/ui/sleep"
import { ConnectedReview } from "@repo/ui/sleep"
import { PageBarBack } from "@/components/page-bar-actions"
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
  useEffect(() => setDate(initialDate), [initialDate])
  const data = useQuery(api.logs.sleep.dashboard, { date })
  const generate = useAction(api.ai.sleepReview.generate),
    preferences = useMutation(api.logs.sleep.preferences)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const recentReviews = useQuery(api.logs.sleep.reviewHistory, { limit: 1 })
  const trendValue = (d: NonNullable<typeof data>["history"][number]) =>
    d.strain.score
  const night = data?.sleep,
    strain = data?.strain
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    if (data?.review?.status !== "pending") return
    const timer = window.setInterval(() => setClock(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [data?.review?.status])
  const reviewPending =
    data?.review?.status === "pending" && clock - data.review.updatedAt < 120000
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
  return (
    <DetailAtmosphere tone={strainMode ? "health" : "sleep"}>
      <main className="sleep-detail">
        <PageBarBack>
          <Link to="/health" className="inline-flex items-center gap-2 text-sm">
            <Message
              text={"{{value0}} Health"}
              values={{ value0: <ArrowLeft /> }}
            />
          </Link>
        </PageBarBack>
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
        ) : data === undefined ? (
          <p role="status" className="sleep-summary">
            {tr("Reading your night…")}
          </p>
        ) : data ? (
          <SleepAnalysis
              today={today} linkComponent={Link}
            night={night ?? null}
            history={data.history}
            date={date}
            onSelect={setDate}
            bedtimeMinutes={data.preferences.bedtimeMinutes}
            wakeMinutes={data.preferences.wakeMinutes}
          />
        ) : (
          <p>{tr("Sign in to see your sleep history.")}</p>
        )}
        {!strainMode && night && (
          <>
            {data && <ConnectedReview review={data.connectedReview} linkComponent={Link} today={today} />}
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
        {data && strainMode && (
          <section className="sleep-section">
            <h2>{tr("Recent strain")}</h2>
            <div className="sleep-history">
              {data.history.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  aria-label={tr("{{date}}: {{value}} strain", {
                    date: d.date,
                    value: trendValue(d) ?? tr("Unavailable"),
                  })}
                  onClick={() => setDate(d.date)}
                >
                  <span
                    style={{
                      height: `${trendValue(d) ?? 3}%`,
                      opacity:
                        trendValue(d) === null
                          ? 0.15
                          : d.date === date
                            ? 1
                            : 0.65,
                      background: "#c28e6f",
                    }}
                  />
                </button>
              ))}
            </div>
            <p className="sleep-chart-caption">
              {tr(
                "Select a day to explore it. Missing days are not zero scores."
              )}
            </p>
            <Link className="sleep-text-action" to="/health/sleep">
              {tr("See how you slept")}
            </Link>
          </section>
        )}
        {data && !strainMode && (
          <SleepPreferencesForm
            value={data.preferences}
            save={(value) => preferences(value)}
          />
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
