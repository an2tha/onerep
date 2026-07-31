// Server-side probing + in-memory history for the observability dashboard.
// All probes run here so tokens never reach the browser and CORS never applies.

export type Sample = {
  timestamp: number;
  ok: boolean;
  latencyMs: number | null;
  status: number | null;
  detail: string | null;
};

export type TargetState = "up" | "degraded" | "down" | "unknown";

export type TargetSnapshot = {
  id: string;
  label: string;
  description: string;
  state: TargetState;
  latencyMs: number | null;
  uptimePct: number | null;
  sampleCount: number;
  lastCheckedAt: number | null;
  lastError: { message: string; at: number } | null;
  meta: Record<string, string> | null;
};

export type Incident = {
  target: string;
  label: string;
  at: number;
  from: TargetState;
  to: TargetState;
  detail: string | null;
};

const POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.POLL_INTERVAL_MS) || 30_000);
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SAMPLES = Math.ceil(WINDOW_MS / POLL_INTERVAL_MS);
const DEGRADED_MS = Number(process.env.DEGRADED_LATENCY_MS) || 2_000;
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS) || 10_000;

const DATASOURCE_URL = process.env.DATASOURCE_URL ?? "http://192.168.50.53:8790";
const DATASOURCE_TOKEN = process.env.DATASOURCE_TOKEN ?? "";
const CONVEX_URL = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "";
const WEB_URL = process.env.WEB_URL ?? "https://onerep.life";
const APP_URL = process.env.APP_URL ?? "https://app.onerep.life";

type ProbeResult = Omit<Sample, "timestamp"> & { meta?: Record<string, string> };

type Target = {
  id: string;
  label: string;
  description: string;
  probe: () => Promise<ProbeResult>;
};

