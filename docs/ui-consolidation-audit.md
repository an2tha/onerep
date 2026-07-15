# `@repo/ui` consolidation audit

Date: 2026-07-15

## Implementation checkpoint

The consolidation is implemented through the approved package boundary. `@repo/ui` now contains 77 component modules and 79 root exports, while mobile's component directory contains only seven production modules: auth and error controllers, bottom-navigation and tooltip controllers, offline-sync and sheet platform adapters, and the Food Detail data controller. Twenty-seven mobile source files consume the shared package, and no mobile source imports `sonner`, `radix-ui`, `class-variance-authority`, `clsx`, or `tailwind-merge` directly.

The Settings and complex-workout pilots passed. Shared controlled presenters now cover settings controls/status, rest timers, exercise suggestions, semantic mobile layout, sheets, swipe interactions, navigation chrome, feedback states, dashboard/home, progress, onboarding, recipe/food display, muscle recovery, and workout rows. Mobile retains Convex, search, routing, haptic, native, timer, storage, and mutation orchestration. Feature-page one-offs remain local when moving them would only relocate a state machine or require a controller-shaped prop surface.

Configuration cleanup is complete: `packages/ui/components.json` is the sole shadcn target, mobile's CLI and primitive dependencies are removed, the canonical stylesheet is exported as `@repo/ui/styles.css`, and focused public entry points are available for `home`, `mobile`, `nutrition`, `progress`, `settings`, and `workout`. Boundary tests and ESLint restrictions prevent the former architecture from returning.

## Decision

**Proceed with a broad, staged consolidation, not a literal move of every React component.** The migration is useful and necessary because the repository already pays the cost of a shared UI package without receiving most of its benefits:

- `apps/mobile` has about 30,030 lines of production page TSX, 130 named page components, and 50 named components under `src/components`.
- Only five mobile source files import `@repo/ui`.
- `@repo/ui` contains 55 shadcn component modules but exports only 12 UI modules from its public entry point.
- Mobile maintains its own 14-component semantic layer in `mobile-ui.tsx`, even though it is application-independent.
- Six component names are independently implemented more than once: `RestTimerSheet`, `ConfirmDeleteSheet`, `ExerciseSuggestionGroups`, `ExerciseSuggestionChips`, `SectionHeader`, and `EmptyState`.
- Mobile and `@repo/ui` both install the shadcn CLI, both have nearly identical `components.json`, and both import `shadcn/tailwind.css`. Mobile has no generated `src/components/ui` tree, so its shadcn installation is redundant.

The right boundary is: **`@repo/ui` owns presentational rendering; mobile owns orchestration and platform integration.** A component may be feature-specific and still belong in `@repo/ui`, but the package must not import Convex APIs, router state, authentication/session modules, Capacitor, haptics, offline queues, application stores, or feature service functions.

## Baseline and measurable outcome

| Signal                                        |    Current state | Target after approved migration                                           |
| --------------------------------------------- | ---------------: | ------------------------------------------------------------------------- |
| Mobile files importing `@repo/ui`             |                5 | All presentational page/component modules                                 |
| Shared shadcn modules                         |               55 | Retain one canonical copy                                                 |
| Shared UI modules exported                    |               12 | Export every supported primitive/composite                                |
| Mobile semantic primitives                    |               14 | 0; move all to `@repo/ui`                                                 |
| Duplicate shadcn configs/CLI installs         |                2 | 1, in `packages/ui`                                                       |
| Direct mobile `sonner` imports                |               12 | 0; use the shared toast export/API                                        |
| Direct mobile `clsx`/`tailwind-merge` imports | 1 utility module | 0; use shared `cn`                                                        |
| Mobile global CSS                             |      3,809 lines | App-shell/feature CSS only; shared tokens and component styles move to UI |

Do not use file movement alone as success. The pilot must reduce page implementation size and duplicate code while preserving public behavior and keeping forbidden application dependencies out of `@repo/ui`.

