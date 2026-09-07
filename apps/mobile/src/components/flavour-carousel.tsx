import { useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import {
  Barbell,
  Check,
  FlowerLotus,
  Hexagon,
  MoonStars,
  TreeEvergreen,
  Waves,
  type Icon,
} from "@phosphor-icons/react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
  type VisualIdentity,
} from "@repo/ui"
import { hapticTap } from "@/lib/haptics"

type Appearance = "light" | "dark" | "system"

type FlavourProfile = {
  description: string
  icon: Icon
}

const FLAVOUR_PROFILES: Record<string, FlavourProfile> = {
  onerep: {
    description:
      "The original balance of violet, blue, green, and warm training accents.",
    icon: Barbell,
  },
  dusk: {
    description:
      "Warm earth tones meet evening violet for a calmer training space.",
    icon: MoonStars,
  },
  slate: {
    description:
      "A restrained mix of cool blues and quiet, low-saturation mineral tones.",
    icon: Hexagon,
  },
  forest: {
    description:
      "Grounded greens, moss, and amber bring a restorative outdoor feel.",
    icon: TreeEvergreen,
  },
  ocean: {
    description:
      "Clear blues and sea-glass teal give every screen a crisp, energetic rhythm.",
    icon: Waves,
  },
  blossom: {
    description:
      "Rose, lavender, and fresh green make the interface expressive and bright.",
    icon: FlowerLotus,
  },
}

const FALLBACK_PROFILE: FlavourProfile = {
  description: "A distinct visual character for your OneRep experience.",
  icon: Barbell,
}

const ONE_REP_PREVIEW_TOKENS = {
  workout: "#5b5bd6",
  water: "#1673b1",
  food: "#b55324",
  supplement: "#3f7d44",
  surface: "#f2f1ed",
  radius: "14px",
}

const ONE_REP_PREVIEW_TOKENS_DARK = {
  ...ONE_REP_PREVIEW_TOKENS,
  surface: "#181917",
}

type PreviewStyle = CSSProperties & Record<`--flavour-${string}`, string>

