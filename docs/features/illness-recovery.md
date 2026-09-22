# Illness recovery

Recovery is an explicit, user-controlled app state, separate from muscle recovery scores and nutrition safety mode. Open `/recovery`, use “Feeling unwell?” on either dashboard or in Coach, or choose “I’m feeling unwell” in a missed-log/training-lapse check-in.

Setup collects a start date, optional symptoms and priorities, energy, and a brief warning-sign check. Users preview and edit three adaptations before starting: defer scheduled workouts, quiet workout reminders, and simplify food logging. Check-in prompts within the recovery plan can be daily, every other day, or manual. No new notification permission is required.

The two phases are **resting** and **easing back**. Users can change phases in either direction, continue indefinitely, or explicitly finish. Finishing restores saved reminder preferences and normal dashboard expectations. It never creates catch-up workouts or rewrites training logs, routines, nutrition targets, or long-term goals. Deferred sessions mean suspending the current routine's expectations, not moving workouts to new dates.

`recoveryEpisodes` stores periods and current preferences. `recoveryCheckIns` stores one entry per episode/date. Reads and mutations derive identity server-side. Episode history remains after finishing, participates in export/account deletion, annotates progress, and supplies deliberate recovery dates to lapse detection. Both client and server gate training-lapse and missed-log nudges. Native reminder reconciliation cancels affected recurring and pending one-shot reminders; only saved recurring preferences resume, so deferred one-shots do not become a backlog. Other devices reconcile local notifications the next time they open the app.

Coach and in-workout Coach receive recovery context. Weekly report headlines interpret recovery without judging a missed target; old pending AI reviews are withheld when they predate an active recovery update. AI review generation receives recovery history. Coach can help review a first session, while actual phase/settings changes remain explicit in the recovery screen.

The illustration family is authored SVG, with consistent strokes and theme-aware fills: resting person, returning person, food/water, notebook, and calendar. It is decorative; adjacent text labels every action.

Medical boundaries: no diagnosis, medication prescriptions, guaranteed speed of recovery, or muscle-loss promises. Emergency warning signs lead to urgent-help guidance. Return to activity is gradual, reversible, and not medical clearance. Sources linked in the flow are [CDC respiratory illness guidance](https://www.cdc.gov/respiratory-viruses/about/index.html) and [NHS common-cold self-care](https://www.nhs.uk/conditions/common-cold/).

Verification: Convex tests cover ownership, transitions, check-ins, push gates, coach context, date validation, preservation of goals/history, and export/deletion. Client tests cover reminder cancellation/restoration and recovery-aware weekly reporting. Native delivery and visual layout still require device/browser verification when a browser is available.


Recovery mutations are scoped to the episode displayed by the client, so stale tabs cannot change a later episode. Backfilled check-ins preserve the latest symptom/energy summary. Date validation follows the user's saved timezone. Reminder scheduling shares a queue with recovery reconciliation to avoid permission-dialog races.

Run the DOM interaction suite with `bun run --cwd apps/mobile test:recovery-ui` (also included in mobile `test`). It exercises setup preview, urgent-warning handling, settings saves/retries, phase changes, check-ins and finish confirmation using React and happy-dom. It does not substitute for native notification delivery or real-browser visual verification.

Users can also ask Coach to turn on recovery mode. The `start_recovery` operation
starts today in the account timezone, defers training, quiets training reminders,
simplifies food, and leaves recovery check-ins off. Repeated requests preserve the
active plan. Mentioning illness alone does not authorize activation.

The active recovery banner has a dismiss button that ends the episode today,
restores normal app behavior, and preserves recovery history.
