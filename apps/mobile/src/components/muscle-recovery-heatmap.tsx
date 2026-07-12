import { useId } from "react"
import type { MuscleRecovery, MuscleRecoveryStatus } from "@/lib/muscle-volume"
import { MuscleBodySvg } from "@/components/muscle-body-svg"

const COLUMNS = [
  { label: "0", caption: "today" },
  { label: "1", caption: "1d" },
  { label: "2", caption: "2d" },
  { label: "3", caption: "3d" },
  { label: "4", caption: "4d" },
  { label: "5+", caption: "5+d" },
] as const

const STATUS_LABEL: Record<MuscleRecoveryStatus, string> = {
  trained: "trained",
  recovering: "recovering",
  overdue: "overdue",
}

const CHART_WIDTH = 390
const GRID_X = 102
const PERSON_X = 155
const PERSON_Y = 24
const PERSON_WIDTH = 80
const PERSON_HEIGHT = 128
const GRID_HEADER_Y = 184
const GRID_GROUP_Y = 166
const GRID_Y = 202
const CELL_SIZE = 28
const CELL_GAP = 5
const ROW_HEIGHT = 36
const STATUS_X = 308
const LEGEND_HEIGHT = 48

function bucketIndex(days: number): number {
  return Math.min(Math.max(Math.floor(days), 0), COLUMNS.length - 1)
}

function columnX(index: number): number {
  return GRID_X + index * (CELL_SIZE + CELL_GAP)
}

function columnCenter(index: number): number {
  return columnX(index) + CELL_SIZE / 2
}

