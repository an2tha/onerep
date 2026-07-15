# `@repo/ui`

`@repo/ui` is the repository's presentation boundary. It owns shared
primitives, semantic mobile components, and feature presenters. Applications
own routing, data fetching, mutations, authentication, platform APIs, haptics,
storage, and feature state.

## Imports

The root entry point remains available for compatibility. Prefer the focused
entry points for feature code:

- `@repo/ui/mobile`
- `@repo/ui/workout`
- `@repo/ui/nutrition`
- `@repo/ui/progress`
- `@repo/ui/settings`
- `@repo/ui/home`

Import the canonical stylesheet once from `@repo/ui/styles.css`.

## Adding UI

Components in this package receive serializable view data, controlled values,
content slots, and callbacks. They must not import Convex, application routes,
application stores, Capacitor, native services, or generated backend types.

`packages/ui/components.json` is the only shadcn configuration in the
repository. Run shadcn from this directory, for example:

```sh
cd packages/ui
bunx shadcn@latest add button
```

Export supported components from the appropriate focused entry point and from
the compatibility root when existing callers need it. The package-boundary
tests enforce the dependency direction and mobile's primitive-import rules.
