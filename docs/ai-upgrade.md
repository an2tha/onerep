# The AI coach, versus the person it is supposed to replace

A human coach is, when you strip away the Instagram, three services: they *notice* you,
they *adapt* your plan to what actually happened, and they *remember* you. Our coach —
which can already write a six-day split, log a burrito from a photo, and measure your
squat depth in degrees — does none of those three unless you open the app and ask.
It is a brilliant employee who never comes to work until summoned.

This document maps parity against a human coach and lays out the plan for closing the
gap. Phase 1 is specified in detail at the bottom; the rest are sketched at the
altitude they deserve until we get there.

## Where we already have parity (or better)

| Capability | Status | Where |
| --- | --- | --- |
| Intake & assessment | Parity. Goals, experience, diet, allergies, budget, safety flags; allergies bind even with personalization off. | `convex/users/onboarding.ts`, `convex/ai/coachWorkspace.ts:298` |
| Program writing | Parity. Multi-preset splits + full 7-day routine written atomically, structurally validated. | `convex/ai/coachOperations.ts`, `convex/ai/prompts/coach_chat.yaml` |
| Nutrition coaching | Parity, better on friction. Targets, recipes, interactive logging cards, photo logging. | `convex/logs/*`, `convex/lib/nutritionPlan.ts` |
| Form checks | Better per rep reviewed — we measure joint angles; a human eyeballs a video. Worse in that ours waits to be asked. | `convex/ai/formCoachAgent.ts:1208` |
| Reversibility | Better. Every write carries an undo payload. Humans do not have an undo payload. | `convex/ai/coachState.ts:970` |

## Where the human still wins

1. **Initiative.** The coach never speaks first. No coach crons (`convex/crons.ts` is
   uploads and billing), no push infrastructure at all, and the "proactive" moments are
   client-side heuristics that only fire if the user already opened the app — which is
   precisely the population that didn't need the nudge.
2. **Adaptation from results.** Progression is a `reason` enum on a preset. No
   progression engine, no deload logic, no periodization. The 1RM math lives client-side
   in `apps/mobile/src/lib/one-rm.ts`, where the coach cannot see it.
3. **Recovery awareness.** No sleep duration, steps, HRV, or resting HR reaches the
   workspace; sleep is a 1–5 self-report inside check-ins. The HealthKit/Health Connect
   plugins import workouts only. The data sits on the phone, unasked.
4. **Long-term relationship.** A 14-day window, 40 memories, the last 8 messages. A
   human remembers the shoulder tweak in March and that you always disappear during
   work travel. Six months of trend lives in our tables and never reaches the model.
5. **Presence during the workout.** `activeWorkouts` tracks the live session; the coach
   is not in the loop. No mid-session adjustment, no spotting.
6. **Feel.** No streaming — the user watches a thinking indicator while a full JSON
   payload assembles. And 10 free messages a month is a support quota, not a
   relationship.

## The phases

- **Phase 1 — Give it a pulse.** Push infrastructure, a server-side weekly review that
  proposes plan adjustments as approvable operations, and the moments triggers moved
  server-side so they fire without an app open. Specified below.
- **Phase 2 — Deterministic programming brain.** Shipped; detailed below.
- **Phase 3 — Recovery ingestion.** Shipped; detailed below.
- **Phase 4 — Memory that survives a season.** Shipped; detailed below.
- **Phase 5 — Presence and feel.** Mostly shipped; detailed below. Streaming
  chat is the one deliberately deferred piece.

Sequencing: 1–2 change what the product is. 3 feeds 2 better data, 4 makes it
compound, 5 makes it pleasant. If we build only one thing, build the weekly review
loop.

---

# Phase 1: shipped

Built and tested. What follows is the design; below it, what a deployment
still has to supply before any of it actually reaches a phone.

## What exists

