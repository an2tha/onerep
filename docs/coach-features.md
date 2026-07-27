# OneRep Coach Features

This document describes the Coach capabilities currently implemented across the mobile app and Convex backend.

## Coach modes

Coach has three horizontally navigable modes. Each mode has its own visual treatment, prompt context, suggested actions, and persisted conversation.

| Mode          | Purpose                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| **Briefing**  | General performance guidance, progress explanations, planning, and next actions    |
| **Nutrition** | Meals, recipes, nutrition adherence, food logging, and recipe customization        |
| **Training**  | Workouts, routines, substitutions, progression, recovery, and training adjustments |

Users can switch modes by tapping tabs or swiping. Mode transitions preserve the surrounding interface and use light- and dark-mode-specific animated backgrounds.

## Personalized context

Coach responses can use the user's current OneRep data, including:

- Primary goal and experience level
- Safety mode and safety flags
- Calorie and protein targets
- Recent calorie and protein averages
- Protein adherence and macro consistency
- Recent workout frequency and hard-set volume
- Training-volume changes
- Selected exercise progression and frequency
- Existing insights and data-confidence signals
- Saved recipes and recent food logs
- Workout presets and weekly routine
- Body measurements and Progress trends
- Coach memories, check-ins, goals, and recent reversible actions

Context is sanitized and bounded before it is sent to the model.

## Conversation experience

- Conversations persist locally per Coach mode.
- Users can start a new chat with an animated clearing sequence.
- Responses support retry after a failed request.
- Coach automatically scrolls to newly generated content.
- Generated content reveals progressively with staggered animations.
- User and Coach messages have distinct entrance motion.
- The composer responds to focus with a mode-aware visual treatment.
- Send, attachment, dictation, tab, and generated-action controls include tactile microinteractions.
- All major Coach motion respects `prefers-reduced-motion`.

## Input methods

### Text

The composer accepts multi-line prompts and submits with the send button or Enter. Shift+Enter inserts a new line.

### Voice dictation

- Starts and stops speech recognition from the composer.
- Displays interim transcription while listening.
- Surfaces device or recognition errors.
- Can be cancelled during mode changes or new-chat transitions.

### Image attachments

- Accepts JPEG, PNG, and WebP images.
- Prepares and uploads images securely through Convex storage.
- Displays preparing, uploading, ready, and error states.
- Allows removing an attachment before submission.
- Sends the uploaded attachment ID with the Coach request.

## Guided Coach states

Instead of exposing generated prompt text in the composer, supported entry points open a contextual card and ask the user one focused question.

Implemented guided states include:

- **Create a recipe** — asks what the user wants to cook and provides example starting points.
- **Suggest a meal** — asks for cravings, available ingredients, time limits, or nutrition goals.
- **Customize a recipe** — displays the source recipe and asks what should change.
- **Modify a workout** — asks what feels different while preserving useful training work.
- **Explain a plateau** — frames a progress investigation using recent data.
- **Plan recovery** — gathers the constraint that should shape a recovery adjustment.
- **Plan a week** — balances training, meals, and recovery across seven days.

Guided states support:

- Context cards with relevant source data
- One-tap example prompts
- Empty, focused composer states
- Dismissal with animated exit
- Hidden structured instructions sent alongside the user's natural-language request

## Recipe customization and meal remix

Official OneRep recipes can be handed directly to Nutrition Coach.

- The handoff displays the recipe image, description, time, calories, protein, and ingredients.
- The user describes the desired change rather than editing a generated prompt.
- Dashboard recipe previews offer **Higher protein**, **Lighter**, and **Vegetarian** remix options.
- Remix options show estimated before/after calories and protein.
- The selected remix request is carried into Coach as editable context.
- Coach can return a detailed recipe proposal for confirmation.

## Generative interactive cards

Coach can compose custom interactive cards from bounded UI primitives instead of selecting only from fixed templates. Presentation primitives include explanatory text, section headings, labeled dividers, key/value facts, progress bars, bulleted or numbered lists, timelines, and reactive metric groups. Input primitives include quantity steppers, numeric ranges, segmented choices, bounded ratings, and toggles. Coach controls their order, labels, values, and visual context while the app remains responsible for accessible rendering and safe actions.

