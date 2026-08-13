# apps/mobile

The OneRep client — one React codebase shipped three ways: responsive web app,
installable PWA, and Capacitor shells for iOS and Android. If a user touches
it, it lives here.

Setup, environment variables, and the development loop are documented in the
[repository README](../../README.md); the system it fits into is in
[`docs/architecture.md`](../../docs/architecture.md). What follows is only
what is specific to this workspace.

## Boundaries

- Presentation primitives come from [`@repo/ui`](../../packages/ui/README.md).
  This app owns routing, Convex calls, auth, platform APIs, storage, and
  feature state; the package owns how things look. Keep it that way.
- The payment UI is a seam: `src/components/billing/index.tsx` is generated
  (gitignored) and defaults to the stub. See
  [`docs/billing.md`](../../docs/billing.md).

## Native work

```bash
bun run build        # build web assets first, always
bunx cap sync
bunx cap open ios    # or android
```

The iOS and Android projects are checked in under `ios/` and `android/`.
Production builds refuse placeholder or development Convex URLs by design —
if the build fails there, it is protecting you from shipping a client wired
to your dev database.

## Tests

Run from `src/` (`cd src && bun test`) to stay under the file-descriptor
limit, and read [`docs/testing.md`](../../docs/testing.md) before trusting a
green run — this suite has opinions, including source-contract tests that
assert the actual words on the screen.