| Piece | Where |
| --- | --- |
| Shared trigger logic (client + server, one conscience) | `packages/models/src/moments.ts` |
| Outreach gate: toggles, quiet hours, frequency cap | `convex/lib/outreach.ts` |
| FCM HTTP v1 transport, service-account JWT, dead-token detection | `convex/push/fcm.ts` |
| Device registration, token reassignment, eviction | `convex/push/tokens.ts` |
| `sendCoachTouch` — the single gated door | `convex/push/send.ts` |
| Weekly review: selection, generation, storage, expiry | `convex/ai/weeklyReview.ts` |
| Review prompt | `convex/ai/prompts/coach_weekly_review.yaml` |
| User-facing review API (read, apply, dismiss) | `convex/ai/coachReviews.ts` |
| Server-side nudge sweep | `convex/ai/nudges.ts` |
| Hourly crons | `convex/crons.ts` |
| Push registration on device | `apps/mobile/src/lib/coach-push.ts`, `components/coach-push-registration.tsx` |
| The Sunday review screen | `apps/mobile/src/components/moments/weekly-review-moment.tsx` |
| Settings switches | `apps/mobile/src/pages/Settings.tsx` (Reminders → Coach) |
| Tests | `convex/lib/__tests__/outreach.test.ts`, `convex/__tests__/coachOutreach.convex.test.ts` |

Timezone plumbing turned out to already exist: `users.syncTimezone` writes
`userPreferences.lastActiveTimezone` on app start, which is why both sweeps
select on that table — having a row is a fair proxy for being a user, and the
timezone is the whole question when a UTC cron has to find Sunday evening.

## Deployment: what is still needed

None of this reaches a phone until someone supplies credentials. The code
treats their absence as "no push", not as an error, so a deployment without
them behaves exactly as it did before.

Convex environment:

- `COACH_PROACTIVE_ENABLED` — `"true"` to arm the crons. Absent, every sweep
  returns immediately. This is the kill switch; it is deliberately separate
  from the credentials so a staging deployment can hold working keys and still
  be forbidden from speaking.
- `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` — from a Firebase
  service-account JSON. The private key may keep its literal `\n` escapes;
  `resolveFcmConfig` unescapes them, because a PEM with the wrong line breaks
  fails deep inside `crypto.subtle.importKey` with an error that mentions
  everything except line breaks.

Native, still to do by hand:

- **Android**: `google-services.json` in `apps/mobile/android/app/`, and the
  Google Services Gradle plugin.
- **iOS**: the Firebase SDK, `GoogleService-Info.plist`, the Push Notifications
  capability, and an APNs key uploaded to the Firebase project. This is the
  cost of the one-transport decision; it is still cheaper than maintaining a
  second sender forever.

Until both are in place, `registerForCoachPush` returns `"unsupported"` and the
weekly review surfaces as a moment on next open — which is the designed
degradation, not a workaround.

## Two decisions taken during the build

**Reviews are silent for users with personalized insights off.** Those users
have no `foodEntries` or `recentWorkouts` in the workspace at all, so
`weekHasSubstance` is false and no model call happens. That is the honest
reading of the switch: a weekly review is inference about behaviour, which is
the thing they turned off. Allergies still bind everywhere else, unchanged.

**The built-in weekly report stands down when a coach review covers the same
week.** Otherwise Sunday evening produces two full-screen summaries of one
seven-day period, which is how a user learns to dismiss both. `app-moments.tsx`
suppresses the local report when the review's `weekKey` matches, and holds off
entirely while the query is still in flight.

---

# The audit, and what it cost

Before Phase 5, a hostile re-read of Phases 1–4 found eleven problems. All are
fixed:

- **Sign-out now revokes the push token** (both the sign-out and
  delete-account paths in Settings), and push listeners attach before the
  permission prompt so a cold-start notification tap is never lost.
- **`INVALID_ARGUMENT` no longer counts as token death** in the FCM client.
  FCM returns it for malformed messages too, and the old classification meant
  one bad payload release could delete every push registration in a single
  sweep. Only `UNREGISTERED` and `SENDER_ID_MISMATCH` kill a token now.
- **iOS and Android agree about "now".** The iOS metrics window ended at
  start-of-day, excluding today's data and — for anyone asleep after midnight —
  the whole of last night's sleep. Both platforms now end at the current
  instant.
