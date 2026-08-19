export type MuscleRecoveryItem = {
  muscle: string
  status: "trained" | "recovering" | "overdue"
  daysSinceLastTrained: number
  effectiveSets: number
  lastTrainedDate?: string
  primarySets?: number
  secondarySets?: number
}

/**
 * The catalog hands us free-form muscle names ("middle back", "quadriceps",
 * "delts"), so every group carries the spellings we have actually seen plus the
 * obvious synonyms. Matching is substring-based against the normalised name.
 */
type Group =
  | "neck"
  | "traps"
  | "shoulders"
  | "chest"
  | "abs"
  | "obliques"
  | "biceps"
  | "triceps"
  | "forearms"
  | "lats"
  | "midback"
  | "lowerback"
  | "glutes"
  | "quads"
  | "adductors"
  | "hamstrings"
  | "calves"

const GROUP_ALIASES: Record<Group, string[]> = {
  neck: ["neck"],
  traps: ["trap"],
  shoulders: ["shoulder", "delt"],
  chest: ["chest", "pec"],
  abs: ["abdominal", "abs", "core"],
  obliques: ["oblique", "serratus"],
  biceps: ["bicep", "brachialis"],
  triceps: ["tricep"],
  forearms: ["forearm", "grip", "wrist"],
  lats: ["lat", "latissimus"],
  midback: ["middle back", "mid back", "upper back", "rhomboid", "teres"],
  lowerback: ["lower back", "erector", "spinae"],
  glutes: ["glute", "gluteus", "abductor", "hip"],
  quads: ["quad", "thigh"],
  adductors: ["adductor", "groin"],
  hamstrings: ["hamstring"],
  calves: ["calf", "calves", "soleus", "gastro"],
}

type Heat = "trained" | "recovering" | "overdue" | "untracked"

function heatFor(items: MuscleRecoveryItem[], group: Group): Heat {
  const matches = items.filter((item) => {
    const name = item.muscle.toLowerCase()
    return GROUP_ALIASES[group].some((alias) => name.includes(alias))
  })
  if (matches.length === 0) return "untracked"
  if (matches.some((item) => item.status === "trained")) return "trained"
  if (matches.some((item) => item.status === "recovering")) return "recovering"
  return "overdue"
}

export const MUSCLE_HEAT_FILL: Record<Heat, string> = {
  trained: "var(--accent-workout)",
  recovering: "color-mix(in srgb, var(--accent-workout) 46%, transparent)",
  overdue: "color-mix(in srgb, currentColor 16%, transparent)",
  untracked: "color-mix(in srgb, currentColor 7%, transparent)",
}

/**
 * Everything below is authored as the figure's left half in a local space where
 * x = 0 is the spine and y runs 9 (crown) to 258 (soles). The right half is the
 * same paths mirrored, which is what bodies do anyway and halves the drawing.
 */
const SILHOUETTE_OUTLINE = [
  "M0 9",
  "C-8 9 -12 16 -12 25",
  "C-12 34 -9 40 -6 42",
  "L-8 50",
  "L-21 54",
  "C-31 57 -39 64 -40 76",
  "L-39 114",
  "L-37 144",
  "C-36 156 -34 166 -31 168",
  "C-27 170 -25 165 -25 158",
  "L-29 144",
  "L-30 114",
  "L-31 80",
  "L-30 62",
  "C-27 74 -26 90 -24 100",
  "L-19 110",
  "C-24 120 -26 128 -26 138",
  "C-25 152 -22 172 -17 192",
  "L-16 198",
  "C-18 212 -17 228 -12 242",
  "L-10 250",
  "C-10 257 -3 258 -2 252",
  "L-3 242",
  "L-7 212",
  "L-10 198",
  "L-9 172",
  "L-6 150",
  "L0 136",
].join(" ")

const SILHOUETTE = `${SILHOUETTE_OUTLINE} Z`

