# OneRep Homescreen Preview Set — 2026-06-27 17:48

## Product/context
OneRep mobile homescreen for a logged-in user checking today's food, water, training, supplements, and recent log entries. Current production constraints include the old greeting header, quick add sheet for food, +250 ml water action, scheduled/active workout states, and a compact recent log.

## Target user
A daily fitness/nutrition tracker user who wants to know what is left today and take the next logging action quickly.

## Scenario/data fixture
- Date: Sat, Jun 27
- User: Ananth
- Nutrition: 663 kcal remaining, 1,537 eaten, 2,200 target
- Water: 1,250 / 2,500 ml
- Training: Upper Strength ready, not started
- Recent: Greek yogurt, latte, chicken rice bowl, water, creatine
- Imperfect state: one scanned food has estimated sodium / pending review, and one option shows a queued unsynced water entry

## Reference-to-decision map
Local `good-websites.txt` and `bad-examples.txt` were not present in the skill directory, so this set uses the embedded de-ai-fy reference lessons from the loaded skill.

- Linear product-evidence principle -> each option uses concrete domain artifacts: kcal remaining, meal rows, water ml, scheduled workout, supplement dose, scan/review state, and timestamps rather than generic wellness metrics.
- Teenage Engineering discipline principle -> terse labels, product-code-like status chips, and stripped navigation in options 2 and 5; quirk is constrained to the system grammar.
- Apple HIG principle -> touch targets are large, primary actions sit next to the data they affect, and the mobile layouts avoid tiny controls/horizontal overflow.
- Dropbox/Charles Eames detail principle -> borders, dividers, receipt rules, and status labels have jobs; decorative color is limited to action/status semantics.
- Negative pattern: Arngren/clutter -> one primary action per screen and no widget pile.
- Negative pattern: mobile failure/card grid autopilot -> at least three directions avoid generic card-grid dashboard framing.

## Shared constraints
- Keep the old greeting style (`Good afternoon, Ananth.`).
- Home must immediately answer: calories left, water status, workout state, and recent logged items.
- Main log-food action remains prominent.
- No implementation in production app until a direction is chosen.

## Divergence contract

| Option | Scenario | Axes changed | Signature move | Shared constraints | Anti-template risk checked |
| --- | --- | --- | --- | --- | --- |
| 01 — Paper Ledger | User checks remaining calories and recent log like a receipt | Structure, typography, color, component anatomy | One torn-paper daily ledger with ruled rows and stamp-like action | Old greeting, calories/water/workout/recent | Avoided card pile; every row is a logged artifact |
| 02 — Rack Console | User is training-ready and wants an instrument-like status surface | Workflow emphasis, dark palette, dense technical layout, interaction model | Calorie/water/training as a split console with a rack status strip | Same data and actions | Avoided generic dark dashboard by using gym-console nouns/states |
| 03 — Meal Board | User is deciding what to log next after lunch | IA, full-viewport model, editorial layout, content emphasis | Next meal decision board with macro lanes and one review warning | Same data; no decorative phone shell | Avoided static dashboard by framing the next decision |
| 04 — Day Slip | User wants the calmest possible summary before logging dinner | Density, tactile sheet, spacing rhythm, copy tone | Single folded day slip: huge remaining number, two quiet rows, short recent | Same old greeting and actions | Avoided extra widgets and badges |
| 05 — Coach Queue | User opens the app to resolve today’s pending actions | Workflow framing, checklist IA, component behavior, copy | Prioritized action queue with checked/due/pending rows | Same food/water/training/recent truths | Avoided metric-first dashboard; actions drive hierarchy |

## Visual system notes
- Typography: each option uses local/system type choices with distinct roles: serif ledger, condensed technical, editorial serif/sans, quiet humanist, and mono/utility.
- Colour: warm paper, graphite console, cream/ink board, bone/olive slip, and clay queue. Each non-neutral hue is action, status, warning, focus, or atmosphere.
- Components: no repeated identical card scaffold; structures are ledger, console, board, slip, and queue.
- Motion: minimal page-entry motion with `prefers-reduced-motion` guard.

## Self-review notes
- Scaffold check: options use different structural nouns and layout models.
- Product specificity: screen content uses actual OneRep nouns/units/actions.
- Data coherence: numbers and timestamps form one plausible day.
- Interaction: every option has at least one clear primary action and visible state.
- Copy: headings are operational, not marketing language.