Quick meal logging uses this system by default. Coach can estimate a meal, show calories and macros, expose the most useful quantity control (servings, grams, pieces, cups, and so on), optionally ask where to log it, and recalculate the preview as quantities change. Pressing **Log meal** creates the normal validated `log_nutrition` operation; generated cards never execute arbitrary code.

## Coach onboarding showcase

The main onboarding journey includes a dedicated Coach capabilities step. Three responsive animated SVG mockups introduce adjustable generated cards, opt-in dashboard widgets, and suggested follow-up views. The onboarding frame, controls, and feature panels use a restrained frosted-glass treatment over the existing atmospheric background, with all animation disabled under `prefers-reduced-motion`.

## Coach-created dashboard widgets

Coach can create compact dashboard widgets backed by custom Progress metrics. Supported views are a current stat, an interactive compact counter, target progress, a short sparkline, and an explicitly labeled decay estimate. Counter widgets reuse the source metric increment so the user can log directly from the dashboard. Widget definitions are user-owned and remain outside the dashboard when first created.

After creation, Coach presents **Add to dashboard** rather than silently changing the dashboard. The user can add or decline the widget and remove it later. Coach can also suggest one useful, non-redundant follow-up widget. Choosing that suggestion starts a new Coach request and links the resulting widget to its parent. For example, a caffeine total can suggest an estimated caffeine decay curve using a disclosed half-life assumption; it is never presented as a measured blood concentration.

Dashboard rendering is deliberately dense: one primary value or tiny chart, one short context line, and no decorative or repeated sections.

## Structured generated UI

Coach uses a **UI-first response policy**. For recommendations, comparisons, plans, steps, and actions, the prose reply is limited to one short orienting sentence and the useful detail is placed in structured blocks. Plain text remains the default only for greetings, ordinary conversation, and simple factual answers. Structured content is capped to avoid redundant or decorative cards.

### Cards

Short labeled explanations with a title and supporting detail.

### Stat groups

Groups of values with optional supporting detail and up, down, or flat trend indicators.

### Checklists

Interactive task lists. Items can be toggled locally and can be converted into persisted Coach goals.

### Goals

Goal cards include:

- Title and detail
- Duration
- Task list
- Completed states
- Pin-to-Today action

### Action rows

Generated actions can navigate to:

- Nutrition
- Workouts
- Progress
- Settings
- Workout builder
- Recipe builder
- Food logging

## Coach artifacts

Coach can produce evidence-oriented artifacts:

- **Today briefing**
- **Progress explanation**
- **Scenario simulation**
- **Validation**
- **Recovery adaptation**

Artifacts can include a status, detail, evidence list, and recommended next steps.

## Proposed actions and confirmation

Coach distinguishes advice from operations that change user data. Proposed changes are reviewed before application when confirmation is required.

Each proposal may include:

- A human-readable summary
- Assumptions
- Warnings
- The affected records
- Apply and dismiss actions
- Loading and success states

Recipe proposals additionally show ingredients, nutrition estimates, warnings, and whether saving will also log servings.

## Supported Coach operations

### Nutrition and recipes

- Save a new recipe
- Update an existing recipe
- Log nutrition
- Delete a nutrition entry
- Optionally log a saved recipe serving

### Training

- Create a workout preset
- Create a multi-preset workout plan
- Update the weekly routine
- Assign presets to schedule days
- Apply exercise substitutions and progression-oriented drafts

### Progress

- Create and persist an interactive custom Progress metric
- Choose the Body, Nutrition, or Training tab
- Configure counter, number, or toggle controls
- Set units, increments, targets, and visual accents
- Undo a Coach-created metric

### Planning and goals

- Save a seven-day plan with workouts, meals, and recovery notes
- Save a goal with duration and tasks
- Pin saved goals to Today

### Check-ins and memory

- Save energy, soreness, sleep-quality, mood, and note check-ins
- Remember a user preference or fact
- Forget a saved memory

### Reversible changes

- Record action history
- Undo supported Coach changes
- Open the affected recipe, workout, or nutrition area after application

## Coach memory

Coach memory is user-scoped and stored one record per key.

