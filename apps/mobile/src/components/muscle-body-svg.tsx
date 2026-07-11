import type { MuscleRecovery } from "@/lib/muscle-volume"

type Region = "chest" | "arms" | "core" | "back" | "glutes" | "legs"

const REGION_ALIASES: Record<Region, string[]> = {
  chest: ["chest", "pectorals", "pecs"],
  arms: ["biceps", "triceps", "forearms", "shoulders", "deltoids"],
  core: ["abs", "abdominals", "core", "obliques"],
  back: ["back", "lats", "traps", "rhomboids"],
  glutes: ["glutes", "gluteus"],
  legs: ["quads", "quadriceps", "hamstrings", "calves", "adductors"],
}

function statusForRegion(items: MuscleRecovery[], region: Region) {
  const matches = items.filter((item) =>
    REGION_ALIASES[region].some((alias) => item.muscle.includes(alias))
  )
  if (matches.some((item) => item.status === "trained")) return "trained"
  if (matches.some((item) => item.status === "recovering")) return "recovering"
  if (matches.length > 0) return "overdue"
  return "untracked"
}

const STATUS_FILL = {
  trained: "var(--accent-workout)",
  recovering: "color-mix(in srgb, var(--accent-workout) 55%, transparent)",
  overdue: "color-mix(in srgb, var(--accent-workout) 20%, transparent)",
  untracked: "color-mix(in srgb, currentColor 8%, transparent)",
} as const

export function MuscleBodySvg({
  recovery,
  className,
  x,
  y,
  width,
  height,
}: {
  recovery: MuscleRecovery[]
  className?: string
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
}) {
  const fill = (region: Region) =>
    STATUS_FILL[statusForRegion(recovery, region)]

  return (
    <svg
      viewBox="0 0 120 220"
      role="img"
      aria-label="Human muscle recovery map"
      className={className}
      x={x}
      y={y}
      width={width}
      height={height}
    >
      <g stroke="currentColor" strokeOpacity="0.24" strokeWidth="1.4">
        <circle cx="60" cy="19" r="13" fill="currentColor" fillOpacity="0.08" />
        <path
          d="M49 34 Q60 40 71 34 L79 84 Q70 99 60 101 Q50 99 41 84Z"
          fill={fill("core")}
        />
        <path
          d="M49 38 Q60 32 71 38 L72 61 Q60 69 48 61Z"
          fill={fill("chest")}
        />
        <path
          d="M44 39 Q35 42 31 57 L20 99 Q18 107 24 109 Q30 110 33 102 L45 66Z"
          fill={fill("arms")}
        />
        <path
          d="M76 39 Q85 42 89 57 L100 99 Q102 107 96 109 Q90 110 87 102 L75 66Z"
          fill={fill("arms")}
        />
        <path
          d="M44 82 Q60 94 76 82 L75 111 Q60 121 45 111Z"
          fill={fill("glutes")}
        />
        <path
          d="M46 108 Q52 113 59 114 L55 165 L39 205 Q36 212 43 215 Q49 217 53 210 L66 174 L63 114Z"
          fill={fill("legs")}
        />
        <path
          d="M74 108 Q68 113 61 114 L65 165 L81 205 Q84 212 77 215 Q71 217 67 210 L54 174 L57 114Z"
          fill={fill("legs")}
        />
        <path
          d="M49 65 Q60 72 71 65 L75 83 Q60 94 45 83Z"
          fill={fill("back")}
          fillOpacity="0.55"
        />
      </g>
      <path
        d="M60 41V107"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeDasharray="2 3"
      />
    </svg>
  )
}
