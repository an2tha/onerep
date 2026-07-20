# OneRep microinteraction audit

## Existing strengths

- Onboarding selections provide immediate selected-state feedback and haptics.
- Onboarding steps animate directionally and respect reduced motion.
- Nutrition hydration logging includes pending feedback, haptics, localized rain, and a goal celebration.
- Food logging has an animated CTA and meal-label transition.
- Protein and carbohydrate targets trigger nutrient-colored micro-rain.
- Calorie completion triggers a food-colored celebration.
- Workout sets pulse and provide haptic feedback.
- Exercise-target and workout completion use confetti.
- Rest completion includes sound and vibration.
- Long-press deletion has visible progress.

## Findings

### P1 — Workout confetti ignores reduced motion

`celebrateAchievement()` creates 56–150 animated pieces without a reduced-motion fallback.

**Recommendation:** preserve accomplishment feedback but use a static success flash when reduced motion is requested.

### P1 — Water feedback differs by logging entry point

Nutrition shows water rain, while the Today quick-add action does not.

**Recommendation:** use consistent hydration feedback from Today, Nutrition, quick-add, and custom-water entry points.

### P1 — Onboarding completion has no payoff

Finishing five onboarding steps cuts directly to Today.

**Recommendation:** resolve the progress indicator, show “Your plan is ready,” provide a soft haptic, and then navigate.

### P1 — Health options need explicit accessible names

Health consideration controls were exposed as unnamed buttons in the browser accessibility snapshot.

**Recommendation:** add explicit accessible labels and retain `aria-pressed` state.

### P2 — Fat-target completion has no nutrient sprinkle

Target-crossing logic exists for protein and carbohydrates, while fat receives a fixed `rainKey={0}`.

**Recommendation:** add the same nutrient-colored micro-rain behavior for fat.

### P2 — Supplement completion is visually flat

Taking a supplement only changes row state.

**Recommendation:** animate the check and row, and use a supplement-colored micro-sprinkle for full-plan completion.

### P2 — Streak milestones are static

Streak information is displayed without milestone feedback.

**Recommendation:** acknowledge first, 3, 7, 14, and 30-day milestones once, using a restrained flame/count animation.

### P2 — Water feedback waits for persistence

The rain starts only after the mutation resolves.

**Recommendation:** provide immediate optimistic visual feedback and keep persistence pending feedback separate.

### P2 — Full goal celebrations are not dismissible

Hydration and calorie celebrations cover the app for roughly 2.6 seconds.

**Recommendation:** allow tap-to-dismiss and retain live-region announcements.

### P2 — Achievement hierarchy is inconsistent

Water, calories, macros, supplements, streaks, onboarding, and workouts use unrelated feedback levels.

**Recommendation:** standardize three levels: action feedback, section completion, and major milestone.

### P3 — Goal progress values update inconsistently

Animated-number and progress-fill behavior is not shared consistently between Today and Nutrition.

**Recommendation:** use common number/progress motion primitives with short, interruptible transitions.

### P3 — First-ever entries lack a rewarding handoff

Empty states disappear without spatially transitioning into the first logged row.

**Recommendation:** animate the empty state into the first entry and briefly highlight it, without a full-screen celebration.

## Re-audit

Re-audited in the authenticated browser after implementation, including Today quick hydration and Nutrition hydration flows, and reviewed reduced-motion, milestone, failure, and dismissal behavior.

### Follow-up findings and resolutions

- **Today hydration rain referenced a missing keyframe.** Computed styles showed `water-goal-rain-fall`, but no matching keyframes existed, leaving the drops invisible. Added a dedicated full-viewport hydration keyframe and distributed drop positions, delays, and durations.
- **Streak milestones could fire for historical streaks on mount.** Milestones now trigger only when the mounted value crosses 1, 3, 7, 14, or 30 days, and safe storage helpers prevent replay or storage-access failures.
- **Optimistic hydration feedback had no failure path.** Today and Nutrition now show an error toast if persistence fails; Nutrition also returns a failed result to its calling sheet.
- **Clickable full-screen celebrations were not keyboard-discoverable.** Hydration and calorie celebrations now include explicit 44px dismiss buttons with accessible labels, while backdrop dismissal remains available.
- **Onboarding completion used an unmanaged navigation timer.** The completion sequence now awaits its short presentation interval before navigating, keeping the save flow deterministic.

