# Goal-aware Progress: product and implementation proposal

25 September 2026. Based on inspection of the current app and the research reviews for [hypertrophy](./hypertrophy-evidence-review.md), [deficits and recomp](./deficit-and-recomp-evidence-review.md), and [endurance](./endurance-evidence-review.md).

Status: proposed design and implementation plan. No app behavior, targets, routines, or backend schema has been changed. Source inspection informed this proposal; the proposed interface has not been implemented or tested with users.

## Recommendation

Make Progress answer three questions: **Is my current approach working? What observations support that? What should I do next?**

Add a goal-aware review at the top of the existing Progress page. Keep Body, Nutrition, Training, Health, and Library as the detailed views beneath it. Add context-sensitive entry points in Nutrition and Workouts where someone can act on the review.

The primary experience should be a short explanation supported by visible trends. A single combined readiness percentage or moving “optimal growth zone” would imply a validated model the research does not supply.

The first release should also revise existing heuristics that would contradict this approach. Merely adding careful new guidance above stronger old claims would leave users with conflicting advice.

## Existing foundations and problems to address

| Existing implementation | What we can reuse | What needs attention |
|---|---|---|
| [Progress page](../apps/mobile/src/pages/Progress.tsx) | Five detail tabs, body editing, existing data queries and navigation | The main hero emphasizes “days kept,” which records logging activity rather than the outcome the user cares about. Promote goal progress above it; retain logging coverage as secondary information. |
| [Progress summary](../apps/mobile/src/lib/progress-summary.ts) | Food, workout, and body summaries | Current nutrition comparisons use one current calorie/protein target for past days. Some body trends use first/last readings with differing periods. Comparisons need date-specific targets and explicit aligned windows. |
| [Muscle volume](../apps/mobile/src/lib/muscle-volume.ts) and [history adapter](../apps/mobile/src/lib/exercise-history.ts) | Primary/secondary muscle mapping and fractional counting | The adapter retains completion but drops set type, so this path cannot exclude warm-ups. It calls the weighted result “effective sets.” Preserve set metadata and show direct/indirect work as estimates. |
| Same muscle module | Last training date | “Trained,” “recovering,” and “overdue” follow elapsed-day rules, not measured recovery. Replace physiological implications with “Last trained Tuesday” and planned schedule context. |
| [Programming analysis](../convex/lib/programming.ts) | Pure computations, working-set filtering, lift history | e1RM and recent-best comparisons do not establish hypertrophy or a need to deload. Comparisons do not use logged RIR/RPE. A cut or changed rep range can alter interpretation. |
| [Training insights panel](../apps/mobile/src/components/training-insights-panel.tsx) | Visible evidence that also reaches Coach | “A lighter week is due,” “Recovered,” and “Under-recovered” overstate what the inputs establish. Use observations and conditional suggestions. |
| [Nutrition programmes](./nutrition-programmes.md) and [planning rules](../convex/lib/nutritionProgramme.ts) | Dated programs, existing targets, preview and undo flows | The current `75 - calorieReductionPercent - fastingPenalty` ceiling is not a validated training limit. Remove its authority to label a workout too demanding or choose how many sets to remove. |
| [Workout validators](../convex/lib/workoutValidators.ts) | Completed sets with optional RIR/RPE, cardio distance/duration/HR/zones/source | Normalize client string values and legacy entries. Missing effort stays unknown. HR zones need definitions before cross-provider comparison. |
| [Endurance page](../apps/mobile/src/pages/Endurance.tsx) and health imports | Sport selection, sessions, duration, distance, pace/HR when available | No reliable session-linked food intake or complete power-based analysis is established by the inspected contracts. Start with supported fields. |
| [Body schema](../convex/schema.ts) and health metrics | Tape measurements, weight, optional lean-mass estimates, sleep/HRV/RHR and source | Preserve method/source, recency, and uncertainty. Imported and promoted workouts must not count twice. |
| Recovery episodes, planned rest, journal, Coach goals | Illness context, deliberate rest, existing commitments and notes | Reuse these rather than inventing a separate compulsory daily wellness questionnaire. The existing `dailyCheckIns` table only has user/time fields; it is not already a usable fatigue-history model. |

These are code observations, not claims that a user has experienced a particular problem. Validate impact in the implementation and UX review.

## Interaction structure

Three possible placements were considered:

| Approach | Benefit | Cost | Decision |
|---|---|---|---|
| A new Hypertrophy tab | Easy to discover for lifters | Fragmented advice, crowded navigation, poor fit for cutting and endurance | Do not add another top-level tab |
| Only put advice in Coach | Flexible explanation | Users must ask, trends remain hard to inspect, core value depends on AI availability | Keep Coach as optional explanation and planning support |
| A goal-aware review above existing Progress detail | Unifies evidence while preserving familiar logging and detail | Requires shared calculations and a clear priority model | Recommended |

