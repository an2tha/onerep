import { tr } from "@repo/ui/i18n"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { Check } from "@phosphor-icons/react"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi, type VisualIdentity } from "@repo/ui"
import { hapticTap } from "@/lib/haptics"

type Appearance = "light" | "dark" | "system"

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
    "--flavour-workout": tokens["--accent-workout"] ?? fallback.workout,
    "--flavour-water": tokens["--accent-water"] ?? fallback.water,
    "--flavour-food": tokens["--accent-food"] ?? fallback.food,
    "--flavour-supplement":
      tokens["--accent-supplement"] ?? fallback.supplement,
    "--flavour-surface": tokens["--surface-app"] ?? fallback.surface,
    "--flavour-radius": tokens["--radius-panel"] ?? fallback.radius,
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
    <section className="flavour-carousel" aria-label={tr("Choose a flavour")}>
      <Carousel opts={carouselOpts} setApi={setApi}>
        <CarouselContent>
          {identities.map((visualIdentity, index) => {
            const selected = visualIdentity.id === identity

            return (
              <CarouselItem key={visualIdentity.id}>
                <article
                  className="flavour-slide"
                  aria-label={tr("{{value0}} flavour", {
                    value0: visualIdentity.label,
                  })}
                  style={slideStyles[index]}
                >
                  <div className="flavour-heading">
                    <h3>{visualIdentity.label}</h3>
                    {selected && <Check size={20} aria-label={tr("Selected")} />}
                  </div>
                  <div className="flavour-preview" data-appearance={resolvedAppearance(appearance)}>
                    {[
                      ["workout", tr("Training")],
                      ["water", tr("Water")],
                      ["food", tr("Nutrition")],
                      ["supplement", tr("Supplements")],
                    ].map(([tone, label]) => (
                      <div className="flavour-swatch" key={tone}>
                        <span style={{ background: `var(--flavour-${tone})` }} aria-hidden="true" />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </CarouselItem>
            )
          })}
        </CarouselContent>
        <div className="flavour-carousel-nav">
          <div
            className="flavour-carousel-dots"
            aria-label={tr("Choose flavour slide")}
          >
            {identities.map((visualIdentity, index) => (
              <button
                key={visualIdentity.id}
                type="button"
                aria-label={tr("Show {{value0}}", {
                  value0: visualIdentity.label,
                })}
                aria-pressed={selectedIndex === index}
                onClick={() => api?.scrollTo(index)}
              >
                {visualIdentity.label}
              </button>
            ))}
          </div>
        </div>
      </Carousel>
    </section>
  )
}
