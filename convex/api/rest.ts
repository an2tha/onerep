import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { RATE_LIMITED } from "../lib/rateLimits";
import { findTool, MCP_TOOLS, type ToolScope } from "../mcp/tools";
import { KEY_RATE_LIMITS, sha256Hex } from "../mcp/tokens";
import { RESOURCE_METADATA_URL } from "../mcp/oauthServer";

/**
 * The public REST API: JSON in, JSON out, one bearer key.
 *
 * Every route here is a thin renaming of a tool the MCP endpoint already
 * exposes. That is the whole design. A second implementation of "log a food
 * entry" would be a second place for the validation to drift, and the day the
 * two disagree is the day somebody's diary quietly fills with nonsense — so
 * the route table maps a method and a path onto a tool, and the tool does the
 * work it has always done. Nothing here can reach data the MCP surface could
 * not, and a DELETE needs a key minted with the delete scope.
 *
 * Scope, rate limit, revocation and ownership are all inherited from the key,
 * not reimplemented. If you are adding a capability, add a tool.
 */

const MAX_BODY_BYTES = 64 * 1024;

type RouteInput = {
  query: URLSearchParams;
  params: Record<string, string>;
  body: Record<string, unknown>;
};

type Route = {
  method: "GET" | "POST" | "DELETE";
  /** Segments starting with ":" capture into `params`. */
  path: string;
  /** The tool this route stands in for, or null for routes answered inline. */
  tool: string | null;
  summary: string;
  args?: (input: RouteInput) => Record<string, unknown>;
};

