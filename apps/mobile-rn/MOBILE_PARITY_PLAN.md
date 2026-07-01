# OneRep React Native completion plan

This app is intended to replace the existing Capacitor mobile app with a native Expo/React Native product. The current app has the native shell, core screens, local persistence, and demo flows. The work below is the remaining parity and production-hardening backlog.

## Definition of done

The RN app is complete when it can be installed on iOS and Android, authenticated with the production identity provider, read/write all user data through Convex, survive offline use with reliable sync, and cover the old app's food, workout, progress, onboarding, and settings flows without relying on demo-only state.

## Phase 1 — Foundation and production shell

- Replace the local auth shell with Clerk Expo auth.
- Add a protected navigator that blocks product screens until auth and initial user bootstrap complete.
- Add ConvexProviderWithAuth for React Native and remove direct screen dependence on seeded state.
- Keep AsyncStorage as an optimistic cache, not as the source of truth.
- Add app-level error boundary, crash-safe fallback UI, and screen-level retry states.
- Add loading, empty, and offline states to every screen.
- Add native app icons, splash screen, deep link scheme, and EAS build profiles.

## Phase 2 — Sync architecture

- Introduce a repository layer with local cache + Convex live data adapters.
- Promote `src/data/offlineQueue.ts` from a primitive queue into a typed mutation journal.
- Add retry, backoff, conflict handling, and queue-flush lifecycle hooks.
- Add a visible offline/sync status indicator.
- Add tests for queue serialization, replay ordering, and conflict resolution.

## Phase 3 — Auth and account

- Implement sign in, sign up, SSO callback, email verification, reset password, sign out, and session refresh.
- Add account deletion and user-data export workflows.
- Add analytics opt-in/out and privacy controls.
- Add native secure token storage.

## Phase 4 — Nutrition and food logging

- Replace seeded catalog search with OpenFoodFacts + backend-backed recent foods.
- Add a food detail page with portions, serving sizes, macros, micros, nutrition score, and NOVA details.
- Add editable food log entries, meal-category support, day navigation, and delete confirmations.
- Add barcode lookup with fallback search.
- Add AI snap upload, food detection review, gram adjustments, multi-item review, and AI access gating.
- Add recipe ingredient search, serving scaling, edit/delete/duplicate recipes, and recipe detail pages.

## Phase 5 — Hydration and supplements

- Add day navigation and editable water entries.
- Add hydration reminders using native notifications.
- Add supplement categories, schedules, forms, nutrient details, serving parsing, consistency tracking, and editable/deleteable supplement items.
- Include supplement nutrients in daily micronutrient summaries.

## Phase 6 — Workouts

- Add full preset creation/editing: exercise search, reorder, supersets, set types, unilateral tracking, RPE, rest timers, and delete/archive.
- Persist active workout sessions through app restarts.
- Add resume, abort, complete, and conflict recovery flows.
- Add previous-set history, exercise PRs, volume tracking, muscle recovery, workout calories, cardio details, route details, notes, and plate/bar helpers.
- Add Apple Health write support for completed workouts where available.

## Phase 7 — Progress

- Add multi-metric body tracking, body photos, photo storage, rolling averages, goal-aware insight cards, AI progress analysis, and edit/delete measurement support.
- Add charts that support long histories and multiple metrics.
- Add export/share support.

## Phase 8 — Onboarding and personalization

- Rebuild the full health-profile onboarding flow: age, sex, height, weight, units, activity level, goal, water target, calorie targets, macro targets, and training schedule.
- Save onboarding to Convex and route post-signup users into the right first screen.
- Add editable goals in Settings.

## Phase 9 — Analytics, QA, and release

- Add PostHog React Native initialization with screen tracking and privacy-safe identify/reset.
- Add unit tests for domain calculations and app state reducers.
- Add component tests for critical screens.
- Add E2E smoke tests for auth, food logging, active workout, and sync.
- Add CI jobs for format, typecheck, tests, and Expo prebuild/build validation.
- Run device QA on recent iOS and Android devices.

## Current implementation status

Implemented now:

- Expo React Native workspace.
- Native navigation shell.
- Old-design-inspired theme and UI primitives.
- Local persisted state using AsyncStorage.
- Today, Nutrition, Food Search, Recipes, Water, Supplements, Workouts, Active Workout, Preset Builder, Progress, Onboarding, Camera Log, Login, and Settings screens.
- Offline queue primitives.

Still demo/local-only:

- Auth.
- Convex data access.
- Offline sync replay.
- AI snap and barcode lookup.
- OpenFoodFacts search.
- Push notifications.
- Analytics.
- Release/EAS config.
