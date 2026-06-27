# OneRep mobile UI — grounded retry

This retry intentionally avoids the earlier AI-looking problems: decorative fake phone frames, over-stylized metaphors, muddy colours, slogan-like text, and repeated presentation scaffolds.

## Reference-to-decision map

- Apple HIG: primary content fits one mobile viewport, controls are at least 44px high, controls sit near affected content, text is legible, and contrast is checked through simple surface/text pairs.
- Linear: product credibility comes from real artifacts and states. These screens show queued sync, serving mismatch, Open Food Facts barcode context, set rows, RPE, rest timer, next movement, and undo copy.
- Raycast: speed is expressed through direct actions and tight interaction language, not through command-palette cosplay.
- Teenage Engineering: restraint and product vocabulary matter. The UI uses short labels and disciplined surfaces instead of decorative illustrations.
- Negative references: no cluttered widget dump, no tiny controls, no low-contrast labels, no hidden save consequences, no vague marketing copy.

## Pre-code contract

Content model:
- Real nouns: calories, water, Upper A, Vitamin D, barcode, Oatly Barista, serving, nutrition facts, bench press, RPE, rest timer.
- User actions: log lunch, add water, start workout, choose serving, save to lunch, complete set.
- Imperfect states: 2 queued sync changes, serving mismatch, undo after save, RPE pending, set not complete.

Visual system:
- Typography: Instrument Sans from the actual OneRep app; large numeric role for kcal/timer; 16-ish readable body; restrained all-caps labels.
- Colours: actual OneRep-like semantic tokens. Light screens use app background `#f4f3ef`, panel `#fbfaf7`, ink `#171a18`; dark workout uses `#0d0d0c`, `#161615`, `#f5f4ef`.
- Component grammar: small radii from the app tokens, 1px dividers, minimal shadows, black primary action in light mode, pale primary action in dark mode.
- Layout: full mobile viewport previews without fake bezels; one primary action per screen.

## Options

1. `option-01-today-native.html` — daily home screen.
2. `option-02-food-review.html` — barcode/serving review.
3. `option-03-active-workout.html` — active workout set entry.