const ROUTES: Route[] = [
  {
    method: "GET",
    path: "/v1",
    tool: null,
    summary: "This route list, and what your key is allowed to do.",
  },
  {
    method: "GET",
    path: "/v1/me",
    tool: null,
    summary:
      "Your key's scopes and hourly budget. Use it to check a key works.",
  },
  {
    method: "GET",
    path: "/v1/goals",
    tool: "get_goals",
    summary: "Calorie and macro targets, water goal, weight unit, stated goal.",
    args: () => ({}),
  },
  {
    method: "GET",
    path: "/v1/insights",
    tool: "get_training_insights",
    summary:
      "Computed analysis: per-lift progression verdicts, measured recovery vs baseline, six monthly summaries. Optional ?date= anchors the windows.",
    args: ({ query }) => ({ date: query.get("date") ?? undefined }),
  },
  {
    method: "GET",
    path: "/v1/days",
    tool: "get_range",
    summary:
      "Per-day totals between ?start= and ?end=, inclusive. Both required.",
    args: ({ query }) => ({
      start: requiredQuery(query, "start"),
      end: requiredQuery(query, "end"),
    }),
  },
  {
    method: "GET",
    path: "/v1/days/:date",
    tool: "get_day",
    summary: "Everything logged on one YYYY-MM-DD.",
    args: ({ params }) => ({ date: params.date }),
  },
  {
    method: "GET",
    path: "/v1/workouts",
    tool: "list_workouts",
    summary: "Recent sessions, newest first. Optional ?limit= up to 50.",
    args: ({ query }) => optional({ limit: query.get("limit") }),
  },
  {
    method: "POST",
    path: "/v1/workouts",
    tool: "log_workout",
    summary: "Record a completed session.",
  },
  {
    method: "GET",
    path: "/v1/measurements",
    tool: "list_body_measurements",
    summary: "Recent weigh-ins and measurements. Optional ?limit= up to 100.",
    args: ({ query }) => optional({ limit: query.get("limit") }),
  },
  {
    method: "POST",
    path: "/v1/water",
    tool: "log_water",
    summary: "Add a drink to a day's water log.",
  },
  {
    method: "POST",
    path: "/v1/food",
    tool: "log_food",
    summary: "Add one entry to a day's food diary.",
  },
  {
    method: "POST",
    path: "/v1/weight",
    tool: "log_weight",
    summary: "Record body weight for a date, replacing that day's weigh-in.",
  },
  {
    method: "POST",
    path: "/v1/body-measurements",
    tool: "log_body_measurement",
    summary:
      "Write or correct any part of a day's check-in; omitted fields are left alone.",
  },
  {
    method: "POST",
    path: "/v1/rest-days",
    tool: "mark_rest_day",
    summary: "Mark dates as deliberate rest.",
  },
  {
    method: "DELETE",
    path: "/v1/rest-days",
    tool: "unmark_rest_days",
    summary: "Remove the rest marking from dates.",
  },
  {
    method: "GET",
    path: "/v1/health/days",
    tool: "get_health_days",
    summary:
      "Sleep, steps, resting heart rate, HRV and active energy per day between ?start= and ?end=, inclusive. Both required.",
    args: ({ query }) => ({
      start: requiredQuery(query, "start"),
      end: requiredQuery(query, "end"),
    }),
  },
  {
    method: "DELETE",
    path: "/v1/health/days/:date",
    tool: "delete_health_day",
    summary: "Clear the stored health readings for one date.",
    args: ({ params }) => ({ date: params.date }),
  },
  {
    method: "POST",
    path: "/v1/health/days/:date",
    tool: "set_health_metric",
    summary:
      "Correct one field of a day's readings and keep the sync off it. Body: {field, value}, value null to release it.",
    args: ({ params, body }) => ({ ...body, date: params.date }),
  },
  {
    method: "GET",
    path: "/v1/health/workouts",
    tool: "list_health_workouts",
    summary:
      "Sessions imported from Apple Health or Health Connect, newest first. Optional ?limit= up to 50.",
    args: ({ query }) => optional({ limit: query.get("limit") }),
  },
  {
    method: "POST",
    path: "/v1/health/workouts",
    tool: "log_health_workout",
    summary: "Record an activity session the phone cannot see.",
  },
  {
    method: "DELETE",
    path: "/v1/health/workouts/:id",
    tool: "delete_health_workout",
    summary: "Remove an imported health session.",
    args: ({ params }) => ({ id: params.id }),
  },
  {
    method: "DELETE",
    path: "/v1/food/:date/:entryId",
    tool: "delete_food_entry",
    summary: "Remove one entry from a day's food diary.",
    args: ({ params }) => ({ date: params.date, entryId: params.entryId }),
  },
  {
    method: "DELETE",
    path: "/v1/water/:date/:entryId",
    tool: "delete_water_entry",
    summary: "Remove one drink from a day's water log.",
    args: ({ params }) => ({ date: params.date, entryId: params.entryId }),
  },
  {
    method: "DELETE",
    path: "/v1/workouts/:date/:sessionId",
    tool: "delete_workout",
    summary: "Remove a logged training session.",
    args: ({ params }) => ({
      date: params.date,
      sessionId: params.sessionId,
    }),
  },
  {
    method: "GET",
    path: "/v1/custom-metrics",
    tool: "list_custom_metrics",
    summary:
      "The user's own tracked metrics and their recent values. Optional ?tab= and ?days=.",
    args: ({ query }) =>
      optional({ tab: query.get("tab"), days: query.get("days") }),
  },
  {
    method: "POST",
    path: "/v1/custom-metrics",
    tool: "create_custom_metric",
    summary: "Define a new custom metric, optionally bound to a health signal.",
  },
  {
    method: "POST",
    path: "/v1/custom-metrics/:metricId",
    tool: "update_custom_metric",
    summary:
      "Change a metric definition without losing its history; null clears target or healthMetricKey.",
    args: ({ params, body }) => ({ ...body, metricId: params.metricId }),
  },
  {
    method: "DELETE",
    path: "/v1/custom-metrics/:metricId",
    tool: "delete_custom_metric",
    summary: "Remove a metric, its values and any widget built on it.",
    args: ({ params }) => ({ metricId: params.metricId }),
  },
  {
    method: "POST",
    path: "/v1/custom-metrics/:metricId/values",
    tool: "set_custom_metric_value",
    summary:
      "Set one metric's value for a date. Body: {date, value}, value null to clear the day.",
    args: ({ params, body }) => ({ ...body, metricId: params.metricId }),
  },
  {
    method: "GET",
    path: "/v1/health/metrics",
    tool: "list_platform_metrics",
    summary:
      "The Apple Health and Health Connect catalogue a custom metric can bind to. Optional ?group= and ?all=true.",
    args: ({ query }) =>
      optional({ group: query.get("group"), all: query.get("all") }),
  },
  {
    method: "DELETE",
    path: "/v1/measurements/:id",
    tool: "delete_body_measurement",
    summary: "Remove one weigh-in or measurement.",
    args: ({ params }) => ({ id: params.id }),
  },
];

