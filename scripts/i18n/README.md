# OneRep app translations

The app supports English, German, Spanish, French, Italian and European Portuguese. App-owned interface copy lives in `packages/ui/src/locales`. User names, saved content and generated Coach responses are not translated after the fact.

Use `tr("Complete sentence {{value0}}", { value0: value })` for text and `Message` for sentences containing React controls. Keep whole sentences together so translators can reorder them. Use `choice(condition ? "source wording" : "other wording")` for static wording inside an interpolated sentence. Plural suffixes in existing messages resolve to complete singular and plural catalogue entries before translation. New copy should prefer explicit complete singular and plural sentences.

Never translate database keys, routes, enum values, parser inputs, CSS, SVG paths or user-authored values. Translate their labels at the display boundary. `uiLocale()` supplies the selected locale for dates and numbers. Calendar components use the corresponding DayPicker locale, including accessibility labels.

The shared runtime initializes before module-level label constants. Selecting a language persists it and reloads the shell so those constants and native navigation labels are recreated consistently.

- `bun run i18n:extract` collects current source messages. Additional native and built-in display labels live in `additional-messages.json`.
- `node scripts/i18n/translate.mjs` drafts missing entries using explicit `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` environment variables. Requests are restricted to Azure with zero data retention. Review generated copy, especially billing, health and permissions.
- `node scripts/i18n/finalize.mjs` applies `reviewed.json` and removes obsolete entries. Run only after the translation job finishes.
- `bun run i18n:native` regenerates iOS, watch, widget and Android resources from validated app translations.
- `bun run test:i18n` checks coverage, interpolation, safe rich text, plural messages, locale handling and stable schedule keys.

The mobile build checks every source message against all six catalogues. Native string catalogues use the operating system’s app language; the web interface uses the language selected in OneRep.

`tests/visual/fixtures/i18n.html` renders the actual preferences, calendar and purchase components for browser checks. Existing source contracts use `localized-source.ts` to reconstruct equivalent English expressions without executing application code; runtime localization has separate tests.


For on-device drafting on macOS 26 or later, compile `translate-local.swift` with `swiftc -parse-as-library scripts/i18n/translate-local.swift -o /tmp/onerep-translate`. Apple Translation language models must already be installed. Pass a JSON array of `{ "language": "de", "source": "Complete English message" }` requests and an output JSONL path. The translator preserves interpolation tokens and appends completed results, so interrupted jobs can resume with only missing entries. It does not download models or call a paid translation service.

Import completed results with `node scripts/i18n/import-local.mjs results.jsonl`, then review the wording and run `finalize.mjs`, `i18n:check` and `i18n:native`. Add editorial corrections to `reviewed.json` so later draft imports cannot replace them during finalization. Provider authorization or budget errors stop the optional remote drafting script immediately.
