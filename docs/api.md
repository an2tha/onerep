# The OneRep API

Your training and nutrition log, over HTTP, for whatever you want to point at
it — a shortcut, a scale that talks to the internet, a spreadsheet you refuse to
give up, a script that logs the same lunch every Tuesday.

- **Base URL:** `https://<your-convex-deployment>.convex.site/v1`
- **Auth:** a bearer key you create in the app
- **Format:** JSON in, JSON out. Nothing else is parsed.

The exact base URL for your deployment is printed in the app under
**Settings → API & MCP**, underneath the button that mints the key. Copy it from
there rather than assembling it by hand.

Everything here is also available over the [Model Context Protocol](./mcp.md),
on the same keys, for assistants that speak it. Same scopes, same limits, same
data — one credential, two doors.

## Getting a key

1. Open OneRep → **Settings → API & MCP**.
2. Name it after where it will live, so future you knows what you are revoking.
3. Choose **Read only** or **Read & write**.
4. Copy the key. It is shown once and never again — only a SHA-256 hash of it is
   stored, so a key you lose is a key you replace.

Keys look like `onerep_sk_…`. Revoking is done from the same screen and takes
effect on the next request. Ten live keys per account is the ceiling.

**Read-only means read-only.** The scope is checked on every request before any
work happens, so a read-only key cannot be argued into writing: `GET` routes
answer, `POST` routes come back `403`.

## Making a request

```sh
curl -s https://<deployment>.convex.site/v1/days/2026-04-15 \
  -H "Authorization: Bearer onerep_sk_…" | jq
```

```sh
curl -s https://<deployment>.convex.site/v1/water \
  -H "Authorization: Bearer onerep_sk_…" \
  -H "Content-Type: application/json" \
  -d '{"amountMl": 500}' | jq
```

To check a key is alive without touching anything:

```sh
curl -s https://<deployment>.convex.site/v1/me \
  -H "Authorization: Bearer onerep_sk_…" | jq
# { "scopes": ["read"], "limits": { "readPerHour": 600, "writePerHour": 60 } }
```

`GET /v1` returns the route list filtered to what your key may actually call,
which is a faster answer than this page when you are halfway through writing
something.

## Routes

Dates are `YYYY-MM-DD` and default to today in **UTC**. If you know the user's
timezone, pass the date rather than trusting that default near midnight.

### Read (scope: `read`)

| Route                  | What it answers                                                         |
| ---------------------- | ----------------------------------------------------------------------- |
| `GET /v1`              | The route list, filtered to this key's scopes.                          |
| `GET /v1/me`           | This key's scopes and hourly budget.                                    |
| `GET /v1/goals`        | Calorie and macro targets, water goal, weight unit, stated goal.        |
| `GET /v1/insights`     | Computed analysis: progression verdicts per lift, recovery vs baseline, six monthly summaries. Optional `?date=` anchors the windows. |
| `GET /v1/days/{date}`  | Everything logged on one date.                                          |
| `GET /v1/days`         | Per-day totals between `?start=` and `?end=`, inclusive. Both required. |
| `GET /v1/workouts`     | Recent sessions, newest first. Optional `?limit=` up to 50.             |
| `GET /v1/measurements` | Recent weigh-ins and measurements. Optional `?limit=` up to 100.        |

Use `GET /v1/days?start=…&end=…` for weekly questions rather than seven calls to
`GET /v1/days/{date}`. It is one request and it costs one unit of budget.

### Write (scope: `write`)

| Route                | Body                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| `POST /v1/water`     | `{ amountMl, date? }`                                                             |
| `POST /v1/food`      | `{ name, calories, protein?, carbs?, fat?, meal?, date? }`                        |
| `POST /v1/weight`    | `{ weightKg, date? }`                                                             |
| `POST /v1/workouts`  | `{ exercises: [{ name, sets: [{ reps, weightKg? }] }], durationMinutes?, date? }` |
| `POST /v1/rest-days` | `{ dates: ["YYYY-MM-DD", …] }`                                                    |

`meal` is one of `breakfast`, `lunch`, `dinner`, `snack`, and defaults to
`snack`. `log_weight` replaces that day's weigh-in rather than adding a second.

### What is deliberately absent

**Nothing deletes.** There is no `DELETE` on anything, no `clear`, no bulk
anything. The app is one tap away for the times a human means it, and an
automation that can drop a month of workouts is an automation that eventually
will.

**No AI-billed operations.** Coach and photo logging are not reachable here,
because whose quota a script-invoked coach call should spend has not been
decided.

## Errors

Every failure has the same shape:

```json
{
  "error": {
    "code": "insufficient_scope",
    "message": "This key has read access, and POST /v1/water needs write."
  }
}
```

Branch on `code`; the `message` is written for whoever is reading the log at 2am
and may be reworded. Never a stack trace.

| Status | `code`                                             | What happened                                   |
| ------ | -------------------------------------------------- | ----------------------------------------------- |
| 400    | `invalid_request`, `invalid_json`, `unknown_field` | The request was wrong. The message says how.    |
| 401    | `unauthorized`                                     | Missing, wrong, or revoked key.                 |
| 403    | `insufficient_scope`                               | A read-only key tried to write.                 |
| 404    | `not_found`                                        | No such route. `GET /v1` lists what there is.   |
| 405    | `method_not_allowed`                               | Right path, wrong verb. See the `Allow` header. |
| 413    | `payload_too_large`                                | Body over 64 KB.                                |
| 415    | `unsupported_media_type`                           | Send `application/json`.                        |
| 429    | `rate_limited`                                     | Out of budget. See `Retry-After`.               |

A field name this API does not recognise is a `400`, not a shrug. A `protien`
that silently logs zero grams is a bug you find three weeks later in a chart.

## Limits and behaviour

- **Rate limits are per key, not per account**: 600 reads and 60 writes an hour,
  in a fixed window. One runaway script cannot lock its owner out of their own
  app. A `429` carries `Retry-After` in seconds.
- **Two sessions per calendar day.** A third `POST /v1/workouts` on the same
  date is refused with an explanation, not silently dropped.
- **Values are bounded.** Water 1–5000 ml, weight 20–400 kg, at most 20
  exercises and 30 sets each, at most 31 dates per `POST /v1/rest-days`.
- **Nothing is cached.** Every response carries `Cache-Control: no-store`.
- **Writes are not idempotent.** There are no idempotency keys yet, so a retried
  `POST /v1/food` logs the meal twice. Retry on `429` and `5xx`, not on `4xx`.

## Privacy

A key is your whole log. Treat it like a password:

- Anything holding the key can read every day you have ever logged.
- A read & write key can also add entries — which will show up in your totals,
  your streaks and your weekly report.
- Keys are stored hashed. Nobody, including us, can read one back out.
- Revoking is immediate and does not undo anything already written; the app's
  normal delete controls do that.

Prefer a read-only key. Most things people build against this only ever read.

## How it is built

| File                                              | Role                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `convex/api/rest.ts`                              | The route table, auth, limits and error shape.                |
| `convex/mcp/tools.ts`                             | The catalog every route delegates to — schemas and coercion.  |
| `convex/mcp/data.ts`                              | Internal queries and mutations keyed by an explicit `userId`. |
| `convex/mcp/tokens.ts`                            | Minting, listing, revoking, resolving, rate limiting.         |
| `convex/http.ts`                                  | Mounts `/v1`.                                                 |
| `apps/mobile/src/components/api-keys-section.tsx` | The Settings → API & MCP panel.                               |

Every route here is a thin renaming of a tool the MCP endpoint already exposes.
That is the whole design: a second implementation of "log a food entry" would be
a second place for the validation to drift, and the day the two disagree is the
day somebody's diary quietly fills with nonsense. So the route table maps a
method and a path onto a tool, and the tool does the work it has always done.

Scope, rate limit, revocation and ownership are inherited from the key rather
than reimplemented, which is why there is no auth code in the route handlers to
get subtly wrong.

### Adding a route

1. Add the capability as a tool — see [Adding a tool](./mcp.md#adding-a-tool).
   Both surfaces get it at once, which is the point.
2. Add an entry to `ROUTES` in `convex/api/rest.ts` with a method, a path and a
   one-line summary. `args` maps the query string and path params onto the
   tool's arguments; `POST` bodies are passed through and checked against the
   tool's schema, so leave `args` off unless the shapes differ.
3. Cover it in `convex/__tests__/restApi.convex.test.ts`, which drives the real
   route through `t.fetch` — including what a read-only key gets back.

A test in that file asserts every tool is reachable over REST, so a tool added
without a route fails the build rather than becoming a quiet MCP exclusive.
Anything that deletes needs a conversation first, not a pull request.

## Troubleshooting

**401 on every call.** The key is wrong, revoked, or the header is missing the
`Bearer ` prefix.

**403 on a route that plainly exists.** That is a read-only key. Mint a read &
write one; scope cannot be changed after creation.

**400 `unknown_field` on a body that looks right.** Check the spelling against
the table above. The API refuses fields it will not read.

**Everything reads as empty.** Check the date. The default is today in UTC,
which is yesterday for a good part of the world at the wrong hour.