## Decision rules used by the matrix

- **Replace**: existing `@repo/ui` primitive already provides the behavior; update the caller rather than moving the local implementation.
- **Move**: component is already reusable and presentational; move it with essentially the same props.
- **Generalize**: visual component is valuable in UI, but application data, service calls, haptics, or state must be converted to values and callbacks first.
- **Keep**: route/controller/provider/error boundary owns application or platform behavior. Its presentational children can still be extracted.

`@repo/ui` components should accept typed view data, controlled state, event callbacks, slots, accessible labels, and explicit loading/error states. Feature view types should be declared in UI and mapped from Convex/model data by mobile; UI must not accept generated Convex documents merely for convenience.

## Complete component disposition matrix

The following inventory covers every named function component declared in `apps/mobile/src/pages` and `apps/mobile/src/components`. Page roots are controllers unless noted. Small private render helpers are grouped with their source module because they share the same dependencies and migration decision.

### Existing local component modules

| Source                                         | Components                                                                                                                                                                                                     | Decision       | Evidence and closest shared surface                                                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/mobile-ui.tsx`                     | `AppScaffold`, `NavigationBar`, `GroupedList`, `ListRow`, `DisclosureRow`, `SummaryBlock`, `StatRow`, `PrimaryButton`, `ToolbarButton`, `FormField`, `MobilePage`, `PageHeader`, `SectionHeader`, `EmptyState` | **Move**       | Pure React, `cn`, and icon usage. This is the missing semantic layer over shared `Button`, `Input`, `Card`, and layout primitives.                                                                                    |
| `components/animated-accordion.tsx`            | `AnimatedAccordion`                                                                                                                                                                                            | **Move**       | Pure controlled/local presentation; consolidate over shared `Accordion`/`Collapsible`.                                                                                                                                |
| `components/mobile-sheet.tsx`                  | `MobileSheet`                                                                                                                                                                                                  | **Generalize** | Widely reused. Move the panel/backdrop/focus behavior; replace direct haptics with `onOpenChange`/interaction callbacks. Closest surfaces: `Sheet` and `Drawer`.                                                      |
| `components/slide-to-delete-row.tsx`           | `SlideToDeleteRow`                                                                                                                                                                                             | **Move**       | Pure gesture/presentation with callbacks.                                                                                                                                                                             |
| `components/swipe-to-start.tsx`                | `SwipeToStart`                                                                                                                                                                                                 | **Generalize** | Presentational, but imports app design tokens. Move after tokens; expose labels/icons/callbacks.                                                                                                                      |
| `components/workout/apple-fitness-set-row.tsx` | `AppleFitnessSetRow`                                                                                                                                                                                           | **Move**       | Pure feature presentation using props and `cn`; publish through a workout subpath.                                                                                                                                    |
| `components/date-selector-button.tsx`          | `DateSelectorButton`                                                                                                                                                                                           | **Generalize** | Move calendar/button UI; mobile supplies date arithmetic and haptic callback. Use shared `Calendar`, `Popover`/`Sheet`, and `Button`.                                                                                 |
| `components/dashboard-progress-panels.tsx`     | `TrendChart`, `BudgetChart`, `RecoveryChart`, `DashboardProgressPanels`                                                                                                                                        | **Generalize** | Presentational charts, but types/helpers come from mobile libs. Define UI view types and pass calculated points/recovery values. Closest surface: shared `Card`/`Chart`.                                              |
| `components/muscle-body-svg.tsx`               | `MuscleBodySvg`                                                                                                                                                                                                | **Generalize** | Pure SVG rendering but coupled to a mobile feature type. Replace it with a UI-owned serializable muscle-state map.                                                                                                    |
| `components/muscle-recovery-heatmap.tsx`       | `MuscleRecoveryHeatmapCard`                                                                                                                                                                                    | **Generalize** | Compose the generalized SVG and shared `Card`; map domain state in mobile.                                                                                                                                            |
| `components/food-detail-sheet.tsx`             | `MacroStack`, `PortionPicker`, `NutrRow`, `ProductHeader`, `MealPicker`, `FoodDetailSheet`                                                                                                                     | **Generalize** | High-reuse feature UI, but currently fetches OpenFoodFacts data and computes nutrition. UI owns rendering and controlled selections; mobile controller owns fetch/scaling/logging.                                    |
| `components/home/index.tsx`                    | `TodayHeader`, `DashboardQuickActions`, `NextStepCard`, `TodayChecklist`, `FirstWeekGuide`, `WorkoutWeekStrip`, `CoachGoalCards`, `DailyLedgerHero`, `TimelineIcon`, `TodayTimeline`, `DailySummaryStrip`      | **Generalize** | Mostly presentational and already prop-driven. Move view types and rendering; keep briefing/domain mapping in mobile. `DailySummaryStrip` must receive data rather than reaching into app state if it currently does. |
| `components/tooltips.tsx`                      | `AppTooltip`, `MetricTooltip`                                                                                                                                                                                  | **Split**      | Move a generic dismissible tooltip to UI. Keep tooltip ID registry, Convex query/mutation, and haptics in a mobile adapter/controller. Closest surface: shared `Tooltip`.                                             |
| `components/bottom-bar.tsx`                    | `BottomBarActionProvider`, `BottomBar`                                                                                                                                                                         | **Split**      | Move a controlled bottom-navigation view to UI. Keep router lookup, navigation, tooltip persistence, and action context in mobile.                                                                                    |
| `components/offline-sync-indicator.tsx`        | `OfflineSyncIndicator`                                                                                                                                                                                         | **Split**      | Move a generic sync-status indicator view; keep Convex auth, queue listeners, retry/flush behavior, and app auth in mobile.                                                                                           |
| `components/auth-guard.tsx`                    | `AuthGuard`                                                                                                                                                                                                    | **Keep**       | Authentication, Convex auth, sign-out, and navigation controller. It may render shared loading/error surfaces.                                                                                                        |
| `components/error-boundary.tsx`                | `ErrorBoundary`                                                                                                                                                                                                | **Keep**       | Application recovery, diagnostics, auth reset, and clipboard behavior. Extract only its error-state view if reused.                                                                                                   |

### Page modules

| Source                          | Components                                                                                                                                                                                                                                                                                                                                                                                | Decision                                                            | Evidence and extraction boundary                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/ActiveWorkout.tsx`       | `SetNumberField`, `RestTimerSheet`, `WeightSelectorSheet`, `WeightSelectorButton`, `ActiveSetRow`, `CardioDetailsPanel`, `ActiveExerciseCard`, `ExerciseHistorySheet`, `AddExerciseSheet`, `ExerciseCategoryFilters`, `ExerciseSearchResult`, `ExerciseSuggestionGroups`, `ExerciseSuggestionChips`, `AiWorkoutSheet`, `ResumeWorkoutSheet`, `FinishSheet`, `AbortSheet`, `ActiveWorkout` | **Generalize all except root; keep `ActiveWorkout`**                | Strongest complex pilot. Presenters are valuable workout UI, but the module is coupled to Convex, router, offline mutations, Apple Health, AI access, haptics, timers, and progression. Define controlled workout view models and callbacks. Merge suggestion UI with `NewPreset`; merge timer/confirmation sheet shells. |
| `pages/Nutrition.tsx`           | `ProgressLine`, `MicroBreakdown`, `CustomWaterSheet`, `WaterGoalSheet`, `WaterGlassControls`, `GoalsCardWrapper`, `SmartMealPresetCard`, `DescribeMealSheet`, `RecipeLogSheet`, `RecipeManagementBox`, `GoalTile`, `SupplementRow`, `Nutrition`                                                                                                                                           | **Generalize all except root; keep `Nutrition`**                    | Presentational nutrition/water/recipe surfaces are reusable. Root owns Convex, navigation, health goals, offline mutation, and haptics. Use shared progress, cards, fields, and sheet shells.                                                                                                                             |
| `pages/NewPreset.tsx`           | `RestTimerSheet`, `SetRow`, `PresetExerciseCard`, `SearchSheet`, `ExerciseSuggestionGroups`, `ExerciseSuggestionChips`, `SearchExerciseCard`, `ExerciseModal`, `PastePresetSheet`, `NewPreset`                                                                                                                                                                                            | **Generalize all except root; keep `NewPreset`**                    | Consolidate exact duplicates with Active Workout. Root retains mutation, AI access, catalog/search recents, and navigation.                                                                                                                                                                                               |
| `pages/Workouts.tsx`            | `TrainingConsistencyCard`, `PresetSteps`, `ConfirmDeleteSheet`, `WorkoutLogSummary`, `WorkoutLogCarousel`, `PickSecondWorkoutSheet`, `MuscleVolumeCard`, `Workouts`                                                                                                                                                                                                                       | **Generalize all except root; keep `Workouts`**                     | Cards, carousel, steps, and sheets are data-driven. Root retains Convex queries, navigation, history, and mutations. Confirmation shell should be generic.                                                                                                                                                                |
| `pages/Coach.tsx`               | `RecipeBreakdown`, `CoachOperationResults`, `CoachArtifacts`, `CoachProposal`, `CoachUiBlocks`, `CoachLoadingState`, `ThinkingIndicator`, `CoachSheet`, `Coach`                                                                                                                                                                                                                           | **Generalize all except root; keep `Coach`**                        | Move renderers based on UI-owned discriminated view types. Root owns streaming/Convex, dictation, AI access, navigation, media, and mutations. Avoid importing generated coach API/result types into UI.                                                                                                                  |
| `pages/Supplements.tsx`         | `SectionHeader`, `StatePill`, `SummaryStrip`, `TodayRow`, `CatalogRow`, `ImportNotice`, `ItemSheet`, `ScheduleEditor`, `LogSheet`, `DetailSheet`, `ConfirmDeleteSheet`, `Warnings`, `Supplements`                                                                                                                                                                                         | **Replace `SectionHeader`; generalize other presenters; keep root** | Immediate duplicate primitive replacement plus reusable ledger/editor UI. Root owns queries, offline mutations, food lookup, navigation, and haptics. Reuse generic confirmation and schedule/form primitives.                                                                                                            |
| `pages/Progress.tsx`            | `WeekAxis`, `ChartLegend`, `NutritionWeekBars`, `TrainingWeekBars`, `MetricHeading`, `InsightRow`, `Interpretation`, `WeightChart`, `BodyProgress`, `NutritionProgress`, `TrainingProgress`, `ProgressLoading`, `Progress`                                                                                                                                                                | **Move/generalize presenters; keep root**                           | Mostly pure chart/report presentation. Pass precomputed series and interpretations; root retains data queries, navigation, and haptics. Build on shared `Chart`, `Progress`, `Skeleton`, and `Card`.                                                                                                                      |
| `pages/Settings.tsx`            | `Settings`, `SettingsSectionIntro`, `SettingsSectionLabel`, `SettingsLoadingState`, `StatusPill`, `CompactSwitch`, `SyncStatusIcon`, `ReminderRow`, `SettingsRow`, `AiUsageProgress`, `RevenueCatSubscriptionPanel`, `SectionSaveButton`, `NumberStepper`, `SegmentedControl`                                                                                                             | **Replace/generalize presenters; keep `Settings`**                  | Best simple pilot: map switch, button, progress, skeleton, label, rows, and segmented controls to shared primitives. Root owns auth, Convex, export, queues, reminders, RevenueCat, PWA, and theme orchestration.                                                                                                         |
| `pages/SnapAndLog.tsx`          | `ResultsSheet`, `SnapReviewRow`, `SnapQuantityControl`, `BarcodeResultRow`, `ResultFallbackActions`, `DarkMacroPill`, `SnapAndLog`                                                                                                                                                                                                                                                        | **Generalize presenters; keep root**                                | UI can render capture results and controlled quantities. Root retains Capacitor camera, barcode scanning, AI, Convex, logging, and navigation.                                                                                                                                                                            |
| `pages/NewRecipe.tsx`           | `IngredientCard`, `EmptyState`, `RecipeSummary`, `MicrosPanel`, `SearchOverlay`, `MetadataField`, `NewRecipe`                                                                                                                                                                                                                                                                             | **Replace `EmptyState`; generalize other presenters; keep root**    | Reuse shared empty state, fields, sheets, cards, and nutrient renderers. Root owns search/fetch, recipe images, mutations, and navigation.                                                                                                                                                                                |
| `pages/SearchFoods.tsx`         | `RecipeSearchCard`, `SearchSuggestionGroup`, `MealSelectSheet`, `SearchFoods`                                                                                                                                                                                                                                                                                                             | **Generalize presenters; keep root**                                | Share search result/suggestion/meal selector patterns with workout and food detail flows. Root retains data fetch, recents, ranking, logging, and routing.                                                                                                                                                                |
| `pages/OnboardingMobile.tsx`    | `NumberQuestion`, `PillToggle`, `OptionList`, `MultiSelectList`, `OnboardingMobile`                                                                                                                                                                                                                                                                                                       | **Move/generalize questions; keep root**                            | Generic controlled form-question components belong in UI. Root retains onboarding mutation, health-goal mapping, navigation, and haptics.                                                                                                                                                                                 |
| `pages/RecipesHub.tsx`          | `RecipesHub`                                                                                                                                                                                                                                                                                                                                                                              | **Keep root; extract anonymous/inline presenters during migration** | Route is coupled to Convex, navigation, image mapping, and logging. Its visual sections should be decomposed into UI-owned recipe cards/lists when touched.                                                                                                                                                               |
| `pages/Login.tsx`               | `AuthRedirectFallback`, `Login`                                                                                                                                                                                                                                                                                                                                                           | **Replace fallback; keep root**                                     | Use shared loading/status and existing `LoginForm`; root owns auth redirect/session/navigation. This is a small replacement candidate, not the main pilot.                                                                                                                                                                |
| `pages/ResetPassword.tsx`       | `PasswordInput`, `ResetPassword`                                                                                                                                                                                                                                                                                                                                                          | **Replace `PasswordInput`; keep root**                              | Shared `Field`/`Input` plus password adornment should replace the local field. Root owns auth and navigation.                                                                                                                                                                                                             |
| `pages/FoodReview.tsx`          | `FoodReview`                                                                                                                                                                                                                                                                                                                                                                              | **Keep root**                                                       | Thin route/controller already delegates to `FoodDetailSheet`; benefits automatically when that sheet is split.                                                                                                                                                                                                            |
| `pages/RoutinesHub.tsx`         | `RoutinesHub`                                                                                                                                                                                                                                                                                                                                                                             | **Keep root**                                                       | Thin navigation screen already consumes local semantic primitives; it will switch to shared exports.                                                                                                                                                                                                                      |
| `pages/EmailVerified.tsx`       | `EmailVerified`                                                                                                                                                                                                                                                                                                                                                                           | **Keep root**                                                       | Auth/session redirect controller; render with shared status/card/button primitives.                                                                                                                                                                                                                                       |
| `pages/VerifyEmailRequired.tsx` | `VerifyEmailRequired`                                                                                                                                                                                                                                                                                                                                                                     | **Keep root**                                                       | Auth/navigation controller; render with shared status/card/button primitives.                                                                                                                                                                                                                                             |
| `pages/Exercises.tsx`           | none                                                                                                                                                                                                                                                                                                                                                                                      | **No component work**                                               | Re-export/alias module only.                                                                                                                                                                                                                                                                                              |