- **Android steps go through the aggregate API** (which de-duplicates a phone
  and a watch counting the same walk), and every raw record read now follows
  page tokens — 35 days of 15-minute step chunks overflowed a single page.
- **The nudge sweep no longer starves late-table users.** Cheap gates
  (settings, dedupe, cap) moved into the paged selection query, and only
  expensive trigger-data loads spend the sweep budget, so the cursor reaches
  every page.
- **The weekly review selection now requires a pulse** — two indexed lookups
  for any log in 14 days — instead of building the most expensive query in the
  codebase for every dormant account each Sunday. It also respects the user's
  outreach settings at selection time.
- **Monthly history and memory consolidation run before the model call**, so a
  provider outage no longer costs a user their week's bookkeeping, and they run
  for every active user rather than only review recipients.
- **`COACH_REVIEW_PRO_ONLY`** gates reviews to Pro when set. Off by default:
  per-user cost is already bounded at one call a week by the per-week
  idempotent review row, which is the actual budget.
- The memory fetch bound now matches consolidation's (3× the ceiling), so
  protected memories beyond the storage ceiling still get ranked; the
  `programming` same-day merge no longer double-counts sets; the HRV schema
  comment tells the truth (SDNN on iOS, RMSSD on Android — never compare
  across platforms); `coachMonthlySummaries` and `coachTouches` joined the
  data export; and the review-expiry cron got a proper index instead of a
  cross-user table scan.

---

# Phase 5: mostly shipped

## What exists

- **`workspace.formChecks`** — the last five form-check reports, compressed to
  exercise, date, summary, and non-strength findings, with prompt guidance to
  coach the user's actual body and point at the full report for drills.
- **The coach between sets** — `convex/ai/inWorkout.ts` plus
  `components/in-workout-coach.tsx`, mounted as a floating pill in the live
  workout (never the retro logger). One question, one sentence back, grounded
  in the live session, the per-lift analysis, and measured recovery. There is
  no second model — gpt-5.6-luna is the whole stable, and it is already the
  cheapest thing on the menu — so the latency work is all in the request: a
  deliberately thin context slice instead of the nineteen-query workspace, a
  tight token ceiling, and one sentence back. It costs one `in_workout` quota
  unit, its failures degrade to a plain sentence rather than an error dialog,
  and nothing it says can write data.
- **The quota policy** landed with the audit fixes: nudges are templated (no
  model call), reviews are budgeted by their own idempotency and optionally
  Pro-gated, and neither touches the user's chat allowance.

## Follow-through, added after Phase 5

- **The receipts panel.** Progress → Training now shows "What your coach
  sees": per-lift verdicts with their suggestions, the deload call, and the
  measured recovery read-out — the same computed blocks the model reads,
  via `api.progressInsights.training`. The Sunday review stops being an
  oracle; the user can point at the evidence.
- **Accountability in the review.** `previousReview` — last week's headline
  and each proposal's fate (applied / dismissed / unanswered) — is in the
  review context, with prompt rules: follow up on applied advice, never
  re-propose dismissed advice in the same words, never scold.
- **Dictation between sets.** The in-workout coach reuses `useCoachDictation`
  with lifting vocabulary, in the same mic-plus-button layout as the
  brain-dump sheet next door.
- **Deload-aware nudges.** An active `coachWeeklyPlans` row for the current
  week titled deload/recovery/light suspends the training-lapse nudge — the
  user announced the quiet week; asking about it teaches them to ignore
  every question the app asks.
- **Quiet hours UI.** Two time inputs in Settings → Reminders → Coach; the
  schema and gate always supported them, the UI now does too.
- **`get_training_insights`** on the MCP surface and `GET /v1/insights` on
  REST, so external agents read the same computed analysis the coach does.
- The weekly review may also suggest a form check — at most one per review,
  when a lift's volume climbed and its last check is stale.

## Deferred: streaming chat

