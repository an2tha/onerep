# The OneRep MCP interface

OneRep speaks the [Model Context Protocol](https://modelcontextprotocol.io), so
an AI assistant can read your training and nutrition log and — if you let it —
add to it. This is the reference for using it and for working on it.

- **Endpoint:** `POST https://<your-convex-deployment>.convex.site/mcp`
- **Transport:** streamable HTTP, JSON-RPC 2.0, one response per request
- **Protocol version:** `2025-06-18`
- **Auth:** OAuth 2.1, or a bearer key you create in the app

The exact endpoint for your deployment is printed in the app under
**Settings → API & MCP**, next to the button that mints the key. Copy it
from there rather than assembling it by hand.

The same tools are available over plain HTTP for anything that does not speak
the protocol — see [the REST API](./api.md). Same keys, same scopes, same
limits.

## Connecting with OAuth

Most clients — Claude Desktop's custom connectors among them — would rather ask
for access than be handed a key. Give one the endpoint above and it will sort
itself out: it reads the `401`, finds the discovery documents, registers
itself, opens a browser, and you approve a screen with the app's name on it.
Nothing is copied and pasted, and the connection appears under **Settings →
API & MCP → Connected apps**, where one tap ends it.

The endpoints, should you need to drive them yourself:

| Path                                          | What it is                                    |
| --------------------------------------------- | --------------------------------------------- |
| `/.well-known/oauth-protected-resource`       | RFC 9728 — points at the authorization server |
| `/.well-known/oauth-authorization-server`     | RFC 8414 — points at everything below         |
| `/oauth/register`                             | RFC 7591 dynamic client registration          |
| `/oauth/authorize`                            | Sends the browser to the consent screen       |
| `/oauth/token`                                | `authorization_code` and `refresh_token`      |
| `/oauth/revoke`                               | RFC 7009                                      |

PKCE is required and only `S256` is accepted. Redirect URIs are matched as
exact strings, so copy the one the client shows you rather than typing
something that looks like it. Access tokens last seven days and the client
renews them itself; refresh tokens last ninety and rotate on every use, which
means a stolen one is good for a single exchange and the theft announces itself
by logging the real client out.

**If a client asks for a Client ID and Client Secret**, it is telling you it
will not register itself. Mint a pair under **Settings → API & MCP → New OAuth
client**, paste its redirect URI in, and paste the ID and secret back. The
secret is shown once.

An OAuth token is an ordinary key underneath — same hash, same scopes, same
rate limits — so everything below about scopes and limits applies to it
unchanged. It just expires, and it is listed under connections rather than
among the keys you typed.

## Getting a token by hand

1. Open OneRep → **Settings → API & MCP**.
2. Name it, choose **Read only** or **Read & write**, and create it.
3. Copy the key. It is shown once and never again — only a SHA-256 hash of
   it is stored, so a key you lose is a key you replace.

A key is revoked from the same screen and stops working on the next request.
Ten live keys per account is the ceiling. Keys minted before the REST API
existed read `onerep_mcp_` rather than `onerep_sk_`; they still work, because
the lookup has always been by hash and the prefix has never been anything but a
label.

**Read-only means read-only.** The scope is checked on every call, so a
read-only token cannot be argued into writing: the write tools are not listed
to it, and calling one anyway is refused.

## Connecting a client

Claude Code:

```sh
claude mcp add --transport http onerep https://<deployment>.convex.site/mcp \
  --header "Authorization: Bearer onerep_sk_…"
```

Anything that takes a JSON config:

```json
{
  "mcpServers": {
    "onerep": {
      "type": "http",
      "url": "https://<deployment>.convex.site/mcp",
      "headers": { "Authorization": "Bearer onerep_sk_…" }
    }
  }
}
```

By hand, to check it is alive:

```sh
curl -s https://<deployment>.convex.site/mcp \
  -H "Authorization: Bearer onerep_sk_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
```

A missing or revoked token answers `401` with a `WWW-Authenticate` header
rather than an empty list, so a misconfigured client says so instead of looking
like an empty account.

## The tools

Eleven of them. Coarse on purpose: forty thin wrappers around every backend
function would fill a context window without describing what the app is for.

### Read (scope: `read`)

| Tool                     | What it answers                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `get_day`                | Everything on one date — food entries and totals, water, completed workouts, whether it was a rest day.                             |
| `get_range`              | Per-day nutrition totals, workouts and rest days between two dates. Use this for weekly questions instead of seven `get_day` calls. |
| `list_workouts`          | Recent sessions, newest first, with exercises, sets, reps and weights.                                                              |
| `get_goals`              | Calorie and macro targets, water goal, weight unit, stated training goal.                                                           |
| `get_training_insights`  | The server's conclusions: per-lift progression verdicts over twelve weeks, recovery against the user's own baseline, six monthly summaries. |
| `list_body_measurements` | Recent weigh-ins, in kilograms and centimetres.                                                                                     |

### Write (scope: `write`)

| Tool            | What it does                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| `log_water`     | Adds a drink to a day.                                                       |
| `log_food`      | Adds one food entry. Calories required; macros default to zero.              |
| `log_weight`    | Records a weigh-in, replacing that day's if one exists.                      |
| `log_workout`   | Records a completed session.                                                 |
| `mark_rest_day` | Marks dates as deliberate rest, so the app stops reading the gap as a lapse. |

Dates are `YYYY-MM-DD` and default to today in **UTC**. An assistant that knows
the user's timezone should pass the date explicitly rather than trust that
default around midnight.

### What is deliberately absent

**Nothing deletes.** There is no `delete_entry`, no `clear_day`, no bulk
anything. "Remove my last month of workouts" is a sentence an agent can produce
by accident, and the app is one tap away for the times a human means it.

**No AI-billed operations.** Coach and photo logging are not reachable over
MCP, because whose quota an agent-invoked coach call should spend has not been
decided.

## Limits and behaviour

- **Rate limits are per token, not per account**: 600 reads and 60 writes an
  hour. One agent stuck in a loop cannot lock its owner out of their own app.
- **Two sessions per calendar day.** A third `log_workout` on the same date is
  refused with an explanation, not silently dropped.
- **Values are bounded.** Water 1–5000 ml, weight 20–400 kg, at most 20
  exercises and 30 sets each, at most 31 dates per `mark_rest_day`.
- **Tool failures come back as results, not transport errors** — a
  `tools/call` result with `isError: true` and a message written to be acted
  on, so the model can correct itself rather than see the request fail.

## Privacy

A token is your whole log. Treat it like a password:

- Anything holding the token can read every day you have ever logged.
- A read & write token can also add entries — which will show up in your
  totals, your streaks and your weekly report.
- Tokens are stored hashed. Nobody, including us, can read one back out.
- Revoking is immediate and does not undo anything already written; the app's
  normal delete controls do that.

## How it is built

| File                                              | Role                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `convex/mcp/server.ts`                            | The HTTP action: JSON-RPC envelope, bearer check, dispatch.   |
| `convex/mcp/tools.ts`                             | The tool catalog — schemas, scopes, argument coercion.        |
| `convex/mcp/data.ts`                              | Internal queries and mutations keyed by an explicit `userId`. |
| `convex/mcp/tokens.ts`                            | Minting, listing, revoking, resolving, rate limiting.         |
| `convex/mcp/oauth.ts`                             | Clients, codes, grants, connections — the storage underneath. |
| `convex/mcp/oauthServer.ts`                       | Discovery, registration, authorize, token, revoke.            |
| `apps/mobile/src/pages/OAuthConsent.tsx`          | The consent screen `/oauth/authorize` redirects to.           |
| `convex/http.ts`                                  | Mounts `/mcp` and the OAuth routes.                           |
| `convex/api/rest.ts`                              | The REST API, which delegates to this same catalog.           |
| `apps/mobile/src/components/api-keys-section.tsx` | The Settings → API & MCP panel.                               |

The app's own Convex functions resolve the user from a session, which an agent
holding a token does not have. Rather than loosening those, `convex/mcp/data.ts`
is a second entry point at the same depth: it goes through the shared helpers in
`convex/lib`, so an agent obeys the same validators and the same slot rules as a
person tapping the screen. It is `internal`, so only the authenticated HTTP
layer can reach it.

Token creation is an `action` rather than a mutation: it needs real randomness
and a real SHA-256, and the deterministic query/mutation runtime is the wrong
place to ask for either.

### Adding a tool

1. Write the work as an `internalQuery` or `internalMutation` in
   `convex/mcp/data.ts`, taking `userId` explicitly and going through
   `convex/lib` wherever a helper exists.
2. Add an entry to `MCP_TOOLS` in `convex/mcp/tools.ts` with a JSON Schema, a
   scope, and a description written for a model rather than a changelog.
3. Cover it in `convex/__tests__/mcpEndpoint.convex.test.ts`, which drives the
   real route through `t.fetch` — including what happens when the wrong scope
   calls it.
4. Give it a REST route in `convex/api/rest.ts`. A test asserts every tool has
   one, so skipping this fails the build rather than leaving the API quietly
   the lesser door.

Anything that deletes needs a conversation first, not a pull request.

## Troubleshooting

**401 on every call.** The token is wrong, revoked, or the header is missing
the `Bearer ` prefix.

**`tools/list` returns five tools.** That is a read-only token. Mint a read &
write one; scope cannot be changed after creation.

**"This token has used its budget for the hour."** The per-token rate limit.
Wait, or use a second token for the other client.

**Everything reads as empty.** Check the date. The default is today in UTC,
which is yesterday for a good part of the world at the wrong hour.
