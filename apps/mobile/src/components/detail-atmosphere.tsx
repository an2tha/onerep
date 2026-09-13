import type { ReactNode } from "react"
import { ReactiveOrbField } from "./reactive-orb-field"
import { SleepSky } from "./sleep-sky"
import "./detail-atmosphere.css"

/** The page owns its atmosphere; translucent content never paints over it. */
export function DetailAtmosphere({
  tone,
  children,
  sidebar = true,
}: {
  tone: "sleep" | "health" | "endurance"
  children: ReactNode
  sidebar?: boolean
}) {
  return (
    <div
      className={`detail-atmosphere detail-atmosphere--${tone}`}
      data-detail-sidebar={sidebar || undefined}
    >
      <div className="detail-atmosphere-backdrop" aria-hidden="true">
        {tone === "sleep" ? (
          <SleepSky />
        ) : (
          <ReactiveOrbField
            className={
              tone === "endurance" ? "endurance-hero-wash" : "health-hero-wash"
            }
          />
        )}
      </div>
      <div className="detail-atmosphere-content">{children}</div>
    </div>
  )
}