Deliberately not built. Doing it honestly means an HTTP action streaming
partial structured output over SSE, auth-token plumbing from the Better Auth
client to a raw fetch, and verifying this AI SDK version's partial-output
stream API against a pinned dependency — none of which belongs in the tail of
a batch this size, and a half-streamed JSON protocol shipped untested would be
worse than the thinking indicator it replaces. The shape when it happens: an
HTTP route beside `/mcp`, `streamText` with partial output, the client
rendering the `reply` field as it grows, and the existing action as the
fallback for images and for anything that goes wrong.

---

# Phase 4: shipped

A fortnight of logs answers "what should I do on Thursday". It cannot answer
"am I actually getting anywhere", and it certainly cannot remember the shoulder
tweak in March. This phase gives the coach a season: six months of precomputed
monthly rows, a one-line episode written each Sunday, and — the part that turns
out to matter most — a rule about what gets forgotten.

## What exists

| Piece | Where |
| --- | --- |
| Monthly aggregation, pure | `convex/lib/history.ts` |
| Memory curation and eviction rules, pure | `convex/lib/memoryConsolidation.ts` |
| `coachMonthlySummaries` table | `convex/schema.ts` |
| Recompute, history load, episode write, consolidation | `convex/ai/coachHistory.ts` |
| `history` block + ranked memories in the workspace | `convex/ai/coachWorkspace.ts` |
| `digest` field, recompute and episode hooks | `convex/ai/weeklyReview.ts` |
| Prompt guidance for both chat and the review | `convex/ai/prompts/*.yaml` |
| Tests | `convex/lib/__tests__/{history,memoryConsolidation}.test.ts`, `convex/__tests__/coachHistory.convex.test.ts` |

## The judgement calls

**Precomputed, not derived.** Deriving six months on read means pulling six
months of food logs into every coach turn. A closed month's numbers never
change again, so the recompute touches exactly two months — the current one,
and the previous for backdated edits — and runs once a week, on the same
schedule as the review that reads it.

**A missing month is a gap, not a row of zeroes.** Someone who did not use the
app in March gets no March row, and one is deleted if a month is emptied by
deletions. "Trained zero times in March" and "was not here in March" are
different facts, and only one is worth a coach mentioning.

**Most weeks get no episode.** The prompt asks for a digest only when a week
defined something — "first week back after the shoulder flare-up" — and
explicitly not when it merely restates numbers already stored. A memory written
every Sunday regardless is a diary, and a diary crowds out the things the user
actually said.

**Forgetting became a decision instead of an accident.** Memories were read
forty-at-a-time, newest first, with no ceiling on storage — so past forty, what
the coach remembered was whatever it had written most recently. A user's own
"I have a bad shoulder" would fall out of context behind a fortnight of the
model's observations about breakfast. Now: the user's own words are never
evicted, safety-shaped categories are never evicted whoever wrote them,
episodes are capped at fourteen on their own terms, and only then does
oldest-first eviction apply. A user with seventy hand-written notes keeps all
seventy — the ceiling bends rather than discarding somebody's words.

**Ranking without fetching is useless.** The first cut ordered memories by
protection and recency but still read only the 40 newest, which meant a
year-old constraint was never fetched to be ranked. The workspace now reads
every stored memory (bounded by the consolidation ceiling), ranks, and *then*
takes 40. There is an integration test that buries a year-old injury note under
fifty newer ones and asserts it comes out first.

## What was deliberately left out

- **Volume per muscle group**, which the original sketch listed. Same reason as
  Phase 2: `workoutLogs` stores exercise names, not muscles, and joining
  against the catalog for every session of every month is read amplification
  for a number nobody has asked for. Sets per month carries the shape.
- **A backfill.** Monthly rows appear as each weekly review runs, so history
  fills in from the current month forward rather than reconstructing the past.
  `consolidateMemories` is exported separately precisely so a backfill can run
  it later without writing a digest.
- **Surfacing episodes in the UI.** They appear in the existing Coach memory
  list, which the user can already read and edit — that was the point of
  storing them as ordinary memories rather than inventing a parallel table.

---

# Phase 3: shipped

