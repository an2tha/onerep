# Visual identities

`ThemeProvider` owns two independent choices:

- `theme`: the light, dark, or system appearance.
- `identity`: the product's visual language.

An identity is a typed collection of CSS custom-property overrides. It may
change color, typography, spacing, shape, elevation, and motion without
changing page components. The current OneRep identity intentionally has no
overrides, so the existing stylesheet remains the visual baseline.

```tsx
import {
  ONE_REP_VISUAL_IDENTITY,
  ThemeProvider,
  defineVisualIdentity,
} from "@repo/ui"

const compactIdentity = defineVisualIdentity({
  id: "compact-example",
  label: "Compact example",
  tokens: {
    "--radius-control": "0.4rem",
    "--radius-panel": "0.6rem",
    "--space-4": "0.875rem",
  },
  light: {
    "--surface-app": "#f7f8fa",
    "--foreground": "#17191c",
  },
  dark: {
    "--surface-app": "#101114",
    "--foreground": "#f4f5f6",
  },
})

<ThemeProvider identities={[ONE_REP_VISUAL_IDENTITY, compactIdentity]}>
  {children}
</ThemeProvider>
```

Call `setIdentity(id)` from `useTheme()` to switch identities. Selection is
persisted under `visual-identity` and synchronized across browser tabs. The
provider writes the active id to `data-visual-identity` on the document root,
which is available for the rare component-level variant that cannot be
expressed with tokens alone.

## Token rules

- Prefer the semantic token groups exported as
  `VISUAL_IDENTITY_TOKEN_GROUPS`.
- Feature code consumes variables; it does not assign global identity values.
- Use `--identity-*` only for a value shared across an identity that has no
  existing semantic role.
- Use `--feature-*` for an intentionally local extension.
- Preserve meaningful data colors and status distinctions across identities;
  a visual swap must not make success, danger, or chart series ambiguous.
- Keep layout structure in shared components. Tokens may alter density and
  geometry, but should not encode page-specific positioning.

The visual palette exported from `design-tokens.ts` resolves through CSS
variables with the incumbent hex values as fallbacks. This keeps SVG, chart,
and inline-style consumers switchable without changing their call sites. The
separate `ONE_REP_PALETTE` stays as literal hex because exercise catalogue
colors are serializable product data, not runtime presentation.

Native launcher icons, app names, splash screens, widgets, and store metadata
remain build-time identity concerns rather than runtime theme tokens.
