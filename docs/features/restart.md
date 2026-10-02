# Restart

Restart is a brief, guided full-screen event for finding one manageable step back into a routine. It uses OneRep's existing typography, foreground/background tokens, and light/dark appearance. This document describes the feature surface; the onboarding-specific root `DESIGN.md` remains separate.

## Entry points

- **Coach:** the permanent `RestartNudge coach` entry and the supported `open_restart` Coach action open `/restart`. Active plans show “Continue my restart”.
- **Today dashboard:** `App.tsx` renders `RestartNudge` only while viewing today. It offers an active plan or a suggestion after at least 14 days without an eligible log. Opening the app alone is not measured as logging activity.
- **Settings → Developer → Full-screen moments:** “Preview Help me restart” opens `/restart?preview=1`. Preview uses local React state, skips Restart mutations and draft storage, permits the entire sequence immediately, and closes back to Developer settings. It can read account state but does not save a plan or logs.

The dashboard suggestion requires previous logging evidence. New accounts and empty logs do not imply a lapse. Active recovery episodes, active restart plans, and a quiet period suppress the suggestion. Manual logging includes check-ins, rest days, food, water, supplements, workouts, journal entries, measurements, custom progress, fasting, and recovery. Sensor-only imports do not count. Recent writes, including backdated entries, reset the gap. Reads are bounded; ambiguous exhausted bounds suppress the suggestion. Dismissal, pause, and completion each quiet suggestions for 14 days.

## Guided flow and persistence

The introduction leads through three choices: what feels hard, a small action, and a daily anchor. Reasons cover low energy, difficulty starting, a changed routine, and uncertainty. Actions are a short walk, one familiar gym exercise, gentle movement at home, or deliberate rest. Low energy initially selects rest, which remains editable. Suggested anchors can be replaced with a custom value of up to 100 characters; blank anchors cannot be saved.

Unsaved choices use optional, per-account session storage and survive leaving setup in the same browser session. Saving clears that draft. `restartPlans` stores one authenticated user's plan, choices, stage, last action date, and quiet period.

| Stage | User action | Result |
| --- | --- | --- |
| Preparation, stage 0 | “I'm ready for my small step” | Advances to the chosen action |
| Action, stage 1 | “I did my small action” | Advances to repeat and shows “That's enough for today” |
| Repeat, stage 2 | Returns on a later calendar day and confirms the action again | Completes the plan at stage 3 |

The server enforces the later-day repeat using the user's last active timezone, falling back to UTC. It is a calendar-day gate, not a 24-hour timer. Expected-stage checks prevent duplicate submissions or stale clients from skipping stages. Returning to an active plan resumes it. “Make it easier” reopens action and anchor choices while preserving active progress and its day gate. “Pause this plan” saves the paused state and exits. Saving a paused or completed plan starts again at preparation. Completion offers “Start another small plan”.

Restart accepts self-reported progress and qualifying logged actions, described below. It does not create workout logs, alter saved workouts or nutrition targets, or schedule notifications. Gym and home actions can open Workouts; rest actions can open Journal. Confirming a rest action marks a deliberate rest day. Plans participate in account export and deletion.

## Visual design and responsive behavior

An authored SVG shows three stepping stones, a returning path, contours, and a sun. The path fills and stones change as progress advances. The restrained green accent and paper-toned illustration panel adapt to light and dark appearance. Desktop pairs the illustration with a single focused content column, radio choices, a short plan summary, and one primary action.

Mobile uses one compact Restart header with an inline Preview label when applicable. `shouldShowPageBar` excludes `/restart` from the global app page bar, avoiding duplicate headers. The footer flows to the bottom of the available screen rather than floating over content. Artwork disappears during all three choice steps, then returns at a smaller size for the saved plan. Short screens receive smaller art and tighter spacing; safe-area padding protects controls.

Native radios, explicit input labels, visible focus states, heading focus after transitions, busy controls, and retryable error messages support interaction. Failed saves retain choices. Reduced-motion preferences disable decorative CSS animation and remove SVG movement duration and content entrance motion.

## Validation and boundaries

The revised flow passed six Playwright fixture checks across phone dark and desktop light configurations, including mobile preview checks at 393 × 852 and 375 × 667. Coverage includes setup, save failure and retry, retained choices, progress, same-day waiting, adjustment, closing, later-day completion, keyboard activation, and reduced motion. The fixture includes the app route wrapper, production page-chrome CSS, and `shouldShowPageBar`; it checks a single header, mobile action visibility, and horizontal overflow.

Twenty Convex Restart and recovery tests passed after the final activity changes. TypeScript, targeted lint, 40 Coach UI and moment tests, prompt generation checks, and all six locale catalogs also passed. Backend coverage includes ownership, idempotent advance, day gating, inactivity boundaries, backfills, dismissal, recovery suppression, account export/deletion, and isolation from training and nutrition records.

These are local browser fixtures and backend tests, not verification against a live account or native device. The source of truth is `apps/mobile/src/components/restart/`, `apps/mobile/src/pages/Restart.tsx`, `apps/mobile/src/lib/use-restart.ts`, and `convex/restart.ts`.

## Connections to the rest of OneRep

Restart is now explicit context for both Coach chat and the in-workout coach.
They receive the reason, action, anchor and current step, alongside the user's
weekly session commitment and deliberate rest dates. Prompts instruct them to
honor these choices without silently rewriting routines or prescribing catch-up
work. Training and Today show the chosen action and anchor with a return link.

After preparation, a newly logged gym/home workout with a completed set or
recorded cardio advances the action step. A repeat must happen on another local
day. Edits, empty workouts, previous-date backfills and paused plans do not
advance it. Walks remain self-reported because an arbitrary workout is not proof
of the selected walk. Confirmation remains available for unlogged activities.
Completing a rest action creates the same deliberate rest marker Training uses;
marking rest from Training also advances a prepared rest plan. Progress records
an acknowledgment and is not undone by subsequently deleting a workout.

### Other disconnected information found

- Journal observations were absent from Coach context. The latest 14 days now
  include mood, caffeine, alcohol and bounded notes, respecting the personalized
  insights opt-out and context budget.
- Coach check-in notes were saved but dropped when building model context. They
  now accompany the check-in scores under the same privacy setting.
- Weekly session targets were available to weekly reports but absent from Coach
  planning. The current ISO week's commitment now reaches both coaches.
- Deliberate rest already fed Training and lapse detection. It now also informs
  both coaches, so planning can respect a choice made outside chat.

Explicit commitments remain available when inferred personalization is disabled,
consistent with saved routines. Journal and check-in observations are omitted.
No reminder is automatically enabled, and no saved preset or nutrition target is
changed by Restart. Scheduled-notification reconciliation and automatic matching
of free-text Coach goal tasks are outside this change.