/** A missing required query parameter reads better as a 400 than as "today". */
class BadRequest extends Error {}

function requiredQuery(query: URLSearchParams, name: string) {
  const value = query.get(name);
  if (!value) throw new BadRequest(`Missing required query parameter: ${name}`);
  return value;
}

/** Drops keys the caller did not send, so the tool's own defaults still apply. */
function optional(values: Record<string, string | null>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null),
  ) as Record<string, unknown>;
}

function matchPath(pattern: string, pathname: string) {
  const want = pattern.split("/").filter(Boolean);
  const got = pathname.split("/").filter(Boolean);
  if (want.length !== got.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < want.length; index++) {
    const segment = want[index];
    if (segment.startsWith(":")) {
      // `%` on its own is not a route, it is a typo. Decoding it throws, and
      // an uncaught throw here would escape the handler and answer with
      // something other than the one error shape this API promises.
      try {
        params[segment.slice(1)] = decodeURIComponent(got[index]);
      } catch {
        return null;
      }
      continue;
    }
    if (segment !== got[index]) return null;
  }
  return params;
}

function headers() {
  return new Headers({
    "Content-Type": "application/json",
    // The key authorizes the call, not the origin — there is no cookie here to
    // ride along on somebody else's session.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    // Somebody's food diary has no business sitting in a proxy cache.
    "Cache-Control": "no-store",
  });
}

function json(payload: unknown, status = 200, extra?: Record<string, string>) {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: headers(),
  });
  for (const [name, value] of Object.entries(extra ?? {})) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * One error shape for every failure: a stable `code` to branch on and a
 * `message` written for the human reading the log at 2am. Never a stack —
 * those are for us, not for whoever pointed a script at this.
 */
function fail(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, string>,
) {
  return json({ error: { code, message } }, status, extra);
}

