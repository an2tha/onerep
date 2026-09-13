import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  ClockCounterClockwise,
  Sparkle,
} from "@phosphor-icons/react";
import { api } from "../../../../../convex/_generated/api";
import { currentDateKey, offsetDateKey } from "@/lib/food-log";
import { useAiFeatureGate } from "@/lib/ai-access";
import { DetailAtmosphere } from "@/components/detail-atmosphere";
import { MobileSheet } from "@/components/mobile-sheet";
import { SleepSky } from "@/components/sleep-sky";
import { formatHours } from "./shared";

function sleepReviewDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function SleepReviewHistory({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (date: string) => void;
}) {
  const reviews = useQuery(api.logs.sleep.reviewHistory, { limit: 30 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = reviews?.find((review) => review._id === selectedId);
  return (
    <MobileSheet
      onClose={onClose}
      ariaLabel="Sleep Coach recommendation history"
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
              aria-label="Back to past recommendations"
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
                : "Past recommendations"}
            </h2>
            <p>
              {selected
                ? "Coach’s reading of this night"
                : "Sleep advice, paired with the night behind it."}
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
              See this night’s sleep data
              <ArrowRight size={15} weight="bold" />
            </button>
          </article>
        ) : reviews === undefined ? (
          <div className="sleep-review-history-loading" role="status">
            Reading your review history…
          </div>
        ) : reviews.length === 0 ? (
          <p className="sleep-review-history-empty">
            Your first AI sleep review will appear here.
          </p>
        ) : (
          <ol className="sleep-review-history-list">
            {reviews.map((review) => (
              <li key={review._id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(review._id)}
                  aria-label={`Read Sleep Coach recommendation for ${sleepReviewDate(review.date)}`}
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
                    Read recommendation <ArrowRight size={13} weight="bold" />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </MobileSheet>
  );
}

export default function SleepInsights({
  strainMode = false,
}: {
  strainMode?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const today = currentDateKey();
  const requestedDate = searchParams.get("date") ?? "";
  const initialDate =
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    requestedDate <= today &&
    Number.isFinite(Date.parse(requestedDate)) &&
    new Date(requestedDate).toISOString().slice(0, 10) === requestedDate
      ? requestedDate
      : today;
  const [date, setDate] = useState(initialDate);
  const data = useQuery(api.logs.sleep.dashboard, { date });
  const generate = useAction(api.ai.sleepReview.generate),
    preferences = useMutation(api.logs.sleep.preferences);
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const recentReviews = useQuery(api.logs.sleep.reviewHistory, { limit: 1 });
  const [trend, setTrend] = useState<"quality" | "duration" | "consistency">(
    "quality",
  );
  const trendValue = (d: NonNullable<typeof data>["history"][number]) =>
    strainMode
      ? d.strain.score
      : trend === "duration"
        ? (d.sleep?.minutes ?? null)
        : trend === "consistency"
          ? (d.sleep?.parts.find((p) => p.key === "consistency")?.score ?? null)
          : (d.sleep?.score ?? null);
  const night = data?.sleep,
    strain = data?.strain;
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (data?.review?.status !== "pending") return;
    const timer = window.setInterval(() => setClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [data?.review?.status]);
  const reviewPending =
    data?.review?.status === "pending" &&
    Math.max(clock, Date.now()) - data.review.updatedAt < 120000;
  const colors: Record<string, string> = {
    Light: "#8595cb",
    Deep: "#5964ab",
    REM: "#bb9cdf",
    Awake: "#e2bd90",
    Unclassified: "#657185",
  };
  async function review() {
    if (busy || !requireAiAccess(1, "sleep_review")) return;
    setBusy(true);
    setError("");
    try {
      await generate({ date });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Review unavailable. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function savePreferences(
    automaticReview: boolean,
    targetMinutes: number,
  ) {
    setError("");
    try {
      await preferences({ automaticReview, targetMinutes });
    } catch {
      setError("Could not save preferences. Please retry.");
    }
  }
  const stages = night
    ? [
        ...night.stages,
        ...(night.unclassifiedMinutes > 0
          ? [{ label: "Unclassified", minutes: night.unclassifiedMinutes }]
          : []),
        ...(night.awake !== null
          ? [{ label: "Awake", minutes: night.awake }]
          : []),
      ]
    : [];
  return (
    <DetailAtmosphere tone={strainMode ? "health" : "sleep"}>
      <main className="sleep-detail">
        <Link to="/health" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft /> Health
        </Link>
        <div className="sleep-date-nav">
          <button
            aria-label="Previous day"
            onClick={() => setDate(offsetDateKey(date, -1))}
          >
            <ArrowLeft />
          </button>
          <input
            aria-label={strainMode ? "Strain date" : "Sleep date (waking day)"}
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
          <button
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => setDate(offsetDateKey(date, 1))}
          >
            <ArrowRight />
          </button>
        </div>
        {strainMode ? (
          <>
            <h1 className="text-3xl font-semibold">The weight of your day.</h1>
            <p className="mt-3 text-muted-foreground">
              Physiological strain and training load, together.
            </p>
          </>
        ) : (
          <section className="sleep-night-intro">
            <h2>Sleep, understood.</h2>
            {data === undefined ? (
              <p role="status">Reading your night…</p>
            ) : night ? (
              <>
                <div className="sleep-night-score">
                  {night.score}
                  <span className="text-xl opacity-70"> / 100</span>
                </div>
                <p>
                  {night.band} · {formatHours(night.minutes)} asleep
                </p>
                <p className="mt-2 text-sm text-[#c1cde4]">
                  {night.confidence} data confidence · waking {date}
                </p>
              </>
            ) : (
              <>
                <p className="mt-6">No sleep recorded for this night.</p>
                <p className="text-sm text-[#c1cde4]">
                  Sync your wearable or add sleep in Health. A new reading may
                  arrive later today.
                </p>
              </>
            )}
          </section>
        )}
        {!strainMode && night && (
          <>
            <dl className="sleep-metrics">
              <div>
                <dt>Asleep</dt>
                <dd>{formatHours(night.minutes)}</dd>
              </div>
              <div>
                <dt>Baseline</dt>
                <dd>
                  {night.baseline === null
                    ? "Building"
                    : formatHours(night.baseline)}
                </dd>
              </div>
              <div>
                <dt>Recorded efficiency</dt>
                <dd>
                  {night.efficiency === null
                    ? "Unavailable"
                    : `${Math.round(night.efficiency)}%`}
                </dd>
              </div>
            </dl>
            <section className="sleep-section">
              <h2>Your night, in detail</h2>
              {night.startedAt !== null && night.endedAt !== null && (
                <p className="mb-3 text-sm text-muted-foreground">
                  {new Date(night.startedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  –{" "}
                  {new Date(night.endedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · main sleep period
                </p>
              )}
              {night.napMinutes !== null && night.napMinutes > 0 && (
                <p className="mb-3 text-sm text-muted-foreground">
                  An additional {formatHours(night.napMinutes)} of sleep was
                  recorded outside this main period.
                </p>
              )}
              <div
                className="sleep-stage-bar"
                aria-label="Recorded sleep stage proportions"
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
                      (s.minutes / (night.minutes + (night.awake ?? 0))) * 100,
                    )}
                    %
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Stage totals, not a chronological timeline. Your wearable
                estimates stages; unclassified time stays visible.
              </p>
            </section>
            <section className="sleep-section">
              <h2>What shaped your score</h2>
              {night.parts.map((p) => (
                <div className="sleep-contributor" key={p.key}>
                  <span>
                    {p.label}{" "}
                    <small className="text-muted-foreground">
                      {p.weight}% weight
                    </small>
                  </span>
                  <span>{Math.round(p.score)}/100</span>
                  <p>{p.detail}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Available components share the weight. Confidence describes
                coverage, not medical accuracy. Missing data never counts as
                zero.
              </p>
            </section>
            <section className="sleep-section">
              <h2>Tonight’s focus</h2>
              <p>{night.tip}</p>
              {night.observations.map((o) => (
                <p key={o} className="mt-3 text-sm text-muted-foreground">
                  {o}
                </p>
              ))}
              <p className="mt-3 text-sm text-muted-foreground">
                {formatHours(night.shortfall)} below your goal across{" "}
                {night.shortfallNights} recorded nights. This is a goal
                shortfall, not a precise repayment target.
              </p>
            </section>
            <section className="sleep-section">
              <h2>A second look with Coach</h2>
              <button
                className="sleep-action"
                onClick={review}
                disabled={busy || reviewPending}
              >
                <Sparkle />
                {busy || reviewPending
                  ? "Reviewing your sleep…"
                  : "Review my sleep with AI"}
              </button>
              {data?.review?.review && (
                <div className="mt-5 whitespace-pre-line text-sm leading-7">
                  {data.review.review}
                </div>
              )}
              {data?.reviewStale && (
                <p className="mt-2 text-xs text-muted-foreground">
                  New readings have arrived. Review again for an updated
                  interpretation.
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
                Continue in sleep mode <ArrowRight />
              </Link>
              {(recentReviews?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="sleep-review-history-trigger"
                  onClick={() => setHistoryOpen(true)}
                >
                  <span>
                    <strong>Past recommendations</strong>
                    <small>Revisit what Sleep Coach noticed before</small>
                  </span>
                  <ClockCounterClockwise size={18} aria-hidden="true" />
                </button>
              )}
            </section>
            {historyOpen && (
              <SleepReviewHistory
                onClose={() => setHistoryOpen(false)}
                onSelect={(reviewDate) => {
                  setDate(reviewDate);
                  setHistoryOpen(false);
                }}
              />
            )}
          </>
        )}
        {strainMode &&
          (data === undefined ? (
            <p role="status" className="mt-8">
              Reading your day…
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
                    {strain.band} · {strain.confidence} data confidence
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {date === today
                      ? "Today so far. Updates when readings sync."
                      : "Based on the recorded day."}{" "}
                    Higher means more demand.
                  </p>
                  {data?.strainBaseline !== null &&
                    data?.strainBaseline !== undefined && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Your recent typical day:{" "}
                        {Math.round(data.strainBaseline)}
                        /100.
                      </p>
                    )}
                </section>
                <section className="sleep-section">
                  <h2>Two sides of strain</h2>
                  {[
                    {
                      label: "Physiological strain",
                      score: strain.physiological,
                    },
                    { label: "Training load", score: strain.training },
                  ].map((p) => (
                    <div key={p.label} className="sleep-contributor">
                      <span>{p.label}</span>
                      <span>
                        {p.score ?? "Unavailable"}
                        {p.score !== null ? "/100" : ""}
                      </span>
                    </div>
                  ))}
                  {strain.parts.map((p) => (
                    <p key={p.key} className="text-sm text-muted-foreground">
                      {p.label}: {p.weight}% of available weight · approximately{" "}
                      {p.contribution} composite points.
                    </p>
                  ))}
                  <p className="mt-4 text-sm text-muted-foreground">
                    {strain.explanation}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    A OneRep estimate. Daily energy and steps cannot measure
                    mental stress or continuous cardiovascular strain.
                    Unrecorded training remains unknown.
                  </p>
                </section>
                <section className="sleep-section">
                  <h2>How training accumulated</h2>
                  {strain.workouts.length ? (
                    [...strain.workouts]
                      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
                      .map((w) => (
                        <div className="sleep-contributor" key={w.id}>
                          <span>{w.name}</span>
                          <span>{w.load} load units</span>
                          <p>
                            {w.startedAt
                              ? new Date(w.startedAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Time unavailable"}{" "}
                            · {Math.round(w.minutes)} min · {w.hardSets ?? 0}{" "}
                            hard sets
                            {w.estimated
                              ? " · estimated effort"
                              : " · recorded intensity"}
                          </p>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No workouts recorded for this day.
                    </p>
                  )}
                </section>
                <section className="sleep-section">
                  <h2>Strain meets recovery</h2>
                  <p>
                    {data?.recovery?.status === "unknown" || !data?.recovery
                      ? "More sleep, HRV, or resting-heart-rate history is needed to interpret recovery."
                      : data.recovery.status === "compromised"
                        ? "Recovery signals are below your usual pattern. Consider how you feel before adding more demand."
                        : (strain.score ?? 0) >= 70
                          ? "A demanding day with stable recovery signals. Leave room to recover and check how you feel tomorrow."
                          : "Demand is relatively light and recovery signals are stable. Your plan and how you feel can guide what comes next."}
                  </p>
                  <Link
                    className="mt-4 inline-block underline text-sm"
                    to="/health/recovery"
                  >
                    See recovery breakdown
                  </Link>
                </section>
              </>
            )
          ))}
        {data && (
          <>
            <section className="sleep-section">
              <h2>{strainMode ? "Recent strain" : "Recent nights"}</h2>
              {!strainMode && (
                <div
                  className="mb-3 flex gap-3 text-sm"
                  aria-label="Sleep trend"
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
                    ),
                  )}
                </div>
              )}
              <div className="sleep-history">
                {data.history.map((d) => (
                  <button
                    key={d.date}
                    aria-label={`${d.date}: ${trendValue(d) ?? "unavailable"} ${!strainMode && trend === "duration" ? "minutes" : "score"}`}
                    title={`${d.date}: ${trendValue(d) ?? "unavailable"}`}
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
                Select a day to explore it. Missing days are not zero scores.
              </p>
              <Link
                to={strainMode ? "/health/sleep" : "/health/strain"}
                className="mt-4 inline-flex items-center gap-2 text-sm underline"
              >
                {strainMode ? "See how you slept" : "Explore daily strain"}
                <ArrowRight />
              </Link>
            </section>
            {!strainMode && (
              <section className="sleep-section">
                <h2>Your sleep preferences</h2>
                <label className="flex items-center justify-between gap-4 text-sm">
                  Sleep goal
                  <select
                    aria-label="Sleep goal"
                    value={data.preferences.targetMinutes}
                    onChange={(e) =>
                      void savePreferences(
                        data.preferences.automaticReview,
                        Number(e.target.value),
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
                </label>
                <label className="mt-5 flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={data.preferences.automaticReview}
                    onChange={(e) =>
                      void savePreferences(
                        e.target.checked,
                        data.preferences.targetMinutes,
                      )
                    }
                  />
                  Automatic review after each night syncs
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Uses your AI allowance and existing AI processing settings.
                  Regular insights are always available.
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
  );
}
