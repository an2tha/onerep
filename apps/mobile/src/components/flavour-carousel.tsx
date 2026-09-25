import { Message, tr } from "@repo/ui/i18n"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import {
  Barbell,
  ChartLineUp,
  Check,
  FlowerLotus,
  ForkKnife,
  Hexagon,
  MoonStars,
  Pill,
  Sparkle,
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
  preview: PreviewScene
}

type PreviewScene =
  "today" | "training" | "progress" | "supplements" | "nutrition" | "coach"

const FLAVOUR_PROFILES: Record<string, FlavourProfile> = {
  onerep: {
    description: tr(
      "The original balance of violet, blue, green, and warm training accents."
    ),
    icon: Barbell,
    preview: "today",
  },
  dusk: {
    description: tr(
      "Warm earth tones meet evening violet for a calmer training space."
    ),
    icon: MoonStars,
    preview: "training",
  },
  slate: {
    description: tr(
      "A restrained mix of cool blues and quiet, low-saturation mineral tones."
    ),
    icon: Hexagon,
    preview: "progress",
  },
  forest: {
    description: tr(
      "Grounded greens, moss, and amber bring a restorative outdoor feel."
    ),
    icon: TreeEvergreen,
    preview: "supplements",
  },
  ocean: {
    description: tr(
      "Clear blues and sea-glass teal give every screen a crisp, energetic rhythm."
    ),
    icon: Waves,
    preview: "nutrition",
  },
  blossom: {
    description: tr(
      "Rose, lavender, and fresh green make the interface expressive and bright."
    ),
    icon: FlowerLotus,
    preview: "coach",
  },
}

const FALLBACK_PROFILE: FlavourProfile = {
  description: tr("A distinct visual character for your OneRep experience."),
  icon: Barbell,
  preview: "today",
}