The coach has always been told to go conservative when recovery is poor. It
simply never knew. Sleep reached it as a 1–5 self-report inside a check-in most
people never filled in, while the actual measurements sat on the phone unasked.
Now the sensors reach it, and — more to the point — the deload verdict can
finally tell a programme that has run its course from a person who has not
slept properly in a fortnight. Those want opposite responses, and until this
phase there was no way to distinguish them.

## What exists

| Piece | Where |
| --- | --- |
| `healthMetrics` table: one upserted row per user per local day | `convex/schema.ts` |
| Baseline-relative recovery analysis | `convex/lib/recovery.ts` |
| Sync mutation with sanity filtering; `recovery` query | `convex/logs/healthMetrics.ts` |
| Window loader shared by the query and the workspace | `convex/lib/healthMetrics.ts` |
| `recovery` block in the workspace, behind the privacy gate | `convex/ai/coachWorkspace.ts` |
| Recovery-aware deload | `convex/lib/programming.ts` (`assessDeload`) |
| HealthKit: sleep, steps, resting HR, HRV | `apps/mobile/ios/App/App/AppleHealthPlugin.swift` |
| Health Connect: the same four | `.../HealthConnectPlugin.kt` |
| Client bridge and foreground sync | `apps/mobile/src/lib/health-provider.ts`, `components/health-sync.tsx` |
| Tests | `convex/lib/__tests__/recovery.test.ts`, `convex/__tests__/healthMetrics.convex.test.ts` |

## The judgement calls

**Everything compares a person against themselves.** Population norms for
resting heart rate and HRV are close to meaningless individually. Nothing in
`recovery.ts` contains a threshold like "below 60bpm is good"; the signal is
deviation from a 28-day personal baseline.

**The baseline is a median, and it includes the recent days.** Median so one flu
week does not move it. Including recent days because excluding them would make
a slow drift invisible — someone sleeping progressively worse for three weeks
would compare each bad week against the slightly-less-bad one before it and
never trip anything. Both are tested.

**Two agreeing signals before saying "compromised".** One is a bad night.
Announcing a recovery problem every time someone stays up late is how a feature
gets its notifications turned off.

**A sleep floor on top of the deviation model.** Someone who habitually sleeps
five hours has a five-hour baseline and deviates from nothing, so a pure
deviation model would tell them they are ready. Below six hours is raised on
its own.

**Bad recovery lowers the deload bar to one stuck lift; it never triggers one
alone.** Someone sleeping badly who is still adding weight to the bar does not
need to be told to stop and would rightly resent it. The training evidence also
leads the sentence — opening with a heart-rate statistic to justify a week off
reads like an app looking for a reason.

**Sleep is attributed to the wake-up day, and overlapping samples are merged**
on both platforms. A phone and a watch recording the same night must not
produce sixteen hours of sleep. `inBed` is excluded on iOS: time spent reading
in bed is not recovery, and counting it would flatter every baseline.

**Implausible readings are dropped per field, not per row.** Health stores
aggregate third-party apps, and one writing a 400bpm resting heart rate would
quietly poison a baseline for a month. The day's sleep is still worth keeping
when its heart rate is nonsense.

## A pre-existing bug this surfaced

`fitWorkspaceToBudget` recorded every trim step it ran in `truncated`, whether
or not the step removed anything. Since `truncated` is what tells the model to
hedge — "say the history is partial rather than asserting a trend" — a user
with no water log was making the coach apologise for missing history they never
had. `TrimStep.apply` now returns whether it actually cut something, and only
then is the field reported. Found because a no-op recovery step pushed a test
16 characters over budget.

## Deployment

Nothing new server-side. The native layer needs:

- **iOS**: `NSHealthShareUsageDescription` has been rewritten — HealthKit uses
  one string for every read, and the old one promised workouts and cardio only,
  which is now both inaccurate and an App Review question. The entitlement is
  unchanged. New read types go through the same authorization call, so existing
  users see one fresh consent sheet listing sleep and heart data.