## CSS and token ownership

The first 129 lines of `packages/ui/src/index.css` and the opening theme block in mobile duplicate Tailwind, animation, shadcn, font, theme-token, root palette, dark palette, and base-layer setup. Mobile then adds approximately 3,680 lines of application styling.

Move to `@repo/ui`:

- font import and common Tailwind theme mappings;
- root/dark semantic colors, radii, border/input/ring definitions, and base element styles;
- `native-*` semantic component classes currently backing `mobile-ui.tsx`;
- component animations for shared sheet, accordion, swipe, skeleton, tooltip, and form behavior;
- shared accent/macro token definitions once represented as CSS variables or package-owned typed constants.

Keep in mobile:

- safe-area and Capacitor/native-shell layout variables;
- route/view-transition behavior and bottom-navigation placement;
- onboarding and Coach atmospheric page art;
- app-specific confetti/subscription celebration;
- feature-only legacy compatibility selectors until their owning markup migrates;
- one-off page backgrounds and platform preview adjustments.

Mobile should import one documented UI stylesheet entry and retain its own stylesheet after it, so application overrides remain intentional. Remove mobile's direct `shadcn/tailwind.css` import only after the shared stylesheet is wired and a production build proves Tailwind scans `packages/ui/src` correctly.

## Package and dependency findings

