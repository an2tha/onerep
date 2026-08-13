# Testing

There are three test runners in this repository, which is two more than
anyone wanted. This page says which one runs what, so you spend your time
failing tests rather than discovering them.

## The commands

| Command                                 | Runner                 | What it actually runs                                                                                                  |
| --------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `bun run test`                          | Turbo → Bun Test       | Every workspace's `test` task, plus the focused Convex unit list below. **Does not run the Convex integration suite.** |
| `bun run test:convex`                   | Vitest + `convex-test` | The full Convex integration suite in `convex/__tests__/`, against an in-memory Convex.                                 |
| `bun run test:convex-unit`              | Bun Test               | A hardcoded list of pure-logic Convex tests in the root `package.json`.                                                |
| `bun run test:watch`                    | Bun Test               | Watch mode, excluding the Convex integration tests.                                                                    |
| `bun run test:coverage`                 | Bun Test               | Coverage, same exclusion.                                                                                              |
| `cd apps/mobile && bun run test:visual` | Playwright             | Visual regression. Needs `E2E_STORAGE_STATE` for authenticated pages.                                                  |

Before calling anything done, the honest minimum is:

```bash
bun run typecheck
bun run test
bun run test:convex
```

The last one is the easiest to forget and the one that knows the most.

## Things that will bite you exactly once

- **New pure Convex unit tests are invisible until registered.**
  `test:convex-unit` is an explicit file list in the root `package.json`. A
  new file that isn't appended there passes review, merges, and never runs.
  Integration tests in `convex/__tests__/` are picked up automatically — but
  only by `test:convex`.

- **The mobile suite is one Bun process.** All test files under
  `apps/mobile/src` share a process, so `mock.module` patches leak across
  files for anything resolved at call time — but a value captured into a
  module-scope `const` at import time stays whatever the first importer saw.
  If a test passes alone and fails in the full run, this is why. The fix is
  in the source: read platform/plugin state inside functions, not into
  module-scope constants.

- **Source-contract tests exist and are load-bearing.** Several suites (for
  example `apps/mobile/src/pages/settings.test.ts`) read component source and
  assert copy, accessibility attributes, and structure with regexes. Moving
  code between files moves the obligation: take the assertions with it, as
  was done when the payment UI moved behind its seam.

- **File-descriptor limits.** If `bun test` from `apps/mobile` dies with
  `EMFILE`/`EBADF` noise, run it from `apps/mobile/src` instead, or raise
  `ulimit -n` first. The tests are fine; the default limit is not.

- **CI runs Node tools on Bun.** The CI image has no Node binary, so anything
  invoked there runs under Bun's Node compatibility. When CI fails on
  something that passes locally, reproduce with `bunx --bun <tool>` before
  assuming the test is flaky.

## Where tests live

| Location                                       | Kind                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `convex/__tests__/*.convex.test.ts`            | Integration, via `convex-test`.                   |
| `convex/lib/__tests__/`, `convex/ai/*.test.ts` | Pure logic, Bun Test (register in the unit list). |
| `apps/mobile/src/**/*.test.ts`                 | Mobile unit + source-contract tests, Bun Test.    |
| `apps/mobile` Playwright config                | Visual regression.                                |
| `packages/ui/src/**/*.test.ts`                 | Shared component logic, Bun Test.                 |

If a behavior matters, it gets a test at the lowest layer that can observe
it — pure function first, `convex-test` second, source-contract when the
thing that matters is literally the words on the screen.
