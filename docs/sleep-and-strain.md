# Sleep, strain, and Coach sleep mode

Sleep lives at `/health/sleep`; strain at `/health/strain`. Both are reachable from Health. The existing Recovery score remains distinct. `/coach?sleep=1&sleepDate=YYYY-MM-DD` opens the selected waking day's context with the animated night sky. Coach can also return `sleepMode: true`; sleep-related user messages activate the atmosphere immediately. Exit turns it off; new conversations reset it. Motion pauses when hidden and respects reduced-motion preferences.

## Measurement contract

Sleep uses version 2 duration goal progress: `round(clamp(mainSleepMinutes / datedGoalMinutes * 100, 0, 100))`. When a usable main-period duration is absent, legacy total duration supplies the comparison. A positive recorded sleep duration is required; missing or zero-duration readings return no sleep result. All displayed nights use this same duration-only method. The chart keeps the full duration above the goal, while additional sleep is reported separately. Stages, awake time, efficiency, and timing never change the percentage. This is an explainable OneRep goal comparison, not a validated clinical score or a measure of sleep quality, physiological sleep need, or readiness to train. The unchanged strain estimate remains version 1. [CDC sleep guidance](https://www.cdc.gov/sleep/about/) informs the editable 7–10 hour goal range; it does not validate this algorithm. [AASM's consumer sleep technology statement](https://aasm.org/advocacy/position-statements/consumer-sleep-technology/) informs the limits around wearable stage interpretation.

The usual range uses the preceding 28 calendar days, excluding the selected night and future readings. It requires at least seven positive main-duration readings from the same source. The baseline is their median; the range uses sorted values at `floor((n - 1) * 0.25)` and `ceil((n - 1) * 0.75)`, an interquartile range without interpolation. A usual range does not establish sufficient sleep. Source means the recorded provider platform, such as Apple Health or Health Connect, or a manual duration override. It does not identify the underlying watch or hardware. The interface reports source and coverage changes without changing the calculation.

Awake time, recorded efficiency, stage totals, and timing differences are descriptive. Efficiency is main duration divided by main duration plus recorded awake time. Timing comparison needs seven prior timed nights from the same source within the same 28-day window and uses circular clock differences. Stage totals exceeding main duration by more than the five-minute tolerance are excluded. Available-reading keys describe coverage; the legacy confidence field remains for older clients. Missing measurements remain unavailable. Manual duration corrections discard incompatible native detail until released back to sync.

Seven-day shortfall is the sum of positive differences between each recorded main duration and that night's dated goal across the selected waking day and its six preceding calendar days. It can include different provider sources, counts only recorded nights, and leaves missing nights unknown. A longer night contributes zero shortfall, never credit against another night. This is a goal comparison, not a repayment target.

Duration goals are effective from tomorrow's waking day in the user's last active timezone, with UTC as the fallback. The first preference save preserves the prior legacy goal as the initial anchor, or 480 minutes when none exists. Goal history resolves the latest effective change on or before each date, so later changes do not regrade earlier nights. Repeated changes for the same effective date update that date's goal. Optional bedtime and wake time are current planning guides, can be cleared, and do not affect the percentage. Their dashed guides still represent the current plan when viewing historical nights.

Native imports preserve timestamps and local clock times. iOS groups asleep samples separated by at most three hours and attributes the group to its waking day. Android unions session spans and removes recorded awake intervals. The longest sleep period per waking day is the main period; additional periods are reported separately. These grouping rules are estimates for split sleep, not a claim about a person's intended schedule. Stage proportions are displayed as totals, never presented as a hypnogram when chronological stages are unavailable.

Strain combines physiological demand (55%) and training load (45%), with available-weight redistribution. Native integrations deduplicate heart-rate samples into minute buckets and remove recorded workout intervals. At least 120 sampled minutes enables the cardiac estimate; otherwise active energy less known workout energy, or steps, provides a low-coverage fallback. Unknown gaps stay unknown. Training uses recorded zone time or duration × effort, with a strength-set contribution. Missing effort is explicitly estimated. Linked sessions and identifiable OneRep writebacks are reconciled. Imported workout energy is retained on the merged training session. Steps and active energy are never added together. Unidentified duplicates and incomplete workout permissions can still limit attribution; low data coverage is visible.

High strain is demand, not an achievement. Recovery remains a separate comparison with the user's history. No score establishes mental stress, illness, or causation.

## Sleep detail and Today

Sleep detail leads with duration against the dated goal, the usual range when available, and source/date/coverage context. The visible history chart offers 7 or 28 calendar days, keeps missing dates as gaps, and exposes an individual-night list for selection. Timing is visible; measurement calculations and wearable stage totals are optional disclosures. The goal and planned times have an actionable save flow with pending, success, and retryable error feedback.

Today uses the same shared presentation from `@repo/ui/sleep`, with portable contracts in `packages/models/src/sleep-insights.ts` and thin app adapters. Summary order and hidden choices are saved in user preferences for sleep, training, nutrition, and check-in. Moving a summary first pins it first; all summaries may be hidden while customization stays available. The default shows sleep. A latest-recorded-night fallback explicitly identifies its date when the selected day has no reading. Today uses the active semantic theme; sleep detail retains its night atmosphere.

The deterministic connected review covers the selected day and six preceding calendar days. It exposes recorded sleep counts and dated-goal comparisons, training sessions and minutes, days with food entries, and the selected day's daily check-in. Food entries do not establish complete intake, and missing check-ins leave feelings unknown. Training limits are disclosed when the bounded history read may be incomplete. The latest session is chosen by date and then start time, not imported-versus-logged array order; if multiple sessions share the latest date and any lacks a usable start time, no latest session is named.

Connected observations describe co-occurrence, never causation, and never automatically change a plan. They provide review links to the existing sleep, training, food, and check-in flows. Current-day sleep focus can suggest tonight's action. Historical focus uses retrospective language, and its plan link explicitly edits the current plan. Historical connected observations ask the user to use current readings and how they feel now for today's decisions.

## Reviews and data lifecycle

Rules-based insights are always available. AI reviews use a nightly snapshot, history, current goals, check-ins, strain, recovery, and the prior review. The manual action uses the existing AI allowance and provider. Automatic reviews are opt-in and run after device sync, with one shared claim per user/night, a pending lease, and a six-hour automatic refresh cooldown. New inputs mark old reviews stale; the manual action can refresh them. Errors remain visible and retryable. A crashed pending job becomes retryable after two minutes.

Scores and tips never depend on AI availability. Coach receives bounded sleep context only when personalized insights are enabled. Sleep preferences, dated goal history, and reviews are included in account export and deletion. Today summary settings are carried by user preferences.

Deploy Convex functions and schema with the frontend. The richer native fields require new iOS/Android binaries; existing binaries still provide partial-data scores. Automatic review availability follows device sync, not a midnight timer. The histogram measures sampled minutes rather than interpolating continuous monitoring from sparse watch measurements.

## Verification

`bun test convex/lib/__tests__/sleepStrain.test.ts`

`bunx vitest run --config convex/vitest.config.ts convex/__tests__/sleep.convex.test.ts convex/__tests__/healthMetrics.convex.test.ts`

`bunx tsc -b apps/mobile`

Android Kotlin compilation uses JDK 21. iOS changes should be built with Xcode and exercised against real HealthKit data before a store release.