Use the app's existing typography, accents, sheets, grouped rows, and chart language. Prefer a short narrative and aligned rows over four equal score cards. Status must remain understandable without color. Keep the outcome and next action visible on a narrow phone before secondary data.

### Choosing a focus

Use friendly entry presets: **Build muscle**, **Lose fat**, **Recomp**, **Endurance**, and **Maintain**. A short sheet asks only for what is needed: priority, start date, and optionally a review date. Endurance can additionally ask sport and event date. Muscle priorities and preferred tracking can be optional follow-ups.

Internally keep performance priority separate from weight intention. An endurance athlete can also want fat loss; a muscle-focused user can be maintaining weight. The preset initializes this configuration, not a rigid exclusive identity. If goals compete, ask which has priority and make that visible, for example “Half-marathon performance first; gradual fat loss second.”

Suggest a focus from existing goals, but require the user's selection before recording it. Opening Progress must not silently start a deficit, change macros, or assign a new routine. Existing nutrition programs remain the owner of nutrition targets. Coach goals remain task commitments, not a second phase model.

Existing users can skip choosing and keep ordinary Progress. Later switching focus creates a dated transition so old weeks retain their original meaning. Recovery mode temporarily suppresses progression and restriction prompts without erasing the focus or history.

### Main screen

Illustrative content below is hypothetical, not actual user data:

```text
Progress
Build muscle · Started 2 September             Change
Last 4 weeks                                    Dates

Your current training is progressing
Bench repetitions increased at the same load.
Your chest workload has stayed consistent.

Chest working sets                 10 direct/week
Bench at 60 kg                     8 → 10 reps
Logged protein                     View 5 logged days
Sleep                              Fewer readings this week

Continue your current plan
You do not need to add sets while this is working.

See the observations                         Why this advice?

Body | Nutrition | Training | Health | Library
```

The screen should have one lead conclusion and at most one main proposed change. “Continue” is a useful outcome, not an empty state. Keep data coverage visible beside the relevant measurement rather than hiding it in one generic confidence percentage.

“See the observations” opens the supporting dates, sessions, measurements, and comparison assumptions. “Why this advice?” opens a brief explanation with evidence strength and paper links. Neither requires a chat request.

### What each focus emphasizes

| Focus | Lead observations | Appropriate interpretation | Example next action |
|---|---|---|---|
| Build muscle | Muscle-specific working sets; comparable lift performance; optional RIR; protein context | “Training performance is improving.” Do not claim measured muscle growth from lifts. | Continue, or review a specific muscle's workload after persistent stagnation and good tolerance |
| Lose fat | Smoothed weight direction/rate, waist, performance, hunger/fatigue | Stable lifting while weight/waist fall can be successful. Intake versus target is not a measured energy deficit. | Continue, check incomplete logs, or review the pace of loss |
| Recomp | Longer-term weight/waist and comparable performance together | “These trends are consistent with your goal.” Flat weight alone is not failure. | Continue observation or review training/nutrition after a meaningful block |
| Endurance | Sport-specific consistency, duration, long-session history, comparable pace/HR or tests, fueling practice | More volume, lower weight, or a wearable VO2 estimate alone does not establish better performance. | Practice a fueling plan, review a workload change, or prepare an event-specific taper |
| Maintain | Stable chosen outcomes, sustainable routine, capacity to perform desired activities | No demand to lose weight, train more, or set new records | Continue or adjust around life changes |

A muscle detail view can show a **chosen weekly workload range** and the user's history. Label it “Your plan,” explain direct/indirect counting, and never call it the experimentally determined optimum. Sleep should not move its boundaries by an invented number of sets.

### From review to action

`Progress observation → explanation → editable proposal → preview → apply → confirmation/undo → later review`

Keep action ownership in the existing surface:

- “Review chest training” opens the current routine/workout editor at the relevant exercises.
- “Review calorie targets” opens Nutrition with the existing program and target source visible.
- “Plan ride fueling” opens a session-specific plan linked to Nutrition and Endurance.
- “Review sleep” opens the current sleep view, not another sleep diary.
- “Discuss with Coach” passes the exact observations and their limitations to Coach.

A proposal states the current value, proposed change, scope, and reason. Changing one upcoming session is different from editing a routine template. No completed history is rewritten. If targets or routines changed after the proposal was generated, refresh the preview instead of applying stale values. Undo must respect intervening edits, using the pattern already present for workout adjustments.

## Minimum data and inference rules

All numerical eligibility rules here are provisional product rules for testing, not clinical thresholds. Keep them versioned and amend them if testing finds poor behavior.