### Verified behavior

- Nutrition hydration rain starts immediately and reports a running `water-rain-nutrition-drop` animation.
- Today hydration uses its own defined `water-rain-home-drop` animation.
- New achievement effects have reduced-motion fallbacks.
- Existing timeline rows already apply `recent-entry-in` to newly observed entries.
- Existing dashboard and nutrition progress indicators already use shared motion progress classes; fat now participates in the same animated macro treatment.

## Workout and Progress focused audit

### Workout findings

- Exercise completion used confetti without naming the achievement, making the reward visually strong but contextually vague.
- Preset duplication, preset deletion, workout deletion, and successful routine drag/drop lacked consistent completion feedback.
- Historical workout exercise rows appeared abruptly when changing dates.
- Active set completion already has a strong pulse and haptic, rest completion has sound/vibration, and full workout completion already has a major celebration; adding more effects to every set would create reward fatigue.

### Workout changes

- Added an accessible achievement pill naming the completed exercise alongside the existing target confetti.
- Added haptic confirmation for successful routine drops and preset operations.
- Added success and failure feedback for preset duplication and workout deletion, plus confirmation for preset deletion.
- Added restrained entrance motion to historical workout rows.
- Preserved the existing hierarchy: set pulse → exercise achievement → workout completion.

### Progress findings

- Switching Body, Nutrition, and Training changed dense content abruptly and had no tactile feedback.
- Weekly nutrition and training charts appeared at their final values instead of revealing their data.
- The weight trend line and points appeared instantly.
- Completing a body check-in only produced a generic toast, despite being the primary habit-forming action on the page.

### Progress changes

- Added selection haptics and a short content transition when switching progress categories.
- Added staggered, bottom-origin reveals for weekly chart bars.
- Added line-draw and point-pop motion to the body-weight chart.
- Added a restrained progress-colored completion moment for new check-ins while keeping edits to an existing check-in quiet.
- Added reduced-motion fallbacks for every new chart, tab, check-in, and workout-history effect.

## Workout start slider redesign

The workout slider was rebuilt after the focused audit. The previous implementation used React state during pointer release, which could evaluate a stale drag position, and its visual fill did not clearly communicate the completion threshold.

### Changes

- Uses a synchronous position ref so fast drag-and-release gestures complete reliably.
- Enlarges the track and thumb for a more deliberate, touch-friendly control.
- Adds a real progress fill, endpoint affordance, and “Release to start” threshold state.
- Lowers the threshold to a deliberate but less tiring 78% of travel.
- Adds stepped haptics across the drag and a distinct completion haptic.
- Adds spring-like reset and completion settling without overshoot.
- Supports Enter/Space, arrow-key adjustment, Escape reset, and richer slider value text.
- Cleans up the delayed completion callback on unmount.
- Corrects the completion-thumb CSS selector and includes all new transitions in reduced-motion handling.

## Shared page transitions

The full-width Coach carousel transition is now the common horizontal route language across the app. Primary-tab changes, forward pushes, and back navigation use the same opposing full-page movement, opacity floor, scale, 860ms duration, and emphasized easing as Coach. All horizontal route transitions consistently enter from the left and leave to the right, independent of tab order or navigation direction. Task routes retain their vertical presentation/dismissal semantics. The route snapshot lifetime was increased to 900ms so outgoing pages are not removed before the shared transition completes. Existing reduced-motion handling continues to disable route animation.

Progress category changes use a separate 260ms named View Transition that crossfades and lightly resolves blur between Body, Nutrition, and Training without moving the surrounding page chrome. The fallback remains an immediate content swap when View Transitions are unavailable.