async function timedFetch(
  url: string,
  init?: RequestInit,
): Promise<{ res: Response | null; latencyMs: number; error: string | null }> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: "follow",
    });
    return { res, latencyMs: Math.round(performance.now() - start), error: null };
  } catch (error) {
    return {
      res: null,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function httpProbe(url: string): () => Promise<ProbeResult> {
  return async () => {
    const { res, latencyMs, error } = await timedFetch(url, { method: "GET" });
    if (!res) return { ok: false, latencyMs: null, status: null, detail: error };
    return {
      ok: res.ok,
      latencyMs,
      status: res.status,
      detail: res.ok ? null : `HTTP ${res.status}`,
    };
  };
}

async function probeDatasource(): Promise<ProbeResult> {
  const { res, latencyMs, error } = await timedFetch(`${DATASOURCE_URL}/health`);
  if (!res) return { ok: false, latencyMs: null, status: null, detail: error };
  if (!res.ok) return { ok: false, latencyMs, status: res.status, detail: `HTTP ${res.status}` };

  const meta: Record<string, string> = {};
  try {
    const health = (await res.json()) as { uptimeSeconds?: number };
    if (typeof health.uptimeSeconds === "number") {
      meta["service uptime"] = formatDuration(health.uptimeSeconds);
    }
  } catch {
    // health body is informational only
  }

  // Enrich with /v1/stats when a token is configured; failure here does not
  // flip the target down — /health already answered.
  if (DATASOURCE_TOKEN) {
    const stats = await timedFetch(`${DATASOURCE_URL}/v1/stats`, {
      headers: { Authorization: `Bearer ${DATASOURCE_TOKEN}` },
    });
    if (stats.res?.ok) {
      try {
        const body = (await stats.res.json()) as {
          sources?: Record<string, { imported?: boolean } & Record<string, unknown>>;
        };
        for (const [name, source] of Object.entries(body.sources ?? {})) {
          meta[name] = source.imported ? "imported" : "not imported";
        }
      } catch {
        // ignore malformed stats
      }
    } else {
      meta["stats"] = stats.error ?? `HTTP ${stats.res?.status}`;
    }
  }

  return { ok: true, latencyMs, status: res.status, detail: null, meta };
}

async function probeConvex(): Promise<ProbeResult> {
  if (!CONVEX_URL) {
    return { ok: false, latencyMs: null, status: null, detail: "CONVEX_URL not configured" };
  }
  const { res, latencyMs, error } = await timedFetch(CONVEX_URL);
  if (!res) return { ok: false, latencyMs: null, status: null, detail: error };
  // Any HTTP answer means the deployment is reachable; the root path is not a
  // real route, so 404 still counts as up.
  const reachable = res.status < 500;
  return {
    ok: reachable,
    latencyMs,
    status: res.status,
    detail: reachable ? null : `HTTP ${res.status}`,
  };
}

function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const targets: Target[] = [
  {
    id: "datasource",
    label: "Datasource",
    description: `Nutrition/exercise data service (${DATASOURCE_URL})`,
    probe: probeDatasource,
  },
  {
    id: "convex",
    label: "Convex backend",
    description: CONVEX_URL ? `Convex deployment (${CONVEX_URL})` : "Convex deployment (unconfigured)",
    probe: probeConvex,
  },
  {
    id: "web",
    label: "Marketing site",
    description: WEB_URL,
    probe: httpProbe(WEB_URL),
  },
  {
    id: "app",
    label: "Web app (PWA)",
    description: APP_URL,
    probe: httpProbe(APP_URL),
  },
];

const history = new Map<string, Sample[]>(targets.map((t) => [t.id, []]));
const latestMeta = new Map<string, Record<string, string>>();

function stateOf(sample: Sample | undefined): TargetState {
  if (!sample) return "unknown";
  if (!sample.ok) return "down";
  if (sample.latencyMs !== null && sample.latencyMs > DEGRADED_MS) return "degraded";
  return "up";
}

async function pollTarget(target: Target): Promise<void> {
  let result: ProbeResult;
  try {
    result = await target.probe();
  } catch (error) {
    result = {
      ok: false,
      latencyMs: null,
      status: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const { meta, ...rest } = result;
  if (meta) latestMeta.set(target.id, meta);
  const buffer = history.get(target.id)!;
  buffer.push({ timestamp: Date.now(), ...rest });
  if (buffer.length > MAX_SAMPLES) buffer.splice(0, buffer.length - MAX_SAMPLES);
}

async function pollAll(): Promise<void> {
  await Promise.all(targets.map(pollTarget));
}

export function startPolling(): void {
  void pollAll();
  setInterval(() => void pollAll(), POLL_INTERVAL_MS);
}

export function getSnapshot(): {
  generatedAt: number;
  pollIntervalMs: number;
  windowMs: number;
  targets: TargetSnapshot[];
  incidents: Incident[];
} {
  const cutoff = Date.now() - WINDOW_MS;
  const snapshots: TargetSnapshot[] = targets.map((target) => {
    const samples = (history.get(target.id) ?? []).filter((s) => s.timestamp >= cutoff);
    const latest = samples[samples.length - 1];
    const okCount = samples.filter((s) => s.ok).length;
    const lastFailure = [...samples].reverse().find((s) => !s.ok && s.detail);
    return {
      id: target.id,
      label: target.label,
      description: target.description,
      state: stateOf(latest),
      latencyMs: latest?.latencyMs ?? null,
      uptimePct: samples.length > 0 ? Math.round((okCount / samples.length) * 1000) / 10 : null,
      sampleCount: samples.length,
      lastCheckedAt: latest?.timestamp ?? null,
      lastError: lastFailure ? { message: lastFailure.detail!, at: lastFailure.timestamp } : null,
      meta: latestMeta.get(target.id) ?? null,
    };
  });

  const incidents: Incident[] = [];
  for (const target of targets) {
    const samples = (history.get(target.id) ?? []).filter((s) => s.timestamp >= cutoff);
    for (let i = 1; i < samples.length; i++) {
      const from = stateOf(samples[i - 1]);
      const to = stateOf(samples[i]);
      if (from !== to) {
        incidents.push({
          target: target.id,
          label: target.label,
          at: samples[i]!.timestamp,
          from,
          to,
          detail: samples[i]!.detail,
        });
      }
    }
  }
  incidents.sort((a, b) => b.at - a.at);

  return {
    generatedAt: Date.now(),
    pollIntervalMs: POLL_INTERVAL_MS,
    windowMs: WINDOW_MS,
    targets: snapshots,
    incidents: incidents.slice(0, 50),
  };
}

export function getHistory(targetId: string): Sample[] | null {
  if (!history.has(targetId)) return null;
  const cutoff = Date.now() - WINDOW_MS;
  return history.get(targetId)!.filter((s) => s.timestamp >= cutoff);
}

export function knownTargets(): string[] {
  return targets.map((t) => t.id);
}
