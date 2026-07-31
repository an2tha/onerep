import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { Incident, Sample, TargetSnapshot, TargetState } from "./monitor.ts";

const REFRESH_MS = 15_000;

type StatusPayload = {
  generatedAt: number;
  pollIntervalMs: number;
  windowMs: number;
  targets: TargetSnapshot[];
  incidents: Incident[];
};

const STATE_META: Record<TargetState, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  up: { label: "Operational", color: "var(--up)", Icon: CheckCircle2 },
  degraded: { label: "Degraded", color: "var(--degraded)", Icon: AlertTriangle },
  down: { label: "Down", color: "var(--down)", Icon: XCircle },
  unknown: { label: "No data yet", color: "var(--unknown)", Icon: CircleHelp },
};

function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function Sparkline({ samples }: { samples: Sample[] }) {
  const width = 280;
  const height = 48;
  const points = samples.filter((s) => s.latencyMs !== null);

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height, color: "var(--faint)" }}
      >
        Collecting latency data…
      </div>
    );
  }

  const t0 = samples[0]!.timestamp;
  const t1 = samples[samples.length - 1]!.timestamp;
  const span = Math.max(1, t1 - t0);
  const max = Math.max(...points.map((p) => p.latencyMs!));
  const x = (t: number) => ((t - t0) / span) * (width - 4) + 2;
  const y = (ms: number) => height - 6 - (ms / max) * (height - 12);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.timestamp).toFixed(1)},${y(p.latencyMs!).toFixed(1)}`)
    .join(" ");
  const failures = samples.filter((s) => !s.ok);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Latency over the window, currently up to ${max} milliseconds`}
      >
        <path d={path} fill="none" stroke="var(--series)" strokeWidth="2" strokeLinejoin="round" />
        {failures.map((f) => (
          <line
            key={f.timestamp}
            x1={x(f.timestamp)}
            x2={x(f.timestamp)}
            y1={4}
            y2={height - 4}
            stroke="var(--down)"
            strokeWidth="2"
            opacity="0.7"
          >
            <title>{`Check failed ${timeAgo(f.timestamp)}${f.detail ? `: ${f.detail}` : ""}`}</title>
          </line>
        ))}
      </svg>
      <figcaption className="flex justify-between text-[11px]" style={{ color: "var(--faint)" }}>
        <span>{timeAgo(t0)}</span>
        <span className="tabular">peak {max.toLocaleString()} ms</span>
      </figcaption>
    </figure>
  );
}

function TargetCard({ target, samples }: { target: TargetSnapshot; samples: Sample[] }) {
  const meta = STATE_META[target.state];
  return (
    <article className="panel p-4 flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold m-0">{target.label}</h2>
          <p className="text-xs m-0 mt-0.5 break-all" style={{ color: "var(--faint)" }}>
            {target.description}
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 text-xs font-medium shrink-0"
          style={{ color: meta.color }}
        >
          <meta.Icon size={14} aria-hidden="true" />
          {meta.label}
        </span>
      </header>

      <dl className="grid grid-cols-3 gap-2 m-0 text-xs">
        <div>
          <dt style={{ color: "var(--faint)" }}>Latency</dt>
          <dd className="m-0 tabular text-sm">
            {target.latencyMs !== null ? `${target.latencyMs.toLocaleString()} ms` : "—"}
          </dd>
        </div>
        <div>
          <dt style={{ color: "var(--faint)" }}>Uptime (24h)</dt>
          <dd className="m-0 tabular text-sm">
            {target.uptimePct !== null ? `${target.uptimePct}%` : "—"}
          </dd>
        </div>
        <div>
          <dt style={{ color: "var(--faint)" }}>Last check</dt>
          <dd className="m-0 text-sm">
            {target.lastCheckedAt ? timeAgo(target.lastCheckedAt) : "—"}
          </dd>
        </div>
      </dl>

      <Sparkline samples={samples} />

      {target.meta && Object.keys(target.meta).length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
          {Object.entries(target.meta).map(([key, value]) => (
            <li key={key}>
              <span style={{ color: "var(--faint)" }}>{key}: </span>
              {value}
            </li>
          ))}
        </ul>
      )}

      {target.lastError && (
        <p className="m-0 text-xs" style={{ color: "var(--down)" }}>
          Last error {timeAgo(target.lastError.at)}: {target.lastError.message}
        </p>
      )}
    </article>
  );
}

