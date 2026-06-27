# OneRep mobile UI previews — rebuilt pass

The previous set failed the de-ai-fy audit because it still looked like AI preview furniture: repeated fake phone shells, similar rounded card stacks, soft generic palettes, and rationale-heavy presentation behavior. This pass discards those variants instead of polishing them.

## References revisited

Positive examples from `good-websites.txt` were used as principles, not copied:

- Exat / typography-led references: let one type system drive hierarchy instead of sprinkling generic labels.
- Teenage Engineering: product-specific vocabulary, terse controls, material cues, and objects that feel physical.
- Linear/Raycast: product UI is credible when real artifacts, statuses, and consequences are visible.
- Apple/editorial sequencing: each screen should have a chapter and a point, not a pile of widgets.
- Awwwards/CSSDA/Godly-style variety: strong directions should not share one house scaffold.

Negative examples from `bad-examples.txt` were converted into constraints:

- Arngren/Goodreads-style clutter: no screen gets equal-weight widgets everywhere.
- User Inyerface / dark-pattern examples: every save has visible consequences and reversible language.
- Mobile failure references: no tiny desktop controls, no horizontal overflow, no hidden primary action.
- Dated legacy minimalism: speed and clarity are good; tiny undifferentiated lists are not.

## New divergence contract

| Option | Scenario | Structural move | Why it is less AI-looking |
| --- | --- | --- | --- |
| 01 Rack Timer | Mid-workout bench press, rest timer running, set 3 next. | Full-screen rack console with plate stack, vertical workout spine, and mechanical set rows. | Uses gym artifacts and an urgent live flow instead of a generic dashboard. |
| 02 Barcode Counter | Food scan returns two possible products and a serving mismatch. | Barcode + nutrition label + warning counter. | Shows ambiguity, serving review, undo, and Open Food Facts context. |
| 03 Split Map | Weekly split planning before starting Pull B. | Seven-day board with muscle-load body diagram and recovery risk. | The week is the main object, not a card pile. |
| 04 Log Dial | Quick add from the Today surface. | Thumb-first radial dial with review-before-save feed. | Replaces command palette cosplay with a mobile-specific gesture model. |
| 05 Body Contact Sheet | Progress photo/measurement check-in. | Private photo-lab contact sheet with retake/sync state. | Uses a sensitive, domain-specific flow with privacy constraints. |

## Rejection checklist now enforced

- No repeated side rationale panels.
- No broad option may be only a palette swap.
- No repeated `phone > status > cards > bottom nav` skeleton across the set.
- Every option must include a real imperfect state: queued sync, serving mismatch, recovery risk, review-before-save, or retake required.
- Every option must have a visual metaphor tied to OneRep: rack, barcode counter, split map, thumb dial, contact sheet.
- Copy must be blunt and product-specific; no “smarter wellness dashboard” filler.

## Files

1. `option-01-rack-timer.html`
2. `option-02-barcode-counter.html`
3. `option-03-split-map.html`
4. `option-04-log-dial.html`
5. `option-05-body-contact-sheet.html`
