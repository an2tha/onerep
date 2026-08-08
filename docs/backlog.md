# Backlog

Things that are wanted but not built. Deliberately short: an item earns its
place here by being specific enough to start, and leaves by being done.

## Full-screen moments: quick actions and better UI

**Status:** not started. The moments themselves shipped — see
`apps/mobile/src/lib/full-screen-events.tsx` for the layer,
`apps/mobile/src/lib/moments.ts` for the triggers.

Two related complaints about what's there now.

**Quick actions right from the prompt.** Today every answer on the check-in
screen is a hand-off: it closes the moment and navigates somewhere else, and
the user finishes the job on a different page having already forgotten why
they were sent there. The obvious ones should complete in place — log the
session, log the meal, mark the rest day — and the screen should close on
something being _done_ rather than on a promise to do it. The retro-log path
is the sharpest case: picking a day and describing the session is two screens
away when it could be one.

**Better UI.** The current screens are honest and plain, which was the right
first pass and is not the last one. The weekly report in particular is four
stat tiles and a list; it should be worth stopping for.

Related: `apps/mobile/src/components/moments/`.

## A full MCP interface, auth-gated

**Status:** not started. Nothing of this exists yet.

Expose the account over the Model Context Protocol so an agent — Claude, or
whatever the user already has open — can read and write the log without
anybody pretending a chat box is an API. Full-fledged, meaning the same
surface the app has rather than a demo with three read-only tools.

**Shape.** An MCP server speaking streamable HTTP, mounted on the existing
Convex HTTP router (`convex/http.ts`, which already carries the auth-provider
and Stripe webhook routes). Tools are thin wrappers over the functions that
exist: `logs.foodLogs`, `logs.workouts`, `logs.water`, `logs.supplements`,
`bodyProgress`, `users.users.getEffectiveGoals`, the progress queries. Writes
must go through the same mutations the app calls — validators, rate limits and
entitlement checks included — never straight at the tables.

**Auth is the whole job.** OAuth 2.1 with dynamic client registration is what
MCP clients expect, and better-auth is already the identity here. Per-user
tokens, scoped read vs. write, revocable from Settings, with the token list
and last-used timestamp visible there. An unauthenticated request gets nothing
— no anonymous tier, no shared key in an env var. Rate-limit per token, not
per user, or one runaway agent buries the account it belongs to.

**Open questions.**

- Which tools are write-capable at all. "Delete my last month of logs" is a
  sentence an agent can produce by accident.
- Whether AI-billed operations (coach, snap) are reachable over MCP, and whose
  quota they spend — see `convex/ai/usage.ts` and the entitlement gate.
- Whether shared-diary viewers get a read-only token, or nothing.

Related: `convex/http.ts`, `convex/lib/auth.ts`, `convex/lib/rateLimits.ts`.