export function App() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [histories, setHistories] = useState<Record<string, Sample[]>>({});
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      setRefreshing(true);
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as StatusPayload;
        const entries = await Promise.all(
          payload.targets.map(async (t) => {
            const r = await fetch(`/api/history?target=${encodeURIComponent(t.id)}`);
            const body = r.ok ? ((await r.json()) as { samples: Sample[] }) : { samples: [] };
            return [t.id, body.samples] as const;
          }),
        );
        if (!cancelled) {
          setStatus(payload);
          setHistories(Object.fromEntries(entries));
          setFetchedAt(Date.now());
        }
      } catch {
        // keep the last good snapshot; the refresh indicator shows staleness
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const targets = status?.targets ?? [];
  const allUp = targets.length > 0 && targets.every((t) => t.state === "up");
  const anyDown = targets.some((t) => t.state === "down");
  const summary =
    targets.length === 0
      ? "Waiting for first checks…"
      : allUp
        ? "All systems operational"
        : anyDown
          ? "Some systems are down"
          : "Some systems are degraded";
  const summaryColor = allUp ? "var(--up)" : anyDown ? "var(--down)" : "var(--degraded)";

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Activity size={22} aria-hidden="true" style={{ color: "var(--series)" }} />
          <div>
            <h1 className="text-lg font-semibold m-0">OneRep Status</h1>
            <p aria-live="polite" className="m-0 text-sm font-medium" style={{ color: targets.length ? summaryColor : "var(--faint)" }}>
              {summary}
            </p>
          </div>
        </div>
        <p className="m-0 flex items-center gap-1.5 text-xs" style={{ color: "var(--faint)" }}>
          <RefreshCw
            size={12}
            aria-hidden="true"
            className={refreshing ? "animate-spin" : ""}
          />
          {fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : "Loading…"} · auto-refresh every {REFRESH_MS / 1000}s
        </p>
      </header>

      {targets.length === 0 ? (
        <section className="panel p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
          No data yet. The server polls each target every{" "}
          {status ? Math.round(status.pollIntervalMs / 1000) : 30}s — the first samples will appear shortly.
        </section>
      ) : (
        <section aria-label="Service status" className="grid gap-4 sm:grid-cols-2">
          {targets.map((target) => (
            <TargetCard key={target.id} target={target} samples={histories[target.id] ?? []} />
          ))}
        </section>
      )}

      <section aria-label="Recent incidents" className="panel p-4">
        <h2 className="text-sm font-semibold m-0 mb-3">Recent state changes (24h)</h2>
        {!status || status.incidents.length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--faint)" }}>
            No state changes recorded in the current window.
          </p>
        ) : (
          <ol className="m-0 p-0 list-none flex flex-col gap-2">
            {status.incidents.map((incident) => {
              const to = STATE_META[incident.to];
              const from = STATE_META[incident.from];
              return (
                <li
                  key={`${incident.target}-${incident.at}`}
                  className="flex items-center gap-2 text-xs flex-wrap"
                  style={{ color: "var(--muted)" }}
                >
                  <to.Icon size={13} aria-hidden="true" style={{ color: to.color }} />
                  <span className="font-medium" style={{ color: "var(--ink)" }}>
                    {incident.label}
                  </span>
                  <span>{from.label}</span>
                  <ArrowRight size={11} aria-hidden="true" />
                  <span style={{ color: to.color }}>{to.label}</span>
                  <span style={{ color: "var(--faint)" }}>· {timeAgo(incident.at)}</span>
                  {incident.detail && <span style={{ color: "var(--faint)" }}>· {incident.detail}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <footer className="text-[11px]" style={{ color: "var(--faint)" }}>
        Probes run server-side; tokens never reach the browser. Window: last 24h.
      </footer>
    </main>
  );
}