1. Make `packages/ui/components.json` the only shadcn configuration and document running shadcn from `packages/ui`.
2. Delete `apps/mobile/components.json` and the mobile `shadcn` dev dependency after the stylesheet/import pilot passes.
3. Export all supported shadcn modules. Prefer explicit subpaths (`@repo/ui/primitives`, `@repo/ui/mobile`, `@repo/ui/workout`, `@repo/ui/nutrition`, `@repo/ui/coach`) plus a compatibility root rather than an ever-growing root barrel.
4. Export `cn` from UI and remove the mobile `clsx` and `tailwind-merge` dependencies after all mobile callers switch. Those libraries remain UI implementation dependencies.
5. Export a single toast API from UI and replace the 12 direct `sonner` imports. Then remove mobile's direct `sonner` dependency.
6. Mobile has no direct source imports of `radix-ui` or `class-variance-authority`; remove those direct dependencies after the build confirms they are supplied transitively only through UI.
7. Keep `@ionic/react` until a separate audit proves it unused throughout mobile; it is a platform choice, not a shadcn duplication issue.

Add an ESLint restriction in mobile after the pilot:

- forbid imports from `radix-ui`, `@base-ui/react`, `sonner`, `clsx`, `tailwind-merge`, and `class-variance-authority` outside an explicit allowlist;
- forbid new files under `apps/mobile/src/components/ui`;
- allow icons, React, application controllers, and Capacitor APIs;
- require the `@repo/ui` public API rather than deep imports into `packages/ui/src`.