- Users can inspect saved memories.
- New memories can be added with a category and value.
- Individual memories can be removed.
- Coach can propose remember and forget operations.
- Memory is bounded before inclusion in model context.

## Coach activity history

- Shows data-changing Coach operations.
- Supports searching action summaries.
- Exposes undo where the operation is reversible.
- Keeps action feedback connected to the resulting app area.

## Check-ins and workout readiness

Coach check-ins capture:

- Energy
- Soreness
- Sleep quality
- Mood
- Optional note

Dashboard readiness combines available signals from:

- Protein adherence
- Hydration
- Energy
- Sleep quality
- Soreness
- Muscle-group recovery

The result is presented as **Ready**, **Steady**, or **Recover**, with a contextual explanation and a guided Training Coach adjustment flow.

## Weekly planning and dashboard intelligence

Coach integrates with dashboard intelligence features that provide:

- Weekly workout and completed-set summaries
- Nutrition logging consistency
- Protein adherence
- Body-weight movement
- Strength-record detection
- Shareable weekly milestone artwork
- Smart meal repeat actions
- Dismissible next-best-action recommendations
- Guided seven-day planning

## Coach-generated custom Progress metrics

Users can ask Coach to create an interactive metric for any Progress tab:

- Body
- Nutrition
- Training

The user can create a metric from the Progress metric builder or directly in Coach chat. Requests such as “track caffeine” or a follow-up “implement” produce a real `save_progress_metric` operation rather than a descriptive plan. The resulting tracker is persisted and Coach links back to Progress.

Coach generates:

- Title
- Description
- Progress tab
- Interactive control type
- Unit
- Increment size
- Optional target
- Visual accent

Supported controls:

- **Counter** — increment and decrement by a generated step
- **Number** — numeric tracking with decimal-capable increments
- **Toggle** — yes/no or completed/not-completed habits

Generated metrics include:

- Daily values
- Idempotent one-entry-per-day updates
- Recent trend visualization
- Optional daily target guidance
- Deletion
- Per-user authorization and isolation

Example: a caffeine request can produce a Nutrition metric measured in milligrams, with 50 mg controls and a 400 mg daily guide. A deterministic fallback is available if model generation fails.

## Safety and validation

- Coach operations are normalized and validated before application.
- Data-changing operations use explicit Convex APIs rather than direct model access.
- User ownership is checked for recipes, metrics, goals, logs, and other persisted records.
- Prompts and model-generated strings are length-bounded.
- Custom metrics cannot become diagnostic or medication-dosing trackers through the generation instructions.
- Numeric values are clamped before persistence.
- AI usage is authenticated and metered.
- Unsupported or malformed operations are rejected.

## Accessibility and motion

- Coach modes use tab semantics and selected states.
- Generated content uses appropriate headings, lists, status regions, and button labels.
- Dictation and upload states are announced where relevant.
- Interactive controls maintain accessible touch sizes.
- Modal and sheet experiences identify themselves as dialogs.
- Animations have reduced-motion fallbacks.
- Light and dark mode use separate contrast-aware atmospheric treatments.

## Primary implementation locations

| Area                                        | Location                                     |
| ------------------------------------------- | -------------------------------------------- |
| Coach interface and interaction controllers | `apps/mobile/src/pages/Coach.tsx`            |
| Coach context assembly                      | `apps/mobile/src/lib/coach-context.ts`       |
| Dictation                                   | `apps/mobile/src/lib/use-coach-dictation.ts` |
| Image preparation                           | `apps/mobile/src/lib/coach-media.ts`         |
| Coach generation action                     | `convex/ai/metricGeneration.ts`              |
| Operation application                       | `convex/ai/coachOperations.ts`               |
| Coach memory, check-ins, and history        | `convex/ai/coachState.ts`                    |
| Coach goals                                 | `convex/ai/coachGoals.ts`                    |
| Shared operation models and validation      | `packages/models/src/coach.ts`               |
| Custom Progress metric persistence          | `convex/customProgressMetrics.ts`            |
| Custom Progress metric UI                   | `apps/mobile/src/pages/Progress.tsx`         |
| Coach and app motion styles                 | `packages/ui/src/index.css`                  |
