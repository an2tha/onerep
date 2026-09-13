# Sleep, strain, and Coach sleep mode

Sleep lives at `/health/sleep`; strain at `/health/strain`. Both are reachable from Health. The existing Recovery score remains distinct. `/coach?sleep=1&sleepDate=YYYY-MM-DD` opens the selected waking day's context with the animated night sky. Coach can also return `sleepMode: true`; sleep-related user messages activate the atmosphere immediately. Exit turns it off; new conversations reset it. Motion pauses when hidden and respects reduced-motion preferences.

## Measurement contract

Version 1 scores are transparent OneRep wellness estimates, not validated clinical measures. Constants and saturation curves are product heuristics, covered by tests and exposed through score explanations. [CDC sleep guidance](https://www.cdc.gov/sleep/about/) informs the editable 7–10 hour goal range; it does not validate this scoring algorithm. [AASM's consumer sleep technology statement](https://aasm.org/advocacy/position-statements/consumer-sleep-technology/) informs the limits around wearable stage interpretation.

Sleep weights are duration 40, continuity 25, stage pattern 20, and timing consistency 15, redistributed among available components. Confidence measures available evidence, independently of score. Stage comparisons require seven previous staged nights from the same provider; timing comparisons require seven timed nights. Future readings do not enter baselines. Excess sleep is not automatically penalized. Device stage totals exceeding recorded sleep are excluded. The main sleep period is scored separately from additional sleep when the native provider supplies that distinction. Legacy duration-only readings continue to work. Manual duration corrections discard incompatible native detail until released back to sync.

Native imports preserve timestamps and local clock times. iOS groups asleep samples separated by at most three hours and attributes the group to its waking day. Android unions session spans and removes recorded awake intervals. The longest sleep period per waking day is the main period; additional periods are reported separately. These grouping rules are estimates for split sleep, not a claim about a person's intended schedule. Stage proportions are displayed as totals, never presented as a hypnogram when chronological stages are unavailable.

Strain combines physiological demand (55%) and training load (45%), with available-weight redistribution. Native integrations deduplicate heart-rate samples into minute buckets and remove recorded workout intervals. At least 120 sampled minutes enables the cardiac estimate; otherwise active energy less known workout energy, or steps, provides a low-coverage fallback. Unknown gaps stay unknown. Training uses recorded zone time or duration × effort, with a strength-set contribution. Missing effort is explicitly estimated. Linked sessions and identifiable OneRep writebacks are reconciled. Imported workout energy is retained on the merged training session. Steps and active energy are never added together. Unidentified duplicates and incomplete workout permissions can still limit attribution; low data coverage is visible.

High strain is demand, not an achievement. Recovery remains a separate comparison with the user's history. No score establishes mental stress, illness, or causation.

## Reviews and data lifecycle

Rules-based insights are always available. AI reviews use a nightly snapshot, history, current goals, check-ins, strain, recovery, and the prior review. The manual action uses the existing AI allowance and provider. Automatic reviews are opt-in and run after device sync, with one shared claim per user/night, a pending lease, and a six-hour automatic refresh cooldown. New inputs mark old reviews stale; the manual action can refresh them. Errors remain visible and retryable. A crashed pending job becomes retryable after two minutes.

Scores and tips never depend on AI availability. Coach receives bounded sleep context only when personalized insights are enabled. Sleep preferences and reviews are included in account export and deletion.

Deploy Convex functions and schema with the frontend. The richer native fields require new iOS/Android binaries; existing binaries still provide partial-data scores. Automatic review availability follows device sync, not a midnight timer. The histogram measures sampled minutes rather than interpolating continuous monitoring from sparse watch measurements.

## Verification

`bun test convex/lib/__tests__/sleepStrain.test.ts`

`bunx vitest run --config convex/vitest.config.ts convex/__tests__/sleep.convex.test.ts convex/__tests__/healthMetrics.convex.test.ts`

`bunx tsc -b apps/mobile`

Android Kotlin compilation uses JDK 21. iOS changes should be built with Xcode and exercised against real HealthKit data before a store release.
