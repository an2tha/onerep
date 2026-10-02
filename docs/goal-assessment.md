# Whole-body goal assessment, version 1

Goals now uses the authenticated `progressInsights.goals` query and the deterministic `buildGoalAssessment` engine. It reads a bounded 28-day window of the user's workout logs, exercise metadata, health readings, imported activities, food logs, measurements, journal and active recovery plan. No external model receives these records. The existing goal and nutrition programme remain the source of the user's selected focus and targets.

## What the score means

The score describes support for the current plan, not measured hypertrophy, tissue recovery, injury risk or a physiological optimum. Its weights and thresholds are product heuristics. No cited study validates this composite. The interface names unknown inputs and shows the calculation rather than presenting a narrow biological tolerance band.

| Factor | Maximum weight | Calculation |
| --- | ---: | --- |
| Training | 35% | Mean range match for assessable muscle groups. The chosen muscle uses its direct-set target. Other groups need training in at least two of the preceding three weeks; their reference is 80–120% of the median weekly workload. Coverage is reduced in proportion to ungraded groups. |
| Muscle spacing | 10% | Repeated work of at least five weighted sets on consecutive dates triggers review, especially alongside poor recovery. Calendar days since work are shown without claiming a muscle is recovered. |
| Sleep | 20% | At least two readings in the last three days; seven hours is a general reference. A 45-minute decline against the earlier median reduces the score. |
| Recovery | 20% | Recent resting heart rate and HRV relative to an earlier baseline from the same provider. Seven baseline readings and two recent readings are required. A 5% RHR rise or 10% HRV drop triggers review. |
| Daily activity | 5% | At least four completed days of steps against an earlier baseline. Large changes prompt review; more steps do not earn more points. |
| Lift performance | 10% | At least four sessions per lift with comparable reps and effort. Changes use estimated strength from weighted sets of 1–15 reps. Maintaining performance is a positive result during a deficit. |

Overall scoring requires at least 70% weighted coverage, training data, and sleep or recovery data. Missing inputs are excluded, remaining weights rescaled, and the score rounded to five points. Under six hours of recent sleep, or multiple adverse signals, caps it at 60. Under five hours caps it at 40. Active recovery or a profile requiring individual care pauses the score. These cutoffs are conservative review prompts, not clinical thresholds.

All 15 standard catalog muscle groups remain visible; extra mapped groups are included. Missing logs do not imply neglect. Completed working sets count, warmups do not. Muscle aliases are deduplicated, and indirect work contributes half a set to historical comparisons. This weighting is an estimate of involvement, not a direct measurement of stimulus. RIR/RPE and near-failure sets are exposed separately.

For endurance, the training factor compares recorded exercise minutes with the preceding week. The interface explains that intensity and terrain differ. This is a coarse workload comparison, not a sport-specific fitness or race-readiness model.

## Suggestions and contextual inputs

Suggestions rank recovery concerns first, then declining performance, abrupt workload increases, food-log review, and lower-priority activity changes. A suggestion to add one set requires sufficient coverage, comparable nondeclining performance, no recovery warning and a complete analysis window. It is conditional on the user feeling recovered and confirming the gap was unplanned.

Food logs have no complete-day marker. Low logged protein therefore prompts checking the log before changing meals; it does not reduce the score. The current programme's protein target takes precedence over profile estimates. Weekly weight change requires three weigh-ins in each week. Sleep stages, journal entries and alcohol provide context, not scored physiological claims. Caffeine plus short sleep prompts reviewing timing, which the app cannot infer.

Today's partial steps are excluded. Imported activities explicitly linked to training logs, dismissed activities, and repeated external IDs are excluded from imported exercise minutes. Unlinked duplicate recordings may still overlap. Manual HRV and cross-provider HRV comparisons are excluded because Apple Health SDNN and Health Connect RMSSD are different measures.

The query limits workouts and imported activities to 241 records, measurements to 85, and exercise metadata to 160 IDs. If a limit indicates an incomplete window, training, spacing and lift-performance scores are withheld and volume changes are not suggested. Catalog lookups for custom exercises enforce ownership.

## Evidence and limitations

- [Saw et al., systematic review of athlete monitoring](https://pubmed.ncbi.nlm.nih.gov/26423706/): subjective responses matter and often respond more consistently than commonly used objective measures. A sensor score cannot override symptoms or perceived recovery. The current app lacks a consistent soreness/fatigue questionnaire, so the model does not invent one from mood.
- [Walsh et al., athlete sleep consensus](https://bjsm.bmj.com/content/55/7/356): sleep needs vary, supporting individual history and practical sleep review rather than a universal ideal.
- [Training-load monitoring framework](https://bjsm.bmj.com/content/51/20/1451): training response should be interpreted using several measures and context.
- The project's hypertrophy, deficit/recomp and endurance evidence reviews describe the wider evidence. A person's previous workload is a reference for change, not proof of an optimal hypertrophy dose.

Wearable measurements, incomplete logs, effort estimates, exercise substitutions, rep technique, illness and life stress can all affect interpretation. The model deliberately does not infer local tissue recovery from systemic HRV, fat loss from logged calorie totals, or muscle growth from weight alone.

## Verification

Pure-engine tests cover all groups, missing/stale readings, provider changes, manual HRV, warmups, muscle aliases, duplicate activities, incomplete food logs, poor recovery overrides, performance decline and bounded-window withholding. Convex tests cover authentication and account isolation. Browser fixtures cover onboarding, saving, error recovery, disclosure keyboard behavior, reduced motion, poor recovery and empty data at phone and desktop widths.