## Ordered migration backlog

### Phase 0 — make the package consumable

1. Add explicit package exports for all supported existing primitives, `cn`, and the shared stylesheet.
2. Move common theme/token CSS into UI without changing computed values.
3. Move `mobile-ui.tsx` and `AnimatedAccordion`; generalize `MobileSheet` without haptics.
4. Add UI unit tests for exported primitives and a package-boundary test that rejects forbidden mobile/Convex imports.

### Phase 1 — pilots and go/no-go gate

1. **Simple pilot: Settings.** Replace local switch, button, field, progress, skeleton, pill, row, and segmented-control presentation. Keep all auth/subscription/reminder controllers in the page.
2. **Complex pilot: Active Workout.** Extract suggestion lists/chips, set row/card, selector fields, and generic timer/confirmation sheets using view models and callbacks. Do not move queries, mutations, timers, haptics, Apple Health, or navigation.
3. Compare page LOC, prop surface, dependency graph, visual snapshots, accessibility contracts, and interaction behavior.
4. Continue only if both pilots reduce duplicate rendering and neither adds a forbidden dependency to UI. If the complex pilot requires controller-shaped mega-props, keep that composite in mobile and extract only its stable leaf presenters.

### Phase 2 — shared interaction patterns

1. Consolidate sheets, confirmation dialogs, date selectors, swipe actions, tooltips, sync indicators, and bottom navigation views.
2. Merge the duplicate rest timer, delete confirmation, exercise suggestion, section header, and empty-state implementations.
3. Split Food Detail and dashboard/progress visualizations into mobile controllers plus UI renderers.

