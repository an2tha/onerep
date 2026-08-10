# Backlog

Things that are wanted but not built. Deliberately short: an item earns its
place here by being specific enough to start, and leaves by being done.

## The Convex tests are half fiction

**Status:** found, not fixed. Urgent in the sense that nobody knows what is
actually covered.

`convexTest`'s `withIdentity` takes one argument and returns a scoped
instance. Nineteen files in `convex/__tests__` call it as
`withIdentity({ … }, async () => { … })` — the callback is an ignored second
argument, so it never runs, and every assertion inside it never executes. The
tests pass because nothing in them happens. Roughly 130 blocks are affected.

The fix per block is mechanical (`const asUser = t.withIdentity({ … })`, then
`asUser.mutation(…)`), and it was applied to `moments`, `restDays`, `mcp` and
`mcpEndpoint`. The other nineteen files were left alone deliberately: turning
them on will surface real failures, and that is a body of work to schedule
rather than smuggle into an unrelated change.

## Full-screen moments: quick actions and better UI

**Status:** done, bar one deliberate exclusion.

Quick actions land in the check-in moment: repeating a recent session or a
saved preset onto a chosen day, marking a stretch as deliberate rest, a glass
of water, and repeating a food eaten often. Each writes and closes with undo
in the toast. The weekly report was rebuilt around a seven-day strip and now
ends by asking for next week's session target, which it holds you to when that
week closes.

**Not done: dictation in place.** "Describe it" lives inside
`ActiveWorkout.tsx`, 3,800 lines that own the retro logger, the draft handoff
and the AI parse. Hosting it in a moment means extracting that first. The
moment still hands off to it through `?logPast=`, which is one route
transition, not a dead end.

## A full MCP interface, auth-gated

**Status:** shipped, token-authenticated. `POST /mcp` on the Convex HTTP
router, JSON-RPC 2.0, protocol version 2025-06-18.

Ten tools — five read, five write — in `convex/mcp/tools.ts`, backed by
internal functions in `convex/mcp/data.ts` that go through the same `lib`
helpers the app does, so the two-sessions-a-day rule and every validator hold
for an agent exactly as they do for a person. Nothing deletes. Tokens are
minted in Settings → Data & account, stored only as a SHA-256 hash, scoped
read or read-and-write, revocable, and rate limited per token so one looping
agent cannot lock its owner out.

OAuth 2.1 with dynamic client registration is shipped alongside that:
discovery at both well-known paths, `/oauth/register`, `/oauth/authorize`,
`/oauth/token`, `/oauth/revoke`, PKCE required and S256 only, refresh tokens
rotated on use. A client that would rather ask than be handed a key can, and a
client that insists on a client ID and secret can be minted one in Settings.
What comes out the far end is the same `mcpTokens` row, so there is still only
one kind of credential and one place to turn it off.

What is left:

**AI-billed operations are not exposed.** Nothing in the tool list reaches the
coach or snap, because whose quota an agent-invoked coach call spends is still
unanswered. Answer it before adding one.

**Shared-diary viewers get nothing.** Read-only tokens scoped to somebody
else's diary are plausible and unbuilt.
