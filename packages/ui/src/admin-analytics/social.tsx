import { useRef, useState } from "react"
import type { TikTokSnapshot } from "@repo/models"
import type { InstagramSnapshot } from "@repo/models"
import { TikTokAnalytics } from "./tiktok"
import { InstagramAnalytics } from "./instagram"

const networks = ["TikTok", "Instagram"] as const
export function SocialAnalytics({
  tiktok,
  instagram,
}: {
  tiktok: TikTokSnapshot | null | undefined
  instagram: InstagramSnapshot | null | undefined
}) {
  const [selected, setSelected] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <section aria-label="Social analytics" className="space-y-3">
      <div
        role="tablist"
        aria-label="Social network"
        className="flex gap-5 border-b border-border"
      >
        {networks.map((network, index) => (
          <button
            key={network}
            ref={(element) => {
              tabs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`social-tab-${index}`}
            aria-controls={`social-panel-${index}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? networks.length - 1
                    : event.key === "ArrowRight"
                      ? (index + 1) % networks.length
                      : event.key === "ArrowLeft"
                        ? (index + networks.length - 1) % networks.length
                        : null
              if (next === null) return
              event.preventDefault()
              setSelected(next)
              tabs.current[next]?.focus()
            }}
            className={`min-h-11 border-b-2 px-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${selected === index ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {network}
          </button>
        ))}
      </div>
      {networks.map((network, index) => (
        <div
          key={network}
          role="tabpanel"
          id={`social-panel-${index}`}
          aria-labelledby={`social-tab-${index}`}
          hidden={selected !== index}
          tabIndex={0}
          className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {network === "TikTok" ? (
            <TikTokAnalytics snapshot={tiktok} />
          ) : (
            <InstagramAnalytics snapshot={instagram} />
          )}
        </div>
      ))}
    </section>
  )
}