### Phase 3 — feature presentation

1. Migrate workout/preset, nutrition/recipe, progress, supplements, coach, onboarding, and capture presenters into feature subpaths.
2. Convert generated/backend/domain documents to UI-owned view models at mobile boundaries.
3. Break oversized page files into controller modules only as part of verified extraction; avoid behavior refactors in the same changes.

### Phase 4 — cleanup and enforcement

1. Remove mobile shadcn config/CLI, duplicate CSS imports, redundant dependencies, and local primitive utilities.
2. Enable restricted-import lint rules.
3. Remove legacy compatibility CSS only after searches prove its selectors have no consumers.
4. Update package documentation with ownership rules and shadcn installation instructions.

## Verification and acceptance gates

Run before and after each pilot:

- `bun run typecheck` in both `apps/mobile` and `packages/ui`;
- UI unit tests and targeted mobile accessibility/contract tests for the migrated surfaces;
- mobile production build with valid build-time Convex URLs;
- the 64 Playwright cases currently enumerated across phone 390, phone 430, tablet, and desktop in light/dark themes;
- keyboard traversal, focus return, escape/backdrop dismissal, screen-reader names, 44px touch targets, safe areas, reduced motion, and theme switching;
- native-device smoke tests for sheets, keyboard avoidance, swipe gestures, and haptic callback wiring.