function resolvedAppearance(appearance: Appearance) {
  if (appearance !== "system") return appearance
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function previewStyle(
  visualIdentity: VisualIdentity,
  appearance: Appearance
): PreviewStyle {
  const resolved = resolvedAppearance(appearance)
  const tokens = {
    ...visualIdentity.tokens,
    ...visualIdentity[resolved],
  }
  const fallback =
    resolved === "dark" ? ONE_REP_PREVIEW_TOKENS_DARK : ONE_REP_PREVIEW_TOKENS

  return {
    "--flavour-workout":
      tokens["--accent-workout"] ?? fallback.workout,
    "--flavour-water":
      tokens["--accent-water"] ?? fallback.water,
    "--flavour-food":
      tokens["--accent-food"] ?? fallback.food,
    "--flavour-supplement":
      tokens["--accent-supplement"] ?? fallback.supplement,
    "--flavour-surface":
      tokens["--surface-app"] ?? fallback.surface,
    "--flavour-radius":
      tokens["--radius-panel"] ?? fallback.radius,
    "--flavour-font": tokens["--font-sans"] ?? "inherit",
    "--flavour-heading":
      tokens["--font-heading"] ?? tokens["--font-sans"] ?? "inherit",
  }
}

export function FlavourCarousel({
  identities,
  identity,
  appearance,
  onChange,
}: {
  identities: readonly VisualIdentity[]
  identity: string
  appearance: Appearance
  onChange: (identity: string) => void
}) {
  const [initialIndex] = useState(() =>
    Math.max(
      0,
      identities.findIndex((item) => item.id === identity)
    )
  )
  // Frozen after mount: a fresh object every render would make embla
  // re-initialise under the finger, snapping the swipe back.
  const carouselOpts = useMemo(
    () => ({ align: "center" as const, loop: true, startIndex: initialIndex }),
    [initialIndex]
  )
  const [api, setApi] = useState<CarouselApi>()
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)

  const selectCurrent = useCallback(
    (carouselApi: NonNullable<CarouselApi>) => {
      const nextIndex = carouselApi.selectedScrollSnap()
      const nextIdentity = identities[nextIndex]
      setSelectedIndex(nextIndex)
      if (nextIdentity && nextIdentity.id !== identity) {
        hapticTap()
        onChange(nextIdentity.id)
      }
    },
    [identities, identity, onChange]
  )

  useEffect(() => {
    if (!api) return
    selectCurrent(api)
    api.on("select", selectCurrent)
    api.on("reInit", selectCurrent)
    return () => {
      api.off("select", selectCurrent)
      api.off("reInit", selectCurrent)
    }
  }, [api, selectCurrent])

  useEffect(() => {
    if (!api) return
    const nextIndex = identities.findIndex((item) => item.id === identity)
    if (nextIndex >= 0 && nextIndex !== api.selectedScrollSnap()) {
      api.scrollTo(nextIndex)
    }
  }, [api, identities, identity])

  const slideStyles = useMemo(
    () => identities.map((item) => previewStyle(item, appearance)),
    [appearance, identities]
  )

  if (identities.length === 0) return null

  return (
    <section className="flavour-carousel" aria-label="Choose a flavour">
      <Carousel opts={carouselOpts} setApi={setApi}>
        <CarouselContent>
          {identities.map((visualIdentity, index) => {
            const profile =
              FLAVOUR_PROFILES[visualIdentity.id] ?? FALLBACK_PROFILE
            const FlavourIcon = profile.icon
            const selected = visualIdentity.id === identity

            return (
              <CarouselItem key={visualIdentity.id}>
                <article
                  className="flavour-slide"
                  aria-label={`${visualIdentity.label} flavour`}
                  style={slideStyles[index]}
                >
                  <div
                    className="flavour-preview"
                    data-appearance={resolvedAppearance(appearance)}
                    style={slideStyles[index]}
                    aria-hidden="true"
                  >
                    <div className="flavour-preview-topbar">
                      <span className="flavour-preview-avatar">
                        <FlavourIcon size={18} weight="fill" />
                      </span>
                      <span className="flavour-preview-line flavour-preview-line-short" />
                    </div>
                    <div className="flavour-preview-hero">
                      <span className="flavour-preview-greeting">
                        Good morning
                      </span>
                      <span className="flavour-preview-line flavour-preview-line-copy" />
                      <span className="flavour-preview-line flavour-preview-line-copy-short" />
                    </div>
                    <div className="flavour-preview-grid">
                      <span data-tone="workout" />
                      <span data-tone="water" />
                      <span data-tone="food" />
                    </div>
                    <div className="flavour-preview-rows">
                      <span>
                        <i data-tone="supplement" />
                        <b />
                      </span>
                      <span>
                        <i data-tone="workout" />
                        <b />
                      </span>
                    </div>
                  </div>

                  <div className="flavour-slide-copy">
                    <span className="flavour-slide-icon" aria-hidden="true">
                      <FlavourIcon size={24} weight="regular" />
                    </span>
                    <div>
                      <div className="flavour-slide-title">
                        <h3>{visualIdentity.label}</h3>
                        {selected && (
                          <span className="flavour-selected">
                            <Check size={13} weight="bold" /> Selected
                          </span>
                        )}
                      </div>
                      <p>{profile.description}</p>
                    </div>
                  </div>
                </article>
              </CarouselItem>
            )
          })}
        </CarouselContent>
        <div className="flavour-carousel-nav">
          <CarouselPrevious className="flavour-carousel-arrow" />
          <div
            className="flavour-carousel-dots"
            aria-label="Choose flavour slide"
          >
            {identities.map((visualIdentity, index) => (
              <button
                key={visualIdentity.id}
                type="button"
                aria-label={`Show ${visualIdentity.label}`}
                aria-pressed={selectedIndex === index}
                onClick={() => api?.scrollTo(index)}
              />
            ))}
          </div>
          <CarouselNext className="flavour-carousel-arrow" />
        </div>
      </Carousel>
    </section>
  )
}