- **Android**: the four new `READ_*` permissions are declared in
  `AndroidManifest.xml` (`READ_SLEEP`, `READ_STEPS`, `READ_RESTING_HEART_RATE`,
  `READ_HEART_RATE_VARIABILITY`) and requested alongside the workout
  permissions, so Health Connect shows one consent screen rather than coming
  back for more.

Both need a native rebuild and a `cap sync`; neither is reachable over OTA.

Both plugins are additive, and `getDailyMetrics` is optional on the JS plugin
interface — a JS bundle delivered over OTA to an older native shell degrades to
no recovery data rather than crashing, which is routine skew here rather than
theoretical.

## What was deliberately left out

- **Subjective check-ins in the recovery verdict.** `coachCheckIns` still
  carries energy/soreness/sleepQuality and the model still sees them; they are
  simply not blended into `status`. Mixing a measured baseline with a 1–5 mood
  would make the verdict impossible to explain, and the sensor data is the part
  that was missing.
- **A recovery UI.** `api.logs.healthMetrics.recovery` is a public query and is
  ready for a Progress-screen panel; the app's existing `lib/readiness.ts`
  dashboard score is untouched and still check-in based. Merging the two is a
  real piece of work and not this phase.
- **Backfill.** Rows appear from the next foreground sync onward, reaching 35
  days back. A user gets a usable baseline within a week of updating.

---

# Phase 2: shipped

The coach used to be handed thirty raw sessions and asked to notice that a
squat had stopped moving. That is arithmetic over a table, which is the one
thing a language model reliably gets wrong — it will assert a trend from two
points, or miss one sitting in plain sight. Now the arithmetic happens in
`convex/lib/programming.ts`, in pure functions with twenty tests, and the model
receives verdicts: this lift is stalled, this one is climbing, here is the case
for a deload. It decides what to *say*. It does not decide what the numbers are.

## What exists

| Piece | Where |
| --- | --- |
| 1RM formulas, shared client↔server | `packages/models/src/oneRm.ts` (app re-exports via `lib/one-rm.ts`) |
| Progression analysis: per-lift status, trend, suggestions, deload | `convex/lib/programming.ts` |
| `programming` block in the workspace, behind the privacy gate | `convex/ai/coachWorkspace.ts` |
| Trim step so the block degrades gracefully under budget | `convex/lib/coachWorkspaceBudget.ts` |
| Prompt instructions for chat and the weekly review | `convex/ai/prompts/coach_chat.yaml`, `coach_weekly_review.yaml` |
| Tests | `convex/lib/__tests__/programming.test.ts`, `convex/__tests__/coachWorkspace.convex.test.ts` |

The block covers a **12-week** window — a training block, not the two weeks
`recentWorkouts` shows — read through a second, longer query capped at 200 logs
that never leaves the server. A heavy user's entire analysis serializes to
under 3 KB against a 60 KB budget, which is the trade the whole phase rests on:
conclusions are cheaper than logs *and* better than them.

## The judgement calls

**A 1.5% noise band.** Estimated 1RM swings by more than a percent on rounding
alone; a 100kg triple and a 102.5kg double are the same performance. Without a
band, the app tells people they are progressing while they quietly stagnate for
two months.

**Regression is judged against the window's best, not recent-versus-prior.**
The first version compared the last three sessions to everything before them,
which meant a short history let the recent slice swallow the old peak — a lift
that had fallen away for three straight sessions read as merely "stalled", the
one verdict that would let it keep falling unremarked. Caught by a test.

**Rep progress is checked before the direction verdict.** Someone who dropped
from 100kg to 85kg and is building 6→7→8 reps back up reads as "regressing"
against a six-week-old peak. Telling them to hold would punish them for doing
exactly the right thing. Reps climbing at a fixed load is progress, whatever an
older number says, so that check runs first.

**Progressing lifts get no advice at all.** Handing someone a change every week
for something that is working is how a coach proves it is not listening, and
the fastest way to teach a user to dismiss everything.