Baseline captured during this audit:

- mobile typecheck: **pass**;
- UI typecheck: **pass**;
- UI tests: **13 pass, 0 fail**;
- mobile production build: **pass** with audit-only valid-shaped Convex URLs; existing mixed dynamic/static import and large-chunk warnings remain;
- Playwright discovery: **64 cases found**;
- mobile `bun test`: **baseline blocked before test execution** by Bun filesystem/module-loading errors (`EBADF`, missing-entry resolution, and directory read errors). Fix or reliably reproduce this runner issue before using the full suite as a migration gate.

Final acceptance requires unchanged visual/accessibility behavior, no forbidden UI dependencies, one shadcn installation target, and a material reduction in duplicate implementations. A reasonable pilot threshold is at least a 25% reduction in presenter code inside the two pilot pages without increasing total presenter code after shared tests and types are included.

## Risks and controls

- **Oversized shared package:** contain feature components behind subpath exports and keep primitives independent of features.
- **Backend leakage:** enforce package-boundary lint/test checks; map data to view types in mobile.
- **Prop explosion:** split composites into stable leaf presenters rather than mirroring controller state through dozens of props.
- **Visual drift:** migrate structure and ownership without redesign; compare all existing visual variants.
- **Tailwind omissions:** retain `@source` coverage and verify the production bundle before deleting mobile CSS/config.
- **Native interaction regressions:** represent haptics and platform actions as optional callbacks owned by mobile and smoke-test on devices.

## Conclusion

**Broad consolidation was worthwhile and is now in place with a hard architectural boundary.** The redundant shadcn setup and primitive dependencies have been removed, the shared package is the exclusive source of primitives and reusable presenters, and mobile primarily composes those surfaces with application orchestration. Indiscriminate relocation remains intentionally out of scope: route roots, providers, guards, data orchestration, native integrations, and tightly stateful one-off composites stay in mobile. New reusable presentation must enter through `@repo/ui`; the package-boundary tests make that an enforceable rule rather than a convention.