const FRONT: Partial<Record<Group, string>> = {
  neck: "M-6 42 L-1 42 L-1 51 L-8 50 Z",
  traps: "M-8 50 L-1 50 L-1 57 L-22 55 Z",
  shoulders:
    "M-22 55 C-31 58 -39 65 -39 78 C-38 86 -31 86 -29 76 C-27 66 -24 59 -21 56 Z",
  chest: "M-20 60 L-1 62 L-1 86 C-7 90 -18 87 -21 78 C-23 69 -22 63 -20 60 Z",
  abs: "M-9 92 L-1 92 L-1 130 C-5 134 -11 130 -12 120 C-13 108 -11 99 -9 92 Z",
  obliques:
    "M-14 94 C-17 105 -17 117 -15 128 C-18 129 -20 122 -20 113 C-20 102 -17 96 -14 94 Z",
  biceps:
    "M-38 80 C-40 92 -40 104 -37 112 C-34 115 -31 112 -31 104 C-31 94 -32 86 -33 80 Z",
  forearms:
    "M-37 118 C-38 132 -37 148 -34 157 C-31 160 -29 156 -29 149 C-29 136 -30 126 -31 118 Z",
  quads:
    "M-20 142 C-22 158 -20 174 -17 186 C-14 193 -11 191 -10 182 C-9 168 -8 154 -8 144 C-13 145 -17 145 -20 142 Z",
  adductors: "M-6 144 C-4 156 -4 170 -6 180 C-10 178 -11 164 -10 150 Z",
  calves:
    "M-15 210 C-17 222 -16 234 -13 240 C-10 242 -9 238 -9 231 C-9 221 -10 214 -11 208 Z",
}

const BACK: Partial<Record<Group, string>> = {
  neck: "M-6 42 L-1 42 L-1 51 L-8 50 Z",
  traps: "M-8 50 L-1 49 L-1 94 C-7 96 -14 89 -16 76 L-22 55 Z",
  shoulders:
    "M-22 55 C-31 58 -39 65 -39 78 C-38 86 -31 86 -29 76 C-27 66 -24 59 -21 56 Z",
  triceps:
    "M-39 80 C-41 92 -41 106 -38 114 C-35 117 -32 114 -32 106 C-32 94 -33 86 -34 80 Z",
  forearms:
    "M-37 118 C-38 132 -37 148 -34 157 C-31 160 -29 156 -29 149 C-29 136 -30 126 -31 118 Z",
  lats: "M-21 66 C-24 80 -25 96 -20 112 C-14 119 -10 117 -8 112 L-8 94 C-13 91 -18 78 -21 66 Z",
  midback: "M-6 92 L-1 92 L-1 115 C-3 117 -6 113 -6 106 Z",
  lowerback: "M-12 118 L-1 118 L-1 133 C-7 136 -12 131 -13 124 Z",
  glutes:
    "M-21 136 C-23 146 -21 157 -16 161 C-9 164 -2 160 -1 152 L-1 139 C-11 138 -18 137 -21 136 Z",
  hamstrings:
    "M-20 166 C-22 178 -20 192 -17 200 C-14 205 -11 203 -10 194 C-9 182 -8 170 -8 164 C-13 168 -17 169 -20 166 Z",
  calves:
    "M-15 212 C-17 223 -16 235 -13 241 C-10 244 -9 240 -9 232 C-9 222 -10 216 -11 210 Z",
}

function Figure({
  recovery,
  muscles,
  x,
}: {
  recovery: MuscleRecoveryItem[]
  muscles: Partial<Record<Group, string>>
  x: number
}) {
  const entries = Object.entries(muscles) as [Group, string][]

  return (
    <g transform={`translate(${x} 0)`}>
      {[1, -1].map((side) => (
        <g key={side} transform={side === -1 ? "scale(-1 1)" : undefined}>
          {/* Fill and outline are separate so the mirror seam down the
              spine never gets stroked: the outline path stops at the crotch
              instead of closing back up the centre line. */}
          <path d={SILHOUETTE} fill="currentColor" fillOpacity="0.06" />
          <path
            d={SILHOUETTE_OUTLINE}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.18"
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {entries.map(([group, d]) => (
            <path
              key={group}
              d={d}
              fill={MUSCLE_HEAT_FILL[heatFor(recovery, group)]}
              stroke="currentColor"
              strokeOpacity="0.1"
              strokeWidth="0.6"
              strokeLinejoin="round"
            />
          ))}
        </g>
      ))}
    </g>
  )
}

export function MuscleBodySvg({
  recovery,
  className,
  view = "both",
  x,
  y,
  width,
  height,
}: {
  recovery: MuscleRecoveryItem[]
  className?: string
  /** "front" fits a narrow column; "both" shows the posterior chain too. */
  view?: "front" | "back" | "both"
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
}) {
  const both = view === "both"

  return (
    <svg
      viewBox={both ? "0 0 190 272" : "0 0 96 272"}
      role="img"
      aria-label="Muscle recovery map"
      className={className}
      x={x}
      y={y}
      width={width}
      height={height}
    >
      {(both || view === "front") && (
        <Figure recovery={recovery} muscles={FRONT} x={48} />
      )}
      {(both || view === "back") && (
        <Figure recovery={recovery} muscles={BACK} x={both ? 142 : 48} />
      )}
    </svg>
  )
}
