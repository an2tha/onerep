import { useMemo } from "react"
import type { EnduranceHeartRateSample } from "@/lib/endurance-workout"
import { formatElapsed } from "@/lib/workout-logging"

type Props = {
  samples: EnduranceHeartRateSample[]
  elapsedSeconds: number
  emptyTitle?: string
  emptyBody?: string
}

export function EnduranceHeartRateChart({
  samples,
  elapsedSeconds,
  emptyTitle = "Waiting for heart rate",
  emptyBody = "Wear your Apple Watch snugly and open OneRep on the watch.",
}: Props) {
  const chart = useMemo(() => {
    if (samples.length === 0) return null
    const minimum = Math.max(40, Math.min(...samples.map((sample) => sample.bpm)) - 8)
    const maximum = Math.max(minimum + 20, Math.max(...samples.map((sample) => sample.bpm)) + 8)
    const duration = Math.max(elapsedSeconds, samples.at(-1)?.elapsedSeconds ?? 1, 1)
    const coordinates = samples.map((sample) => ({
      x: 12 + (sample.elapsedSeconds / duration) * 336,
      y: 140 - ((sample.bpm - minimum) / (maximum - minimum)) * 116,
    }))
    const line = coordinates
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ")
    const area = `${line} L${coordinates.at(-1)?.x.toFixed(1)} 140 L12 140 Z`
    return { minimum, maximum, line, area, coordinates }
  }, [elapsedSeconds, samples])

  if (!chart) {
    return (
      <div className="flex h-48 items-center justify-center border-y border-border text-center">
        <div>
          <p className="text-[14px] font-bold">{emptyTitle}</p>
          <p className="mt-1 max-w-[30ch] text-[12px] leading-5 text-muted-foreground">
            {emptyBody}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <svg
        viewBox="0 0 360 164"
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Heart rate from ${Math.round(chart.minimum)} to ${Math.round(chart.maximum)} beats per minute over ${formatElapsed(elapsedSeconds)}`}
      >
        {[24, 82, 140].map((y) => (
          <line
            key={y}
            x1="12"
            x2="348"
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeWidth="1"
          />
        ))}
        <path d={chart.area} fill="var(--accent-progress)" fillOpacity="0.12" />
        <path
          d={chart.line}
          fill="none"
          stroke="var(--accent-progress)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {chart.coordinates.length === 1 && (
          <circle
            cx={chart.coordinates[0].x}
            cy={chart.coordinates[0].y}
            r="4"
            fill="var(--accent-progress)"
          />
        )}
        <text x="12" y="159" fill="currentColor" fillOpacity="0.6" fontSize="10">
          0:00
        </text>
        <text
          x="348"
          y="159"
          textAnchor="end"
          fill="currentColor"
          fillOpacity="0.6"
          fontSize="10"
        >
          {formatElapsed(elapsedSeconds)}
        </text>
      </svg>
    </div>
  )
}
