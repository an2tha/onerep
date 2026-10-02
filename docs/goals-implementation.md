# Goals implementation

The existing `/progress` destination is now labeled Goals in web and native navigation. Existing deep links and body, nutrition, training, health and exercise-library views remain available. Logging rings live in a disclosure and describe logging activity rather than goal attainment.

## First visit and setup

After account preferences load, a four-step modal dims the app and introduces Goals, the evidence, adjustment principles, and goal selection. The user can choose muscle building, fat loss, recomp or endurance. Saving and “Explore first” persist introduction completion in `userPreferences`; closing without saving dismisses it for the current visit. Replay and editing remain available. The legacy automatic Progress tour is suppressed on this route to avoid overlapping introductions, but can still be opened manually.

Goal setup saves the focus, followed muscle and personal weekly direct-set range. Nutrition programme setup now uses that focus to suggest a calorie direction and macro targets for review. Saving a goal alone does not change an active programme or routine. The guide opens Nutrition programme setup directly and also links to Training and Endurance. See nutrition-programmes.md for defaults and replacement behavior. Main app onboarding now ends with “What’s next?” after review and consent, with all existing save behavior retained.

## Whole-body assessment

The main display now uses the whole-body assessment described in [goal-assessment.md](goal-assessment.md). It combines training across all tracked muscle groups, spacing between sessions, sleep, resting heart rate, HRV, steps and comparable lift performance. Nutrition, activity, body and journal context informs review suggestions where the available logs support them. Data coverage and the unvalidated nature of the composite remain explicit.

The chosen muscle range is one input, not the overall goal score. Its editable 8 to 12 default is a product starting suggestion. Other muscles use historical workload references, which are not established physiological optima. Range values remain validated on the server. No new analytics events, external AI calls or data-sharing paths were added.

## Verification and limits

- Unit coverage: range boundaries, invalid bounds, history conversion, warmups and date windows.
- Convex integration coverage: account isolation, persistence, skipping, invalid updates and unchanged calorie targets.
- Browser fixture coverage: first visit, guide progression, invalid input, save, editing, endurance view, replay, save failure/retry, keyboard dismissal and focus restoration at phone and desktop sizes. Fixtures exercise the production Goals view with an in-memory save adapter, not a deployed account.
- Type checking, localization-catalog checks and the development bundle build pass. Production build configuration requires a production Convex deployment; this workspace is configured for development.
- Existing navigation translations were updated. New handbook and guide strings have English fallbacks in the other language catalogs and still need translation review.
- Backend/schema changes require the normal Convex deployment process. No remote deployment was performed.
