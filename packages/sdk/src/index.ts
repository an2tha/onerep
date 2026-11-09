import { operations, type Inputs } from "./operations.js";
export { operations, type Inputs };

export const productionOrigin = "https://chatty-panda-144.convex.site";
export type Scope = "read" | "write";
export type Tokens = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  scope: string;
  expires_in: number;
};
export type Authorization = { state: string; verifier: string };
type Options = { origin?: string; fetch?: typeof fetch };
type OAuthOptions = Options & {
  clientId: string;
  redirectUri: string;
  clientSecret?: string;
};

function originOf(options: Options) {
  const url = new URL(options.origin ?? productionOrigin);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  ) {
    throw new Error("OneRep connections require HTTPS or a loopback server.");
  }
  return url.origin;
}

export class OneRepError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "OneRepError";
  }
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new OneRepError(
      response.status,
      data?.error?.code ?? data?.error ?? "http_error",
      data?.error?.message ??
        data?.error_description ??
        `OneRep returned HTTP ${response.status}`,
      response.headers.get("Retry-After"),
    );
  }
  return data;
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export class OneRepOAuth {
  constructor(private readonly options: OAuthOptions) {}

  async authorize(scopes: readonly Scope[] = ["read"]) {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier),
    );
    const url = new URL("/oauth/authorize", originOf(this.options));
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      scope: scopes.join(" "),
      code_challenge_method: "S256",
      code_challenge: base64url(new Uint8Array(digest)),
      state,
    }).toString();
    return { url: url.toString(), transaction: { verifier, state } };
  }

  private async post(path: string, fields: Record<string, string>) {
    const body = new URLSearchParams({
      ...fields,
      client_id: this.options.clientId,
    });
    if (this.options.clientSecret)
      body.set("client_secret", this.options.clientSecret);
    const response = await (this.options.fetch ?? fetch)(
      new URL(path, originOf(this.options)),
      {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        body,
      },
    );
    return readResponse(response);
  }

  async exchange(
    callbackUrl: string,
    transaction: Authorization,
  ): Promise<Tokens> {
    const callback = new URL(callbackUrl);
    const expected = new URL(this.options.redirectUri);
    const fixedQueryMatches = [...new Set(expected.searchParams.keys())].every(
      (name) => {
        const registered = expected.searchParams.getAll(name);
        const returned = callback.searchParams.getAll(name);
        return (
          registered.length === returned.length &&
          registered.every((value, i) => value === returned[i])
        );
      },
    );
    if (
      callback.protocol !== expected.protocol ||
      callback.host !== expected.host ||
      callback.pathname !== expected.pathname ||
      !fixedQueryMatches ||
      !transaction.state ||
      callback.searchParams.getAll("state").length !== 1 ||
      callback.searchParams.get("state") !== transaction.state
    ) {
      throw new OneRepError(
        400,
        "invalid_callback",
        "Callback or OAuth state does not match this sign-in.",
      );
    }
    const error = callback.searchParams.get("error");
    if (error)
      throw new OneRepError(
        400,
        error,
        callback.searchParams.get("error_description") ?? error,
      );
    const code = callback.searchParams.get("code");
    if (!code)
      throw new OneRepError(
        400,
        "missing_code",
        "The callback has no authorization code.",
      );
    return this.post("/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: this.options.redirectUri,
      code_verifier: transaction.verifier,
    });
  }

  refresh(refreshToken: string): Promise<Tokens> {
    return this.post("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  async revoke(token: string): Promise<void> {
    await this.post("/oauth/revoke", { token });
  }
}

type Json = null | boolean | string | number | Json[] | { [key: string]: Json };
type LibraryRead =
  | "list_routines"
  | "list_schedules"
  | "list_saved_meals"
  | "list_custom_foods"
  | "list_meal_prep"
  | "list_fasts"
  | "list_grocery_lists"
  | "list_supplements"
  | "list_trails";
type DataRow = Record<string, Json>;
interface Results extends Record<
  LibraryRead,
  { items: Array<DataRow & { id: string }>; nextCursor: string | null }
> {
  search_exercises: Array<
    DataRow & { id: string; name: string; category: string; muscle: string }
  >;
  list_programmes: {
    guided: Array<DataRow & { id: string; status: string }>;
    nutrition: Array<DataRow & { id: string; goal: string }>;
  };
  list_recipes: {
    recipes: Array<DataRow & { id: string; servings: number }>;
    nextCursor: string | null;
  };
  list_body_measurements: Array<
    DataRow & { id: string; date: string; weightKg: number | null }
  >;
  list_health_workouts: Array<
    DataRow & { id: string; date: string; durationMinutes: number }
  >;
  list_custom_metrics: Array<DataRow & { id: string; title: string }>;
  list_platform_metrics: Array<DataRow & { key: string; label: string }>;
  get_health_days: {
    start: string;
    end: string;
    days: Array<DataRow & { date: string }>;
  };
  get_day: {
    date: string;
    workouts: Results["list_workouts"];
    waterMl: number;
    waterEntries: Array<{ id: string; amountMl: number }>;
    nutrition: DataRow;
    restDay: boolean;
  };
  get_range: {
    start: string;
    end: string;
    workouts: Results["list_workouts"];
    nutrition: Array<DataRow & { date: string }>;
    restDays: string[];
  };
  log_workout: {
    ok: boolean;
    date: string;
    sessionId: string;
    exercises: number;
  };
  list_workouts: Array<{
    date: string;
    sessionId: string | null;
    durationMinutes: number;
    exercises: Array<{
      name: string;
      sets: number;
      reps: number[];
      weightKg: number[];
    }>;
  }>;
  log_water: { ok: boolean; amountMl: number; date: string; entryId: string };
  log_food: { ok: boolean; logged: string; date: string; entryId: string };
  log_weight: { ok: boolean; weightKg: number; date: string };
  get_access: {
    subject?: string;
    scopes: string[];
    limits: {
      readPerHour: number;
      writePerHour: number;
      deletePerHour: number;
    };
  };
  list_routes: {
    routes: Array<{ method: string; path: string; summary: string }>;
  };
  get_goals: {
    customGoals: Json;
    waterGoalMl: number | null;
    weightUnit: string;
    goal: string | null;
  };
}

export class OneRep {
  constructor(private readonly options: Options & { accessToken: string }) {}

  async call<K extends keyof Inputs>(
    operation: K,
    ...args: {} extends Inputs[K] ? [input?: Inputs[K]] : [input: Inputs[K]]
  ): Promise<K extends keyof Results ? Results[K] : Json> {
    const route = operations.find((entry) => entry.operation === operation);
    if (!route) throw new Error("Unknown OneRep operation");
    const fields: Record<string, unknown> = { ...args[0] };
    const path = route.path.replace(/:(\w+)/g, (_, key: string) => {
      const value = fields[key];
      delete fields[key];
      if (
        typeof value !== "string" ||
        !value ||
        value === "." ||
        value === ".."
      )
        throw new Error(`Invalid path parameter: ${key}`);
      return encodeURIComponent(value);
    });
    const url = new URL(path, originOf(this.options));
    const headers = new Headers({
      Authorization: `Bearer ${this.options.accessToken}`,
    });
    let body: string | undefined;
    if (route.method === "GET") {
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    } else if (route.method === "POST" || Object.keys(fields).length) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(fields);
    }
    return readResponse(
      await (this.options.fetch ?? fetch)(url, {
        method: route.method,
        headers,
        body,
        credentials: "omit",
        redirect: "error",
      }),
    );
  }
}