**The deload call is deliberately hard to trigger** — two-plus stuck lifts *and*
three weeks of real volume. Backing off costs a week of training if it is
wrong, and costs trust if it arrives every Sunday. A beginner who missed a rep
is not overreached; they are a beginner.

**Lifts are keyed by name, not exercise id.** The same movement acquires new ids
as it moves between the catalog, a custom entry, and a preset, and a user who
renamed nothing would otherwise watch their bench press split into three
unrelated histories.

## What was deliberately left out

- **Muscle-group volume.** `workoutLogs` stores exercise names, not muscles;
  joining against the catalog per session is a read-amplification problem for a
  number nobody asked for yet. Per-lift status and weekly set counts carry the
  analysis without it.
- **A UI surface.** The block reaches the user through Coach and the Sunday
  review, which is the point of it. A Progress-screen panel is a real idea, but
  it is not this phase.
- **Check-in data in the deload call.** Sleep, soreness and energy are the
  natural second input, and they are exactly what Phase 3 ingests properly.
  Wiring the 1–5 self-reports in now would mean rewriting it in a fortnight.

---

# The original Phase 1 design

Three deliverables, in dependency order: **push infrastructure** (new subsystem),
**the weekly review loop** (mostly wiring of things that exist), and **server-side
nudges** (a port of logic that already exists client-side). Plus the guardrails that
keep initiative from curdling into spam.

## 1. Push infrastructure

The only genuinely new subsystem. Everything else in this phase is plumbing between
rooms we already built.

**Transport.** Recommend a single FCM HTTP v1 send path for both platforms: install
the Firebase SDK on iOS so `@capacitor/push-notifications` yields an FCM token there
too, and Convex signs one kind of request. The alternative — raw APNs HTTP/2 with a
JWT from the .p8 key alongside FCM for Android — avoids the Firebase dependency at the
cost of two send paths and two failure modes. One path. We have enough failure modes.

**Schema.**

```
pushTokens: {
  userId, token, platform: "ios" | "android",
  createdAt, lastSeenAt, failedAt?,   // pruned after repeated FCM rejections
}
coachTouches: {
  userId, kind: "weekly_review" | "missed_log" | "training_lapse",
  sentAt, dateKey,                     // dedupe + frequency-cap accounting
}
```

**Server.** `convex/push/` with an internal `send` action: resolve tokens → mint the
FCM OAuth token (cache it; it lives an hour) → send → prune tokens FCM reports dead.
Every coach-initiated send goes through one `sendCoachTouch` wrapper that checks, in
order: master toggle, per-category toggle, quiet hours, the frequency cap (≤3
coach-initiated touches per rolling 7 days, weekly review exempt since the user opted
into it explicitly), and records the `coachTouches` row. No caller gets to skip the
wrapper.

