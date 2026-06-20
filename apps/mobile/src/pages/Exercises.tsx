import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "convex/react"
import { Card } from "@repo/ui"
import { BottomBar } from "@/components/bottom-bar"
import {
  resolveExerciseIds,
  type Exercise,
  type ExerciseCategory,
} from "@/lib/exercise-catalog"
import { api } from "../../../../convex/_generated/api"

// ─── Types ────────────────────────────────────────────────────────────────────

type ExerciseCard = Exercise & { count: number }

type Stats = {
  totalExercises: number
  totalSets: number
  categoryBreakdown: Record<ExerciseCategory, number>
  topExercise: ExerciseCard | null
  muscleGroups: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<ExerciseCategory, string> = {
  strength: "#78716c",
  cardio: "#f97316",
  mobility: "#10b981",
  core: "#3b82f6",
}

const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility",
  core: "Core",
}

const CATEGORY_ORDER: ExerciseCategory[] = [
  "strength",
  "cardio",
  "mobility",
  "core",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMuscles(exercises: ExerciseCard[]): string[] {
  const seen = new Set<string>()
  for (const ex of exercises) {
    for (const part of ex.muscle.split(" · ")) {
      seen.add(part.trim())
    }
  }
  return [...seen]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  )
}

// Animated bar — grows from 0 on mount
function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState("0%")

  useEffect(() => {
    const id = requestAnimationFrame(() => setW(`${pct}%`))
    return () => cancelAnimationFrame(id)
  }, [pct])

  return (
    <div
      ref={ref}
      className="h-full rounded-full transition-all duration-700 ease-out"
      style={{ width: w, backgroundColor: color }}
    />
  )
}