| Signal | Initial eligibility | Permitted output |
|---|---|---|
| Weekly muscle workload | Completed working sets, recognized exercise mapping, known dates | Descriptive direct and indirect counts. Unmapped exercises and missing effort are reported as coverage limits. |
| Lift direction | At least three comparable sessions on distinct dates across at least two weeks | Describe observed performance. A stronger “persistent decline” suggestion needs repeated changes, not one lower e1RM. |
| Weight rate | At least three valid measurement days in each of two completed seven-day periods | Provisional difference of period averages; wider trends preferred. Avoid annualizing two isolated weigh-ins. |
| Nutrient totals | Any real entries | “Recorded intake,” with logged-day counts. A logged day is not necessarily complete. |
| Calorie-adjustment proposal | Meaningful multiweek outcome trend, verified target context, reasonably complete intake, and an eligible chosen goal | Invite review, not automatically change a target. Uncertain intake cannot support an exact estimated deficit. |
| Recomp interpretation | A longer window, initially at least six weeks with repeated waist/weight and comparable training observations | “Consistent with” or “not enough information.” Never “confirmed muscle gain.” |
| Endurance volume | Reconciled distinct sessions with sport/duration | Sport-separated descriptive history. Pace comparisons need suitable session and environment context. |
| Endurance intensity distribution | Known zone definitions/threshold source or explicitly labeled reported effort | Describe distribution in that system. Do not blend incompatible watch zones. |
| Sleep/HRV/RHR | Sufficient recent data and an appropriate personal baseline | Report the observed deviation and dates. Do not convert to workout capacity or diagnose overtraining. |

Additional rules:

- Missing values remain unknown. Do not backfill RIR, food intake, or personal targets from defaults to produce advice.
- Treat reduced training during illness, planned rest, travel, and taper as context, not automatic failure.
- Compare complete weeks fairly; the current partial week must not be described as a decline against a full week.
- Do not increase volume simply because it is below a literature-derived number. Start from the user's current productive plan.
- Keep stable strength positive or neutral during a fat-loss phase; do not prescribe a deload because there is no new best.
- Separate performance evidence from possible explanations. “Sleep was shorter” does not establish why the lift changed.
- Sensor observations may enrich the feature but are not required. People without a wearable receive a useful review.
- Honor existing habit/recovery/clinician modes and weight-data preferences. Do not expose calorie or weight prescriptions through this new surface when they are hidden elsewhere.
- Persistent health concerns should direct to appropriate assessment, not a REDs score or an automated “safe to train” verdict.

## Small additions to logging

**Strength:** Reuse existing RIR/RPE fields and make optional effort entry easier. Preserve warm-up type through all adapters. Do not demand extra fields for every set to unlock basic analysis.

**Weekly context:** Offer a short, dismissible check-in when it can resolve a real ambiguity: “How has training felt?”, “Has soreness affected a later session?”, and, when dieting, “How manageable has hunger been?” Reuse journal/recovery information already supplied. Answers are observations, not inputs to a new composite score. Store them with date and source; skipping is valid.

**Food completeness:** Optionally allow “This day's food log is complete.” Do not infer completeness from hitting calories, number of entries, or a perfect macro total. Retroactive edits mark the earlier confirmation stale. Users can still obtain descriptive progress without confirming days.

**Endurance fueling:** Add a session association to ordinary food/drink entries, with the option to identify when they were consumed. Existing `loggedAt` is entry time and cannot automatically be treated as consumption time. Link the same entry instead of making a second calorie-bearing copy. Plans are distinct from actual intake. Imported sessions with no fueling log show unknown, not “underfueled.”

## Architecture and integration

**One calculation path:** Extend the existing deterministic insight approach. Introduce a server-side goal-aware summary composed from pure functions, shared with Progress, Coach context, and weekly review. Avoid separate client and AI interpretations of the same evidence.

Suggested contract:

```text
ProgressReview
  focus and phase dates
  period and data cutoff
  observations[]: value, unit, dates, source, comparability, coverage
  interpretation: supported conclusion + limitations
  nextStep: continue | review_data | consider_change | recovery_context
  proposal: optional editable change with scope and expected current version
  evidenceRefs[]
  rulesVersion and input fingerprint
```

This is a bounded view model, not an unbounded array embedded in a user document. Computation should use indexed, bounded date windows, aggregate where needed, and report truncation rather than pretending the latest 120 workout logs cover everyone's selected period. Respect account timezone and exclude future records from baselines. Resolve missing catalogue mappings explicitly and never silently drop those sessions from coverage.

**New persistent data, only where necessary:**

- A dated `progressPhases` record for chosen priorities and review dates. One active phase, with retained historical periods and idempotent transitions.
- Dated optional progress-context answers, either a properly extended existing model or a small dedicated table. Do not reuse the current placeholder daily-check-in table as if it already had history.
- A review/action record if persistence is needed for dismissals, accepted proposals, and follow-up. Keep individual records indexed by user/date; do not grow arrays forever.
- Additive food-entry metadata for completeness/session association in the fueling release.