function bearerKey(request: Request) {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Seconds until the current fixed window rolls over. */
function retryAfterSeconds() {
  const remaining =
    KEY_RATE_LIMITS.windowMs - (Date.now() % KEY_RATE_LIMITS.windowMs);
  return Math.max(1, Math.ceil(remaining / 1000));
}

function unauthorized(message: string) {
  return fail(401, "unauthorized", message, {
    "WWW-Authenticate": `Bearer realm="OneRep", error="invalid_token", resource_metadata="${RESOURCE_METADATA_URL}"`,
  });
}

function routeIndex(scopes: ToolScope[]) {
  return ROUTES.filter((route) => {
    const tool = route.tool ? findTool(route.tool) : null;
    return tool === null || scopes.includes(tool.scope);
  }).map((route) => ({
    method: route.method,
    path: route.path,
    summary: route.summary,
  }));
}

export const restApi = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headers() });
  }

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/v1";

  // Authorize before resolving the route, so an unauthenticated caller never
  // makes this endpoint do work on its behalf.
  const presented = bearerKey(request);
  if (!presented) {
    return unauthorized(
      "Missing bearer key. Create one in OneRep → Settings → API & MCP.",
    );
  }

  const key = await ctx.runQuery(internal.mcp.tokens.resolve, {
    tokenHash: await sha256Hex(presented),
  });
  if (!key) {
    return unauthorized("That key is not valid, or has been revoked.");
  }
  const scopes = key.scopes as ToolScope[];

  const matched: Array<{ route: Route; params: Record<string, string> }> = [];
  for (const candidate of ROUTES) {
    const params = matchPath(candidate.path, pathname);
    if (params) matched.push({ route: candidate, params });
  }

  if (matched.length === 0) {
    return fail(
      404,
      "not_found",
      `No route for ${pathname}. GET /v1 lists what there is.`,
    );
  }

  const hit = matched.find((entry) => entry.route.method === request.method);
  if (!hit) {
    const allowed = [...new Set(matched.map((entry) => entry.route.method))];
    return fail(
      405,
      "method_not_allowed",
      `${request.method} is not allowed on ${pathname}. Try ${allowed.join(" or ")}.`,
      { Allow: [...allowed, "OPTIONS"].join(", ") },
    );
  }

  const { route, params } = hit;
  const tool = route.tool ? findTool(route.tool) : null;
  const scope: ToolScope = tool?.scope ?? "read";

  if (tool && !scopes.includes(scope)) {
    return fail(
      403,
      "insufficient_scope",
      `This key has ${scopes.join(" and ")} access, and ${route.method} ${route.path} needs ${scope}.`,
    );
  }

  let body: Record<string, unknown> = {};
  if (request.method === "POST" || request.method === "DELETE") {
    const declared = Number(request.headers.get("Content-Length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return fail(413, "payload_too_large", "That body is over 64 KB.");
    }

    const contentType = request.headers.get("Content-Type") ?? "";
    // A DELETE that names its target in the path has nothing to send, and
    // demanding a Content-Type header for an empty body is rude.
    const bodyExpected =
      request.method === "POST" || (declared > 0 && contentType !== "");
    if (
      bodyExpected &&
      !contentType.toLowerCase().includes("application/json")
    ) {
      return fail(
        415,
        "unsupported_media_type",
        "Send application/json. Nothing else is parsed.",
      );
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return fail(413, "payload_too_large", "That body is over 64 KB.");
    }

    let parsed: unknown;
    try {
      parsed = raw.trim() === "" ? {} : JSON.parse(raw);
    } catch {
      return fail(400, "invalid_json", "That body is not JSON.");
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return fail(400, "invalid_request", "The body must be a JSON object.");
    }
    body = parsed as Record<string, unknown>;

    // A misspelt `protien` that silently logs zero grams is worse than a 400.
    // The tool schemas already declare what they accept, so hold callers to it
    // rather than shrugging at fields nobody will read.
    const known = new Set(Object.keys(tool?.inputSchema.properties ?? {}));
    const unknown = Object.keys(body).filter((name) => !known.has(name));
    if (unknown.length > 0) {
      return fail(
        400,
        "unknown_field",
        `Not a field on this route: ${unknown.join(", ")}. Accepted: ${[...known].join(", ") || "none"}.`,
      );
    }
  }

  // Metered before the work, and on every route including /v1 and /v1/me, so
  // there is nothing here to probe for free.
  try {
    await ctx.runMutation(internal.mcp.tokens.touch, {
      id: key.id,
      scope,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes(RATE_LIMITED)) {
      return fail(
        429,
        "rate_limited",
        `This key has used its ${scope} budget for the hour (${KEY_RATE_LIMITS[scope]} calls). Try later.`,
        { "Retry-After": String(retryAfterSeconds()) },
      );
    }
    return unauthorized("That key is not valid, or has been revoked.");
  }

  if (tool === null) {
    return json(
      pathname === "/v1/me"
        ? {
            scopes,
            limits: {
              readPerHour: KEY_RATE_LIMITS.read,
              writePerHour: KEY_RATE_LIMITS.write,
              deletePerHour: KEY_RATE_LIMITS.delete,
            },
          }
        : { routes: routeIndex(scopes) },
    );
  }

  let args: Record<string, unknown>;
  try {
    args = route.args
      ? route.args({ query: url.searchParams, params, body })
      : body;
  } catch (error) {
    return fail(
      400,
      "invalid_request",
      error instanceof Error ? error.message : "Bad request",
    );
  }

  try {
    return json(await tool.run(ctx, key.userId, args));
  } catch (error) {
    // The tools' messages are written to be acted on ("use YYYY-MM-DD"), which
    // is worth more than a generic 400 and a shrug.
    return fail(
      400,
      "invalid_request",
      error instanceof Error ? error.message : "That call failed.",
    );
  }
});

/** Exported for the docs test, which checks every route is written down. */
export const API_ROUTES = ROUTES.map((route) => ({
  method: route.method,
  path: route.path,
  scope: (route.tool ? findTool(route.tool)?.scope : null) ?? null,
}));

/** Every tool must be reachable over REST, or the API is quietly the lesser door. */
export const UNROUTED_TOOLS = MCP_TOOLS.filter(
  (tool) => !ROUTES.some((route) => route.tool === tool.name),
).map((tool) => tool.name);
