export type Appearance = "dark" | "light" | "system"
export type ResolvedAppearance = Exclude<Appearance, "system">

/**
 * The stable contract between an identity and the shared UI. Feature CSS may
 * consume these variables, but identity definitions are the only place that
 * should assign them at runtime.
 *
 * The groups are intentionally semantic. A new identity should describe what
 * a value does rather than copying OneRep's material-inspired token names.
 */
export const VISUAL_IDENTITY_TOKEN_GROUPS = {
  typography: ["--font-sans", "--font-heading"],
  layout: [
    "--app-page-x",
    "--space-1",
    "--space-2",
    "--space-3",
    "--space-4",
    "--space-5",
    "--space-6",
    "--space-7",
    "--space-8",
    "--touch-target",
    "--touch-target-compact",
  ],
  shape: [
    "--radius",
    "--radius-row",
    "--radius-control",
    "--radius-panel",
    "--radius-sheet",
    "--app-card-radius",
  ],
  surface: [
    "--surface-app",
    "--surface-panel",
    "--surface-raised",
    "--surface-elevated",
    "--surface-ink",
    "--surface-canvas",
    "--surface-subtle",
    "--surface-pressed",
    "--background",
    "--foreground",
    "--card",
    "--card-foreground",
    "--popover",
    "--popover-foreground",
    "--muted",
    "--muted-foreground",
    "--divider",
    "--divider-strong",
    "--border",
    "--input",
    "--ring",
  ],
  action: [
    "--primary",
    "--primary-foreground",
    "--secondary",
    "--secondary-foreground",
    "--accent",
    "--accent-foreground",
    "--destructive",
  ],
  productAccent: [
    "--accent-food",
    "--accent-food-bg",
    "--accent-water",
    "--accent-water-bg",
    "--accent-supplement",
    "--accent-supplement-bg",
    "--accent-workout",
    "--accent-workout-bg",
    "--accent-training-hero",
    "--accent-progress",
    "--accent-progress-bg",
    "--accent-health",
    "--accent-retro",
    "--accent-retro-bg",
    "--accent-schedule",
    "--accent-schedule-bg",
    "--macro-protein",
    "--macro-carbs",
    "--macro-fat",
    "--hero-wash-tint",
    "--hero-wash-gain",
    "--hero-wash-crown",
    "--hero-wash-shade",
    "--hero-mesh-tint",
  ],
  status: [
    "--status-success",
    "--status-complete",
    "--status-complete-bg",
    "--status-warning",
    "--status-caution",
    "--status-caution-bg",
    "--status-error",
    "--status-danger",
    "--status-danger-bg",
  ],
  elevation: [
    "--shadow-surface",
    "--glass-fill",
    "--glass-rim",
    "--glass-sheen",
    "--glass-pour",
    "--glass-pour-soft",
    "--glass-depth",
  ],
  motion: [
    "--motion-fast",
    "--motion-medium",
    "--motion-tab-fade",
    "--motion-slow",
    "--motion-route",
    "--motion-panel",
    "--motion-ease-standard",
    "--motion-ease-out",
    "--motion-ease-in",
    "--motion-ease-emphasized",
  ],
  data: ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"],
  dataVisualization: [
    "--muscle-biceps",
    "--muscle-triceps",
    "--muscle-calves",
    "--micro-saturated-fat",
    "--micro-potassium",
    "--micro-calcium",
    "--micro-magnesium",
    "--micro-phosphorus",
    "--micro-vitamin-c",
    "--micro-vitamin-a",
    "--micro-vitamin-d",
    "--micro-vitamin-b12",
    "--micro-alcohol",
    "--nutrition-score-b",
  ],
  primitivePalette: [
    "--palette-iron",
    "--palette-rubber",
    "--palette-tape",
    "--palette-plate",
    "--palette-patina",
    "--palette-brass",
    "--palette-violet",
    "--palette-cordovan",
    "--palette-zinc",
    "--palette-chalk-line",
    "--palette-teal",
  ],
} as const

type Values<T> = T[keyof T]
type ListedVisualIdentityToken = Values<
  typeof VISUAL_IDENTITY_TOKEN_GROUPS
>[number]

/** Allows deliberate feature-specific extensions without weakening core names. */
export type VisualIdentityToken =
  ListedVisualIdentityToken | `--identity-${string}` | `--feature-${string}`

export type VisualIdentityTokens = Partial<Record<VisualIdentityToken, string>>

export type VisualIdentityAssets = {
  appName?: string
  appIconSrc?: string
}

export type VisualIdentity = {
  id: string
  label: string
  /** Values shared by light and dark appearances. */
  tokens?: VisualIdentityTokens
  light?: VisualIdentityTokens
  dark?: VisualIdentityTokens
  assets?: VisualIdentityAssets
}

export function defineVisualIdentity<const T extends VisualIdentity>(
  identity: T
) {
  return identity
}

/**
 * OneRep continues to inherit the stylesheet defaults. Keeping this identity
 * override-free guarantees that introducing the switching machinery cannot
 * alter the incumbent rendering.
 */
export const ONE_REP_VISUAL_IDENTITY = defineVisualIdentity({
  id: "onerep",
  label: "OneRep",
  assets: {
    appName: "OneRep",
    appIconSrc: "/app-icon.svg",
  },
})

export const DEFAULT_VISUAL_IDENTITIES: readonly VisualIdentity[] = [
  ONE_REP_VISUAL_IDENTITY,
]

export function resolveVisualIdentityTokens(
  identity: VisualIdentity,
  appearance: ResolvedAppearance
): VisualIdentityTokens {
  return {
    ...identity.tokens,
    ...identity[appearance],
  }
}

export function cssVariable(name: `--${string}`, fallback?: string): string {
  return fallback === undefined ? `var(${name})` : `var(${name}, ${fallback})`
}