**Targets and history:** Reuse the effective-target resolver and nutrition program precedence. Audit historical correctness: today's custom targets/profile cannot reconstruct earlier values that were never stored. Add target-change history or daily resolved snapshots for future comparisons. Mark unavailable older targets as unknown rather than fabricating them. Program transitions, cycling, activity adjustments, and later edits must use the same rules in Nutrition and Progress.

**Deduplication:** Reconcile `healthWorkouts`, promoted training logs, and app writebacks using the existing linking/source identifiers. Keep per-sport attribution and provenance. Do not add an imported run twice just because it appears in two stores.

**AI:** The core review remains available without AI. Coach may explain, ask contextual questions, or draft a proposal, but arithmetic, data eligibility, source references, and mutation validation remain deterministic. An AI outage must not erase the observations or leave an unapplyable primary button. Existing personalization consent continues to control what is sent to Coach.

**Privacy and lifecycle:** Derive ownership from authenticated identity, apply existing authorization on every query/mutation, and include new records in account export/deletion. No sharing or new analytics collection is implicit in this plan. Cache invalidation must handle backfilled, edited, and deleted source logs.

## Delivery order

### Release 1: trustworthy interpretation with existing data

1. Correct working-set accounting and the overly strong muscle/recovery/deload labels.
2. Replace the nutrition-program workout ceiling with contextual guidance. Preserve explicitly requested lighter-session editing, but stop using the formula to determine physiological compatibility or the number of sets to delete. Continue honoring existing nutrition-care restrictions independently.
3. Add the focus selector and dated phase context without automatically changing any targets.
4. Introduce the Progress review using existing muscle, lifting, body, and nutrition data, with observational endurance summaries by sport.
5. Add evidence explanations, explicit date windows, coverage states, and goal-specific interpretation.
6. Feed the same versioned observations into Coach and weekly review. Resolve historical-target gaps before making retrospective target-adherence claims.

This release is useful without new devices, a new food diary, advanced forecasting, or a daily questionnaire.

### Release 2: editable recommendations and endurance fueling

1. Add optional context answers and food-completeness confirmation.
2. Introduce a small set of explainable proposals, initially continue, review workload, review loss rate, and review session fueling.
3. Add session-linked fueling plans/actual intake, event dates, and known zone definitions.
4. Complete previews, stale-data checks, mutation scope, undo, dismissal, and follow-up.

Do not infer an exact calorie deficit or use weight-loss advice to override an endurance-performance priority. Use existing eligibility modes before offering any calorie-changing action.

### Later, only after the foundations are reliable

Personal workload ranges derived from sustained history, richer pace/power comparisons with context, and longer-term evaluation of whether suggestions help. No prediction of grams of muscle gained, automatic REDs diagnosis, or optimization toward the largest tolerable workload.

## Acceptance and validation

Meaningful automated cases should cover:

- A cut with stable lifts and falling weight is not labeled a failed hypertrophy program.
- Flat weight alone does not prompt a calorie reduction in recomp.
- One poor workout or short night does not generate a deload or shrink a training band.
- Warm-ups are excluded; bodyweight and assisted exercises remain interpretable without requiring positive external load.
- Unknown exercise mappings, unknown RIR, partial food logs, stale measurements, and query truncation remain visible limitations.
- An imported endurance session promoted into the log counts once; fueling entries contribute calories once.
- Historical reviews use the correct dated focus and known targets. Missing target history stays unknown.
- Planned recovery/taper suppresses inappropriate inactivity or restriction messaging.
- An edited log invalidates stale advice; applying an old proposal cannot overwrite newer settings.
- No wearable, no AI access, and declined personalization still allow useful descriptive progress.
- Account ownership, deletion/export, timezone boundaries, and offline/retry behavior preserve the existing contracts.

UI validation should cover first use, skipped setup, long translated labels, mobile and desktop, large text, keyboard and screen-reader navigation, loading/error/retry, empty versus insufficient data, declined permissions, and edited/undone actions. Explain reduced certainty in text, not only color.

Test the prototype with realistic user tasks: identify whether a phase is working, locate the supporting observations, explain the uncertainty, and make or decline one change. Success is comprehension and appropriate action, not a higher logging streak or more interventions. Product testing does not clinically validate the advice engine; a claim that it improves physiological outcomes would require separate prospective research.

## Decisions made by this proposal

Progress is the main home; existing tabs and action surfaces remain. A chosen focus changes interpretation before it changes prescriptions. Existing unsupported formulas are corrected alongside new features. Evidence and missing information stay inspectable. Recommendations are optional, scoped, previewed, and reversible. Core calculations do not depend on AI.