**Client.** Registration on app start after notification permission (we already
request it for local reminders in `apps/mobile/src/lib/reminders.ts` — reuse that
consent moment, don't create a second begging screen). Tap-through deep links into the
relevant moment or Coach, using the existing deep-link handling.

**Timezone.** Crons run in UTC; users do not. Persist an IANA timezone on
`userPreferences`, updated opportunistically from the client on app start. Every
scheduled feature below selects users by *local* time from an hourly cron.

## 2. The weekly review loop

The centerpiece. Sunday evening, the coach reads the week and shows up Monday with a
short report and concrete, approvable adjustments — which is 80% of what a $200/month
online coach actually does, minus the motivational typos.

**Trigger.** Hourly cron in `convex/crons.ts` → `internal.ai.weeklyReview.enqueueDue`:
select users whose local time just crossed Sunday 18:00, who were active in the last
14 days, and who haven't got a review for this ISO week yet. Fan out via the scheduler,
one action per user, so one user's failure doesn't take down the batch.

**Pipeline per user** (`convex/ai/weeklyReview.ts`):

1. Load context through `buildCoachWorkspace` — same single source, same privacy gate,
   same allergy exception, same budget. No side-channel context. Ever.
2. Run the model with a new `coach_weekly_review.yaml` prompt (registered alongside
   the others, compiled into `prompts.generated.ts`): produce a compact report
   (wins, slips, one focus for next week — the existing brevity budgets apply) plus
   zero or more **proposed operations** in the existing operation union from
   `packages/models/src/coach.ts`. The prompt's standing rule that operations require
   an explicit user request is relaxed *only* here, and only into proposals — nothing
   is applied.
3. Store in a new `coachReviews` table: `{ userId, weekOf (Monday-normalized, reuse
   mondayOf), report, proposedOperations, status: "pending" | "approved" | "partial"
   | "dismissed" | "expired", requestId }`. Idempotent via the existing
   `claimRun`/`finishRun` machinery keyed on `requestId`.
4. `sendCoachTouch` with kind `weekly_review`. If the user has push disabled, the
   review still exists and surfaces as a moment on next open — push is the doorbell,
   not the house.
5. Provider failure → skip silently this week. No fallback-generated review; a
   templated "great week!" is worse than absence, and the user never knew it was
   coming.

**Client.** A `weekly-review-moment` in `apps/mobile/src/components/moments/`,
following `weekly-report-moment.tsx`'s structure: report first, then each proposed
operation as a card with the existing summary/assumptions/warnings treatment and
approve/dismiss per item. Approval calls the existing `applyApproved` executor —
confirmation flow, action events, undo payloads all come along for free. Reviews
expire after 7 days (superseded by the next one) so nobody approves a stale deload
in October.

**Quota.** Proactive runs must not consume the user's chat quota — charging someone
10 free messages a month for being checked on is a cancellation flow with extra steps.
New `aiUsage` kind `weekly_review` with its own internal budget, gated on Pro after
the trial-shaped grace period product decides on.

## 3. Server-side nudges

`missedLogTrigger` and `trainingLapseTrigger` in `apps/mobile/src/lib/moments.ts` are
already pure functions with the right humility built in (habit thresholds, grace
periods, rest-day awareness). Move them to a shared package (`packages/models` or
`convex/lib`) so client and server evaluate identical logic — the client keeps
rendering the moment; the server gains the ability to knock.

Hourly cron → evaluate due users (local-time clamps already live in the trigger
logic) → dedupe through `momentEvents`, which is already server-side and keyed
per user+event+key precisely so things don't replay — this is the rare case where
past-us left a gift — → `sendCoachTouch` → push deep-links into the existing moment
UI. The nudge copy stays templated and deterministic; no LLM call to tell someone
they haven't logged dinner.

## 4. Guardrails

- **Settings surface:** master "Coach can reach out" toggle, per-category toggles,
  quiet hours (default 21:30–08:00 local). Respect these in `sendCoachTouch`, not in
  N call sites.
- **Frequency cap:** ≤3 nudges per rolling 7 days, enforced centrally via
  `coachTouches`.
- **No autonomous writes.** Everything the review proposes waits for a tap. The undo
  system stays load-bearing.
- **Kill switch:** `COACH_PROACTIVE_ENABLED` env gate checked at the top of every
  cron entry point, same pattern as `AI_PROCESSOR_APPROVED`.
- **Privacy:** workspace gate applies unchanged; a user with personalized insights
  off gets a review built from the same reduced workspace the chat sees.

## 5. Rollout

1. Push infra behind the env gate; dogfood registration, delivery, token pruning,
   deep links on both platforms.
2. Weekly review for internal accounts for two Sundays; read every generated review
   before letting it near a stranger.
3. Enable weekly review generally; watch approval/dismissal rates on
   `coachReviews.status` — a dismissal rate over ~40% means the proposals are noise
   and the prompt goes back in the shop.
4. Server-side nudges last: they are the easiest to build and the fastest way to
   teach users to swipe away everything we send, so they ship only after the review
   loop has proven the coach is worth hearing from.

## Open decisions

- FCM-only vs FCM+direct APNs (recommendation above: FCM-only).
- Exact free/Pro gating for the weekly review.
- Whether trainingLapse nudges pause automatically when a `coachWeeklyPlans` entry
  declares a deload week — probably yes, and cheap once both live server-side.