const PREVIEW_META: Record<PreviewScene, { label: string; icon: Icon }> = {
  today: { label: tr("Today"), icon: Barbell },
  training: { label: tr("Training"), icon: Barbell },
  progress: { label: tr("Progress"), icon: ChartLineUp },
  supplements: { label: tr("Supplements"), icon: Pill },
  nutrition: { label: tr("Nutrition"), icon: ForkKnife },
  coach: { label: tr("Coach"), icon: Sparkle },
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

function PreviewSceneContent({ scene }: { scene: PreviewScene }) {
  if (scene === "today") {
    return (
      <>
        <div className="flavour-mini-heading">
          <strong>{tr("Today")}</strong>
          <span>{tr("9 September")}</span>
        </div>
        <div className="flavour-mini-week">
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
            <span key={`${day}-${index}`} data-active={index === 2}>
              {day}
              <i />
            </span>
          ))}
        </div>
        <div className="flavour-mini-dials">
          <span data-tone="workout">
            <b>3</b>
            <i>{tr("sets")}</i>
          </span>
          <span data-tone="water">
            <b>1.6</b>
            <i>{tr("litres")}</i>
          </span>
          <span data-tone="food">
            <b>118</b>
            <i>{tr("protein")}</i>
          </span>
        </div>
        <div className="flavour-mini-timeline">
          <span>
            <time>08:30</time>
            <i data-tone="food" />
            <b>{tr("Breakfast")}</b>
          </span>
          <span>
            <time>12:00</time>
            <i data-tone="workout" />
            <b>{tr("Upper body")}</b>
          </span>
        </div>
      </>
    )
  }

  if (scene === "training") {
    return (
      <>
        <div className="flavour-mini-heading">
          <strong>{tr("Training")}</strong>
          <span>{tr("This week")}</span>
        </div>
        <div className="flavour-mini-bars" aria-hidden="true">
          {[34, 72, 46, 88, 58, 24, 12].map((height, index) => (
            <span key={index}>
              <i style={{ height: `${height}%` }} />
            </span>
          ))}
        </div>
        <div className="flavour-mini-section-title">
          <strong>{tr("Today’s workout")}</strong>
          <span>{tr("5 exercises")}</span>
        </div>
        <div className="flavour-mini-set-list">
          <span>
            <b>{tr("Back squat")}</b>
            <i>3 × 8</i>
            <em />
          </span>
          <span>
            <b>{tr("Romanian deadlift")}</b>
            <i>3 × 10</i>
            <em />
          </span>
        </div>
      </>
    )
  }

  if (scene === "nutrition") {
    return (
      <>
        <div className="flavour-mini-heading">
          <strong>{tr("Nutrition")}</strong>
          <span>{tr("Today")}</span>
        </div>
        <div className="flavour-mini-energy">
          <span className="flavour-mini-energy-ring">
            <b>1,640</b>
            <i>{tr("kcal")}</i>
          </span>
          <span>
            <strong>{tr("560 left")}</strong>
            <i>{tr("of 2,200 kcal")}</i>
          </span>
        </div>
        <div className="flavour-mini-goals">
          <span data-tone="workout">
            <b>{tr("Protein")}</b>
            <i />
            <em>{tr("118g")}</em>
          </span>
          <span data-tone="water">
            <b>{tr("Carbs")}</b>
            <i />
            <em>{tr("184g")}</em>
          </span>
          <span data-tone="food">
            <b>{tr("Fat")}</b>
            <i />
            <em>{tr("62g")}</em>
          </span>
        </div>
      </>
    )
  }

  if (scene === "progress") {
    return (
      <>
        <div className="flavour-mini-heading">
          <strong>{tr("Progress")}</strong>
          <span>{tr("12 weeks")}</span>
        </div>
        <div className="flavour-mini-measure">
          <span>
            <strong>78.4</strong>
            <i>{tr("kg")}</i>
          </span>
          <b>{tr("−0.6 kg this month")}</b>
        </div>
        <svg
          className="flavour-mini-chart"
          viewBox="0 0 420 82"
          preserveAspectRatio="none"
        >
          <path
            className="flavour-mini-chart-grid"
            d="M0 16H420M0 41H420M0 66H420"
          />
          <path
            className="flavour-mini-chart-line"
            d="M2 18 C48 16 56 35 102 31 S160 54 207 45 S272 63 314 55 S365 71 418 61"
          />
        </svg>
        <div className="flavour-mini-stat-row">
          <span>
            <b>12</b>
            <i>{tr("workouts")}</i>
          </span>
          <span>
            <b>84%</b>
            <i>{tr("consistency")}</i>
          </span>
          <span>
            <b>+7</b>
            <i>{tr("best sets")}</i>
          </span>
        </div>
      </>
    )
  }

  if (scene === "supplements") {
    return (
      <>
        <div className="flavour-mini-heading">
          <strong>{tr("Supplements")}</strong>
          <span>{tr("Today")}</span>
        </div>
        <div className="flavour-mini-adherence">
          <span>
            <strong>{tr("3 of 4")}</strong>
            <i>{tr("taken today")}</i>
          </span>
          <b>75%</b>
        </div>
        <div className="flavour-mini-checklist">
          {[
            ["Vitamin D", true],
            ["Creatine", true],
            ["Magnesium", false],
          ].map(([label, checked]) => (
            <span key={String(label)} data-checked={checked}>
              <i>{checked ? <Check size={9} weight="bold" /> : null}</i>
              <b>{label}</b>
              <em>{checked ? tr("Taken") : tr("Evening")}</em>
            </span>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flavour-mini-heading">
        <strong>{tr("Good morning.")}</strong>
        <span>{tr("Coach")}</span>
      </div>
      <div className="flavour-mini-coach">
        <span className="flavour-mini-coach-mark">
          <Sparkle size={15} weight="fill" />
        </span>
        <p>
          {tr(
            "You’re close to your protein target. Want a simple dinner idea?"
          )}
        </p>
      </div>
      <div className="flavour-mini-replies">
        <span>{tr("Show me an idea")}</span>
        <span>{tr("Check my day")}</span>
      </div>
      <div className="flavour-mini-composer">
        <span>{tr("Ask OneRep")}</span>
        <Sparkle size={12} weight="fill" />
      </div>
    </>
  )
}

function FlavourPreview({ profile }: { profile: FlavourProfile }) {
  const meta = PREVIEW_META[profile.preview]
  const PageIcon = meta.icon

  return (
    <>
      <div className="flavour-preview-chrome">
        <span className="flavour-preview-brand">
          <Message
            text={"{{value0}}OneRep"}
            values={{
              value0: (
                <span>
                  <PageIcon size={12} weight="bold" />
                </span>
              ),
            }}
          />
        </span>
        <span className="flavour-preview-page">{meta.label}</span>
      </div>
      <div className="flavour-preview-scene" data-scene={profile.preview}>
        <PreviewSceneContent scene={profile.preview} />
      </div>
    </>
  )
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
            const profile =
              FLAVOUR_PROFILES[visualIdentity.id] ?? FALLBACK_PROFILE
            const FlavourIcon = profile.icon
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
                  <div
                    className="flavour-preview"
                    data-flavour={visualIdentity.id}
                    data-appearance={resolvedAppearance(appearance)}
                    style={slideStyles[index]}
                    aria-hidden="true"
                  >
                    <FlavourPreview profile={profile} />
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
                            <Message
                              text={"{{value0}} Selected"}
                              values={{
                                value0: <Check size={13} weight="bold" />,
                              }}
                            />
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
              />
            ))}
          </div>
          <CarouselNext className="flavour-carousel-arrow" />
        </div>
      </Carousel>
    </section>
  )
}