function groupCenter(start: number, end: number): number {
  return (columnCenter(start) + columnCenter(end)) / 2
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function compactMuscleLabel(muscle: string): string {
  const label = titleCase(muscle)
  return label.length > 14 ? `${label.slice(0, 12)}...` : label
}

function formatAge(days: number): string {
  if (days === 0) return "today"
  if (days === 1) return "1 day"
  if (days >= 5) return "5+ days"
  return `${days} days`
}

function formatEffectiveSets(sets: number): string {
  return Number.isInteger(sets) ? String(sets) : sets.toFixed(1)
}

function loadOpacity(effectiveSets: number, maxEffectiveSets: number): number {
  if (maxEffectiveSets <= 0) return 0.34
  return 0.28 + Math.min(effectiveSets / maxEffectiveSets, 1) * 0.58
}

export function MuscleRecoveryHeatmapCard({
  muscleRecovery,
  compact = false,
}: {
  muscleRecovery: MuscleRecovery[]
  compact?: boolean
}) {
  const svgId = useId().replace(/:/g, "")
  const titleId = `${svgId}-title`
  const descId = `${svgId}-desc`
  const hatchId = `${svgId}-hatch`

  if (muscleRecovery.length === 0) {
    return (
      <section className="border-y border-border">
        <div className="px-4 py-5 text-center">
          <p className="text-[13px] text-muted-foreground">
            Finish workouts to see muscle recovery
          </p>
        </div>
      </section>
    )
  }

  const counts = muscleRecovery.reduce(
    (acc, item) => {
      acc[item.status] += 1
      return acc
    },
    { trained: 0, recovering: 0, overdue: 0 }
  )
  const maxEffectiveSets = Math.max(
    ...muscleRecovery.map((item) => item.effectiveSets)
  )
  const chartHeight =
    GRID_Y + muscleRecovery.length * ROW_HEIGHT + LEGEND_HEIGHT
  const legendY = GRID_Y + muscleRecovery.length * ROW_HEIGHT + 20

  if (compact) {
    const visibleRecovery = muscleRecovery.slice(0, 8)
    const hiddenCount = Math.max(
      0,
      muscleRecovery.length - visibleRecovery.length
    )

    return (
      <section className="border-y border-border">
        <div className="px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-muted-foreground">
              {counts.trained} trained · {counts.recovering} recovering ·{" "}
              {counts.overdue} overdue
            </p>
            <p className="shrink-0 text-[13px] font-medium text-muted-foreground">
              days
            </p>
          </div>

          <div className="mb-1 grid grid-cols-[6rem_minmax(0,1fr)_3.5rem] items-center gap-2 px-0.5">
            <span />
            <div className="grid grid-cols-6 gap-1">
              {COLUMNS.map((column) => (
                <span
                  key={column.label}
                  className="text-center text-[13px] font-semibold text-muted-foreground"
                >
                  {column.label}
                </span>
              ))}
            </div>
            <span />
          </div>

          <div className="space-y-1.5">
            {visibleRecovery.map((item) => {
              const activeColumn = bucketIndex(item.daysSinceLastTrained)
              const activeOpacity = loadOpacity(
                item.effectiveSets,
                maxEffectiveSets
              )
              const activeBackground =
                item.status === "overdue"
                  ? "repeating-linear-gradient(135deg, var(--accent-workout) 0 3px, color-mix(in srgb, var(--accent-workout) 38%, transparent) 3px 6px)"
                  : "var(--accent-workout)"

              return (
                <div
                  key={item.muscle}
                  className="grid grid-cols-[6rem_minmax(0,1fr)_3.5rem] items-center gap-2"
                >
                  <span className="truncate text-[13px] font-semibold capitalize">
                    {titleCase(item.muscle)}
                  </span>
                  <div className="grid grid-cols-6 gap-1">
                    {COLUMNS.map((column, columnIndex) => {
                      const isActive = columnIndex === activeColumn
                      return (
                        <span
                          key={column.label}
                          className="h-4 rounded-[3px] border border-border bg-muted"
                          style={
                            isActive
                              ? {
                                  background: activeBackground,
                                  opacity: activeOpacity,
                                }
                              : undefined
                          }
                        />
                      )
                    })}
                  </div>
                  <span className="truncate text-right text-[13px] font-medium text-muted-foreground">
                    {formatAge(item.daysSinceLastTrained)}
                  </span>
                </div>
              )
            })}
          </div>

          {hiddenCount > 0 && (
            <p className="mt-2 text-[13px] font-medium text-muted-foreground">
              +{hiddenCount} more muscle group{hiddenCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="border-y border-border">
      <div className="px-4 py-4">
        <div className="overflow-x-auto overflow-y-hidden pb-1 [-webkit-overflow-scrolling:touch]">
          <svg
            role="img"
            aria-labelledby={`${titleId} ${descId}`}
            viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
            className="h-auto min-w-[390px] text-foreground"
          >
            <title id={titleId}>Muscle recovery heatmap</title>
            <desc id={descId}>
              Rows are muscle groups. Columns show days since each muscle was
              last trained. Darker cells indicate more effective sets on the
              most recent training day. The sourced person icon summarizes
              overall workout load using the same intensity scale.
            </desc>
            <defs>
              <pattern
                id={hatchId}
                patternUnits="userSpaceOnUse"
                width="6"
                height="6"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke="currentColor"
                  strokeOpacity="0.28"
                  strokeWidth="1"
                />
              </pattern>
            </defs>

            <text
              x="0"
              y="14"
              fill="currentColor"
              fontSize="10"
              fontWeight="650"
              letterSpacing="0"
              opacity="0.55"
            >
              {counts.trained} trained / {counts.recovering} recovering /{" "}
              {counts.overdue} overdue
            </text>

            <MuscleBodySvg
              recovery={muscleRecovery}
              x={PERSON_X}
              y={PERSON_Y}
              width={PERSON_WIDTH}
              height={PERSON_HEIGHT}
              className="text-foreground"
            />

            <text
              x="0"
              y={GRID_HEADER_Y}
              fill="currentColor"
              fontSize="9"
              fontWeight="650"
              letterSpacing="0"
              opacity="0.45"
            >
              Muscle
            </text>
            <text
              x={groupCenter(0, 1)}
              y={GRID_GROUP_Y}
              textAnchor="middle"
              fill="currentColor"
              fontSize="9"
              fontWeight="700"
              letterSpacing="0"
              opacity="0.55"
            >
              trained
            </text>
            <text
              x={groupCenter(2, 4)}
              y={GRID_GROUP_Y}
              textAnchor="middle"
              fill="currentColor"
              fontSize="9"
              fontWeight="700"
              letterSpacing="0"
              opacity="0.55"
            >
              recovering
            </text>
            <text
              x={groupCenter(5, 5)}
              y={GRID_GROUP_Y}
              textAnchor="middle"
              fill="currentColor"
              fontSize="9"
              fontWeight="700"
              letterSpacing="0"
              opacity="0.55"
            >
              overdue
            </text>

            {COLUMNS.map((column, index) => (
              <g key={column.label}>
                <text
                  x={columnCenter(index)}
                  y={GRID_HEADER_Y}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="9"
                  fontWeight="700"
                  letterSpacing="0"
                  opacity="0.48"
                >
                  {column.label}
                </text>
                <title>{column.caption}</title>
              </g>
            ))}

            <line
              x1={GRID_X - 8}
              y1={GRID_HEADER_Y + 6}
              x2={STATUS_X + 64}
              y2={GRID_HEADER_Y + 6}
              stroke="currentColor"
              strokeOpacity="0.18"
            />
            <line
              x1={GRID_X - 8}
              y1={GRID_Y - 6}
              x2={GRID_X - 8}
              y2={GRID_Y + muscleRecovery.length * ROW_HEIGHT - 8}
              stroke="currentColor"
              strokeOpacity="0.18"
            />

            {muscleRecovery.map((item, rowIndex) => {
              const y = GRID_Y + rowIndex * ROW_HEIGHT
              const activeColumn = bucketIndex(item.daysSinceLastTrained)
              const activeOpacity = loadOpacity(
                item.effectiveSets,
                maxEffectiveSets
              )
              const rowLabel = compactMuscleLabel(item.muscle)

              return (
                <g key={item.muscle}>
                  <title>
                    {titleCase(item.muscle)}:{" "}
                    {formatAge(item.daysSinceLastTrained)},{" "}
                    {formatEffectiveSets(item.effectiveSets)} effective sets,{" "}
                    {STATUS_LABEL[item.status]}
                  </title>
                  <text
                    x="0"
                    y={y + 19}
                    fill="currentColor"
                    fontSize="11"
                    fontWeight="650"
                    letterSpacing="0"
                  >
                    {rowLabel}
                  </text>

                  {COLUMNS.map((column, columnIndex) => {
                    const isActive = columnIndex === activeColumn
                    return (
                      <g key={column.label}>
                        <rect
                          x={columnX(columnIndex)}
                          y={y}
                          width={CELL_SIZE}
                          height={CELL_SIZE}
                          rx="4"
                          fill={
                            isActive ? "var(--accent-workout)" : "currentColor"
                          }
                          fillOpacity={isActive ? activeOpacity : 0.07}
                          stroke="currentColor"
                          strokeOpacity={isActive ? 0.42 : 0.1}
                        />
                        {isActive && item.status === "overdue" && (
                          <rect
                            x={columnX(columnIndex)}
                            y={y}
                            width={CELL_SIZE}
                            height={CELL_SIZE}
                            rx="4"
                            fill={`url(#${hatchId})`}
                          />
                        )}
                      </g>
                    )
                  })}

                  <text
                    x={STATUS_X}
                    y={y + 13}
                    fill="currentColor"
                    fontSize="10"
                    fontWeight="700"
                    letterSpacing="0"
                  >
                    {formatAge(item.daysSinceLastTrained)}
                  </text>
                  <text
                    x={STATUS_X}
                    y={y + 26}
                    fill="currentColor"
                    fontSize="8.5"
                    fontWeight="600"
                    letterSpacing="0"
                    opacity="0.48"
                  >
                    {formatEffectiveSets(item.effectiveSets)} eff /{" "}
                    {STATUS_LABEL[item.status]}
                  </text>
                </g>
              )
            })}

            <g transform={`translate(0 ${legendY})`}>
              <text
                x="0"
                y="10"
                fill="currentColor"
                fontSize="9"
                fontWeight="650"
                letterSpacing="0"
                opacity="0.5"
              >
                Load
              </text>
              {[0.34, 0.58, 0.82].map((opacity, index) => (
                <rect
                  key={opacity}
                  x={42 + index * 22}
                  y="0"
                  width="18"
                  height="12"
                  rx="3"
                  fill="var(--accent-workout)"
                  fillOpacity={opacity}
                  stroke="currentColor"
                  strokeOpacity="0.16"
                />
              ))}
              <text
                x="116"
                y="10"
                fill="currentColor"
                fontSize="9"
                fontWeight="550"
                letterSpacing="0"
                opacity="0.48"
              >
                darker = more effective sets
              </text>
              <rect
                x="265"
                y="0"
                width="18"
                height="12"
                rx="3"
                fill="currentColor"
                fillOpacity="0.06"
                stroke="currentColor"
                strokeOpacity="0.18"
              />
              <rect
                x="265"
                y="0"
                width="18"
                height="12"
                rx="3"
                fill={`url(#${hatchId})`}
              />
              <text
                x="290"
                y="10"
                fill="currentColor"
                fontSize="9"
                fontWeight="550"
                letterSpacing="0"
                opacity="0.48"
              >
                5+ days
              </text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  )
}