// Category mix — full-width segmented bar + legend
function CategoryMixCard({
  breakdown,
  total,
}: {
  breakdown: Record<ExerciseCategory, number>
  total: number
}) {
  const empty = total === 0
  const segments = CATEGORY_ORDER.filter((c) => breakdown[c] > 0).map((c) => ({
    category: c,
    count: breakdown[c],
    pct: (breakdown[c] / total) * 100,
    color: CATEGORY_COLOR[c],
    label: CATEGORY_LABEL[c],
  }))

  return (
    <Card size="sm">
      <div className="px-4 py-4">
        <p className="mb-3 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Category mix
        </p>

        {/* Segmented bar */}
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted/40">
          {!empty &&
            segments.map((s) => (
              <AnimatedBar key={s.category} pct={s.pct} color={s.color} />
            ))}
        </div>

        {/* Legend — all four categories always shown */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {CATEGORY_ORDER.map((c) => (
            <div key={c} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full transition-opacity duration-300"
                style={{
                  backgroundColor: CATEGORY_COLOR[c],
                  opacity: empty || breakdown[c] === 0 ? 0.25 : 1,
                }}
              />
              <span
                className={
                  empty || breakdown[c] === 0
                    ? "text-[11px] text-muted-foreground/40"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {CATEGORY_LABEL[c]}
                {!empty && breakdown[c] > 0 && (
                  <span className="ml-1 text-foreground/60 tabular-nums">
                    {breakdown[c]}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// Single large-number stat tile
function StatTile({
  value,
  label,
  sub,
}: {
  value: number
  label: string
  sub?: string
}) {
  const empty = value === 0
  return (
    <Card size="sm" className="flex-1">
      <div className="px-4 py-4">
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {label}
        </p>
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-[2rem] leading-none font-semibold tracking-tight tabular-nums transition-opacity duration-300 ${empty ? "opacity-20" : ""}`}
          >
            {value}
          </span>
          {sub && (
            <span
              className={`text-[11px] text-muted-foreground transition-opacity duration-300 ${empty ? "opacity-30" : ""}`}
            >
              {sub}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

// Top exercise card
function TopExerciseCard({ exercise }: { exercise: ExerciseCard | null }) {
  return (
    <Card size="sm" className="flex-1">
      <div className="px-4 py-4">
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Top exercise
        </p>
        {exercise ? (
          <div className="flex items-center gap-2.5">
            <div
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: exercise.color }}
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] leading-tight font-semibold">
                {exercise.name}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {exercise.count} completed set{exercise.count !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-1 shrink-0 rounded-full bg-muted/40" />
            <div className="min-w-0">
              <div className="h-3 w-20 rounded bg-muted/40" />
              <div className="mt-1.5 h-2.5 w-12 rounded bg-muted/25" />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Exercises() {
  const history = useQuery(api.logs.workouts.getHistory, {})
  const loading = history === undefined
  const [exerciseLookup, setExerciseLookup] = useState<Record<string, Exercise>>({})

  // Collect all exercise IDs from history and resolve them
  useEffect(() => {
    if (!history) return
    const ids = [
      ...new Set(
        history.flatMap((log) =>
          ((log as any).exercises ?? []).map((e: any) => e.exerciseId as string)
        )
      ),
    ].filter(Boolean)
    if (ids.length === 0) return
    void resolveExerciseIds(ids).then((lookup) => {
      setExerciseLookup(lookup as Record<string, Exercise>)
    })
  }, [history])

  const items = useMemo<ExerciseCard[]>(() => {
    if (!history) return []
    const counts = new Map<string, number>()
    for (const log of history) {
      for (const exercise of (log as any).exercises ?? []) {
        const completedSets = (exercise.sets ?? []).filter(
          (set: any) => set.completed
        ).length
        if (completedSets > 0) {
          counts.set(
            exercise.exerciseId,
            (counts.get(exercise.exerciseId) ?? 0) + completedSets
          )
        }
      }
    }
    return [...counts.entries()]
      .map(([id, count]) => {
        const ex = exerciseLookup[id]
        return ex ? { ...(ex as Exercise), count } : null
      })
      .filter((ex): ex is ExerciseCard => Boolean(ex))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [history, exerciseLookup])

  const stats: Stats = useMemo(() => {
    const categoryBreakdown: Record<ExerciseCategory, number> = {
      strength: 0,
      cardio: 0,
      mobility: 0,
      core: 0,
    }
    let totalSets = 0
    for (const ex of items) {
      categoryBreakdown[ex.category] += ex.count
      totalSets += ex.count
    }
    return {
      totalExercises: items.length,
      totalSets,
      categoryBreakdown,
      topExercise: items[0] ?? null,
      muscleGroups: parseMuscles(items),
    }
  }, [items])

  return (
    <div className="min-h-svh bg-background">
      <div className="page-enter mx-auto flex max-w-lg flex-col pb-28">
        <header className="px-5 pt-14 pb-6">
          <h1 className="text-[1.9rem] leading-tight font-semibold tracking-tight">
            Exercises
          </h1>
        </header>

        <main className="flex flex-col gap-6 px-4">
          {/* ── Your exercises ──────────────────────────────────────── */}
          <section>
            <SectionHeader title="Your exercises" />
            {loading ? (
              <div className="grid grid-cols-2 gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} size="sm" className="gap-2 px-3 py-3">
                    <div className="h-1 w-10 rounded-full bg-muted/50" />
                    <div className="h-3 w-3/4 rounded bg-muted/40" />
                    <div className="h-2.5 w-1/2 rounded bg-muted/30" />
                  </Card>
                ))}
              </div>
            ) : items.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5">
                {items.map((exercise) => (
                  <Card key={exercise.id} size="sm" className="gap-2 px-3 py-3">
                    <div
                      className="h-1 w-10 rounded-full"
                      style={{ backgroundColor: exercise.color }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] leading-tight font-semibold">
                        {exercise.name}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {exercise.muscle}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Finish a workout to see exercise history here.
              </p>
            )}
          </section>

          {/* ── Stats ───────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Stats" />
            {loading ? (
              <div className="flex flex-col gap-2.5">
                <Card size="sm">
                  <div className="px-4 py-4">
                    <div className="mb-3 h-2 w-1/3 rounded bg-muted/40" />
                    <div className="h-2 rounded-full bg-muted/40" />
                    <div className="mt-3 flex gap-4">
                      {CATEGORY_ORDER.map((c) => (
                        <div
                          key={c}
                          className="h-2.5 w-14 rounded bg-muted/30"
                        />
                      ))}
                    </div>
                  </div>
                </Card>
                <div className="flex gap-2.5">
                  <Card size="sm" className="flex-1">
                    <div className="h-[84px]" />
                  </Card>
                  <Card size="sm" className="flex-1">
                    <div className="h-[84px]" />
                  </Card>
                </div>
                <div className="flex gap-2.5">
                  <Card size="sm" className="flex-1">
                    <div className="h-[84px]" />
                  </Card>
                  <Card size="sm" className="flex-1">
                    <div className="h-[84px]" />
                  </Card>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {/* Row 1 — category mix (full width) */}
                <CategoryMixCard
                  breakdown={stats.categoryBreakdown}
                  total={stats.totalSets}
                />

                {/* Row 2 — top exercise + muscle groups */}
                <div className="flex gap-2.5">
                  <TopExerciseCard exercise={stats.topExercise} />
                  <StatTile
                    value={stats.muscleGroups.length}
                    label="Muscles"
                    sub="groups"
                  />
                </div>

                {/* Row 3 — unique exercises + total appearances */}
                <div className="flex gap-2.5">
                  <StatTile
                    value={stats.totalExercises}
                    label="Exercises"
                    sub="tracked"
                  />
                  <StatTile
                    value={stats.totalSets}
                    label="Completed sets"
                    sub="logged"
                  />
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      <BottomBar />
    </div>
  )
}
