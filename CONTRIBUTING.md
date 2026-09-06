# Contributing

Pull requests are welcome. This repository is a one-way mirror of an internal
OneDev instance: pull requests are reviewed here, applied to the internal
repository, and included in the next published sync. Because they are
transferred manually, keep pull requests focused and self-contained.

For significant changes, open or comment on an issue first so that the scope can
be agreed upon before implementation begins.

## Setup

Bun 1.3.4 or later is required.

```sh
bun install
cp .env.example .env.local
npx convex dev   # creates a free dev deployment and writes the URL into .env.local
bun run dev      # http://localhost:5173
```

No integration keys are required. Without an `OPENROUTER_API_KEY` the
application remains fully functional, and the Coach is available to users who
provide their own OpenRouter key in Settings. The datasource starts empty, so
food search returns no results until a catalog has been imported; see
[apps/datasource/README.md](apps/datasource/README.md) for the food databases
and `bun run exercises:import` for the exercise catalog.

## Verification before submitting

Before submitting a pull request, run:

```sh
bun run typecheck && bun run test && bun run test:convex
```

The third command executes the full Convex integration suite. This repository
also includes source-contract tests that assert the exact user-facing text. If a
test fails because the text was intentionally changed, update the corresponding
test in the same commit.

## Project requirements

- Store secrets in the Convex deployment. Do not expose them as `VITE_*`
  variables.
- Keep `packages/ui` independent of Convex: it renders props and raises
  callbacks only.
- After modifying anything under `convex/ai/prompts/`, run
  `bun run prompts:generate`; otherwise `prompts:check` will fail the build.
- Before working within `convex/`, read
  `convex/_generated/ai/guidelines.md` first. It contains rules that take
  precedence over general Convex documentation.
- Follow these UI conventions: do not use eyebrow labels (small uppercase text
  above a heading) or generic AI-generated phrasing.

## Commit messages

Use conventional commits scoped by area, for example `feat(mobile):`,
`fix(convex):`, or `test(web):`. Cross-cutting changes may list several scopes,
for example `fix(convex,mobile):`.

## Bug reports

A complete report helps the team resolve an issue efficiently. Include:

- The version and platform, available under Settings → About, and whether you
  use the hosted application, the TestFlight beta, or a self-hosted
  installation.
- Steps to reproduce, together with the expected and actual behaviour. Include
  a screenshot or screen recording when it provides useful context.
- Console output, where available. For self-hosted installations, include the
  relevant Convex dashboard logs.
- For layout or styling issues, the browser and viewport dimensions.

## Translations

The interface is available in English, Spanish, French, German, Italian, and
Portuguese ([apps/mobile/src/i18n/locales/](apps/mobile/src/i18n/locales/)).
Add or modify strings in `en.json` and mirror them in the remaining locale files
within the same pull request. New languages are welcome as pull requests that
add the locale file and register it in
`apps/mobile/src/i18n/index.ts`.

## Security

If you believe you have found a security vulnerability, please contact
[support@onerep.life](mailto:support@onerep.life) rather than opening a public
issue, and allow a reasonable period for a fix before any public disclosure.

## License

By contributing, you agree that your work may be used under the project
license ([PolyForm Noncommercial 1.0.0](LICENSE.md)) and within the official
OneRep deployment, which is a commercial service. Authorship is preserved in
the version history.
