import { useEffect, useRef, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { tr, translateError } from "@repo/ui/i18n"
import { X, ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react"
import { MobileSheet } from "@/components/mobile-sheet"
import { useAiFeatureGate } from "@/lib/ai-access"
import { searchExercises, type Exercise } from "@/lib/exercise-catalog"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

export type SwapPrescription = {
  sets: number
  reps: string
  restSeconds: number
}
type Recommendation = SwapPrescription & {
  exerciseId: string
  explanation: string
}

export function SwapExerciseSheet({
  exercise,
  excludedIds,
  sessionNames,
  currentPrescription,
  completedSets = 0,
  preset,
  editingPreset = false,
  onApply,
  onClose,
}: {
  exercise: Exercise
  excludedIds: string[]
  sessionNames: string[]
  currentPrescription: SwapPrescription
  completedSets?: number
  preset?: {
    _id: Id<"presets">
    updatedAt: number
    guidedProgrammeId?: Id<"guidedProgrammes">
  } | null
  editingPreset?: boolean
  onApply: (
    replacement: Exercise,
    prescription: SwapPrescription,
    scope: "session" | "preset" | "block"
  ) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [equipment, setEquipment] = useState("")
  const [reason, setReason] = useState("")
  const [results, setResults] = useState<Exercise[]>([])
  const [searching, setSearching] = useState(true)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [selected, setSelected] = useState<Exercise | null>(null)
  const [prescription, setPrescription] =
    useState<SwapPrescription>(currentPrescription)
  const [scope, setScope] = useState<"session" | "preset" | "block">(
    editingPreset ? "preset" : "session"
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const busyRef = useRef(false)
  const recommend = useAction(api.ai.exerciseSwap.recommend)
  const swapPreset = useMutation(api.exerciseSwaps.swapPreset)
  const swapBlock = useMutation(api.guidedProgrammes.swapTrainingExercise)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      setSearching(true)
      void searchExercises({
        query,
        categories: [exercise.category],
        limit: 50,
      })
        .then((rows) => {
          if (active) {
            setResults(rows)
            setSearching(false)
          }
        })
        .catch(() => {
          if (active) {
            setSearching(false)
            setError(tr("Couldn't load exercises. Try another search."))
          }
        })
    }, 180)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, exercise.category])
  const alternatives = results.filter(
    (row) =>
      row.id !== exercise.id &&
      !excludedIds.includes(row.id) &&
      (!equipment || row.equipment === equipment)
  )
  const equipmentOptions = [
    ...new Set(
      results
        .map((row) => row.equipment)
        .filter((value): value is string => Boolean(value))
    ),
  ].sort()
  const rowById = new Map(alternatives.map((row) => [row.id, row]))
  const suggestedIds = new Set(recommendations.map((row) => row.exerciseId))
  const ordered = [
    ...recommendations.flatMap((row) => rowById.get(row.exerciseId) ?? []),
    ...alternatives.filter((row) => !suggestedIds.has(row.id)),
  ]

  async function askCoach() {
    if (busyRef.current || !requireAiAccess(1, "exercise_swap")) return
    busyRef.current = true
    setBusy(true)
    setError("")
    const describe = (row: Exercise) => ({
      id: row.id,
      name: row.name,
      muscle: row.muscle,
      category: row.category,
      ...(row.equipment ? { equipment: row.equipment } : {}),
    })
    try {
      const next = await recommend({
        original: describe(exercise),
        candidates: alternatives.map(describe),
        reason: reason.trim(),
        sessionExercises: sessionNames.slice(0, 30),
      })
      setRecommendations(next)
    } catch (cause) {
      setError(
        translateError(
          cause instanceof Error
            ? cause.message
            : tr("Coach couldn't suggest alternatives. Try again.")
        )
      )
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function apply() {
    if (!selected || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      if (scope === "block" && preset?.guidedProgrammeId) {
        await swapBlock({
          programmeId: preset.guidedProgrammeId,
          oldExerciseId: exercise.id,
          newExerciseId: selected.id,
          newExerciseName: selected.name,
          ...prescription,
        })
      } else if (scope === "preset" && preset && !editingPreset) {
        await swapPreset({
          presetId: preset._id,
          oldExerciseId: exercise.id,
          newExerciseId: selected.id,
          expectedUpdatedAt: preset.updatedAt,
          ...prescription,
        })
      }
      onApply(selected, prescription, scope)
    } catch (cause) {
      setError(
        translateError(
          cause instanceof Error
            ? cause.message
            : tr("Couldn't save the swap. Try again.")
        )
      )
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const fieldClass =
    "mt-2 min-h-11 w-full border-b border-white/20 bg-transparent px-0 py-2 text-sm text-white outline-none focus:border-white/70"
  return (
    <>
      <MobileSheet
        onClose={() => {
          if (!busyRef.current) onClose()
        }}
        ariaLabel={tr("Swap exercise")}
        panelClassName="max-w-xl rounded-t-3xl bg-[#090d15] text-white"
        overlayClassName="bg-black/65 backdrop-blur-sm"
      >
        <div className="max-h-[86svh] overflow-y-auto px-6 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">{tr("Swap exercise")}</p>
              <h2 className="mt-1 text-xl font-medium">{exercise.name}</h2>
            </div>
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center justify-center text-slate-300 disabled:opacity-40"
              aria-label={tr("Close swap")}
              disabled={busy}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </header>
          {!selected ? (
            <>
              <label className="mt-6 block text-sm text-slate-300">
                {tr("Search alternatives")}
                <input
                  className={fieldClass}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setRecommendations([])
                  }}
                  placeholder={tr("Exercise name or muscle")}
                />
              </label>
              {equipmentOptions.length > 0 && (
                <label className="mt-4 block text-sm text-slate-300">
                  {tr("Equipment")}
                  <select
                    className={fieldClass}
                    value={equipment}
                    onChange={(event) => {
                      setEquipment(event.target.value)
                      setRecommendations([])
                    }}
                  >
                    <option className="bg-slate-950" value="">
                      {tr("Any equipment")}
                    </option>
                    {equipmentOptions.map((value) => (
                      <option
                        className="bg-slate-950"
                        key={value}
                        value={value}
                      >
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="mt-4 block text-sm text-slate-300">
                {tr("What would make a better fit?")}
                <input
                  className={fieldClass}
                  maxLength={300}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={tr(
                    "Optional: equipment, preference, or discomfort"
                  )}
                />
              </label>
              <button
                type="button"
                className="mt-3 min-h-11 text-sm text-slate-200 underline decoration-white/30 underline-offset-4 disabled:opacity-40"
                disabled={busy || searching || alternatives.length === 0}
                onClick={() => void askCoach()}
              >
                {busy
                  ? tr("Coach is considering alternatives…")
                  : tr("Ask Coach · 1 AI token")}
              </button>
              <div className="mt-4" aria-live="polite">
                {searching ? (
                  <p className="py-5 text-sm text-slate-400">
                    {tr("Finding exercises…")}
                  </p>
                ) : ordered.length === 0 ? (
                  <p className="py-5 text-sm text-slate-400">
                    {tr(
                      "No alternatives found. Try a different search or equipment filter."
                    )}
                  </p>
                ) : (
                  ordered.map((row) => {
                    const suggestion = recommendations.find(
                      (item) => item.exerciseId === row.id
                    )
                    return (
                      <button
                        type="button"
                        key={row.id}
                        disabled={busy}
                        className="flex w-full items-start justify-between gap-4 border-b border-white/10 py-4 text-left focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
                        onClick={() => {
                          setSelected(row)
                          setPrescription(
                            suggestion
                              ? {
                                  sets: suggestion.sets,
                                  reps: suggestion.reps,
                                  restSeconds: suggestion.restSeconds,
                                }
                              : {
                                  sets: Math.max(1, currentPrescription.sets),
                                  reps: currentPrescription.reps,
                                  restSeconds: currentPrescription.restSeconds,
                                }
                          )
                          setError("")
                        }}
                      >
                        <span>
                          <span className="block text-base">{row.name}</span>
                          <span className="mt-1 block text-xs text-slate-400">
                            {row.muscle}
                            {row.equipment ? ` · ${row.equipment}` : ""}
                          </span>
                          {suggestion && (
                            <span className="mt-2 block text-sm text-slate-300">
                              {suggestion.explanation}
                            </span>
                          )}
                        </span>
                        <ArrowRight
                          size={17}
                          className="mt-1 shrink-0 text-slate-400"
                        />
                      </button>
                    )
                  })
                )}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelected(null)}
                className="mt-4 flex min-h-11 items-center gap-2 text-sm text-slate-400"
              >
                <ArrowLeft size={15} />
                {tr("Alternatives")}
              </button>
              <h3 className="mt-4 text-2xl font-medium">{selected.name}</h3>
              {recommendations.find((row) => row.exerciseId === selected.id)
                ?.explanation && (
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  {
                    recommendations.find(
                      (row) => row.exerciseId === selected.id
                    )?.explanation
                  }
                </p>
              )}
              {selected.category !== "cardio" && (
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <label className="text-xs text-slate-400">
                    {tr("Sets")}
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className={fieldClass}
                      value={prescription.sets}
                      onChange={(event) =>
                        setPrescription((value) => ({
                          ...value,
                          sets: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    {tr("Reps")}
                    <input
                      maxLength={30}
                      className={fieldClass}
                      value={prescription.reps}
                      onChange={(event) =>
                        setPrescription((value) => ({
                          ...value,
                          reps: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    {tr("Rest (s)")}
                    <input
                      type="number"
                      min={0}
                      max={600}
                      className={fieldClass}
                      value={prescription.restSeconds}
                      onChange={(event) =>
                        setPrescription((value) => ({
                          ...value,
                          restSeconds: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
              )}
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                {tr(
                  "Start with a fresh load. Weights do not carry over between exercises."
                )}
                {completedSets > 0
                  ? ` ${tr("Your {{value0}} completed sets stay with the original exercise.", { value0: completedSets })}`
                  : ""}
              </p>
              {!editingPreset && (
                <fieldset className="mt-6">
                  <legend className="text-xs text-slate-400">
                    {tr("Apply to")}
                  </legend>
                  {[
                    {
                      value: "session" as const,
                      label: tr("This session only"),
                      show: true,
                    },
                    {
                      value: "preset" as const,
                      label: tr("This session and saved preset"),
                      show: Boolean(preset),
                    },
                    {
                      value: "block" as const,
                      label: tr(
                        "This session and future sessions in this block"
                      ),
                      show: Boolean(preset?.guidedProgrammeId),
                    },
                  ]
                    .filter((option) => option.show)
                    .map((option) => (
                      <label
                        key={option.value}
                        className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span>{option.label}</span>
                        <input
                          type="radio"
                          className="peer sr-only"
                          name="swap-scope"
                          value={option.value}
                          checked={scope === option.value}
                          onChange={() => setScope(option.value)}
                        />
                        <span className="rounded-sm p-1 peer-focus-visible:outline-2 peer-focus-visible:outline-white">
                          {scope === option.value ? (
                            <Check size={17} />
                          ) : (
                            <span className="block size-[17px]" />
                          )}
                        </span>
                      </label>
                    ))}
                </fieldset>
              )}
              {editingPreset && (
                <p className="mt-4 text-sm text-slate-400">
                  {tr(
                    "Updates this draft. Save the preset when you are ready."
                  )}
                </p>
              )}
              <button
                type="button"
                disabled={
                  busy ||
                  !Number.isInteger(prescription.sets) ||
                  prescription.sets < 1 ||
                  prescription.sets > 12 ||
                  !Number.isInteger(prescription.restSeconds) ||
                  prescription.restSeconds < 0 ||
                  prescription.restSeconds > 600 ||
                  !prescription.reps.trim()
                }
                onClick={() => void apply()}
                className="mt-6 flex min-h-12 w-full items-center justify-between text-base text-white disabled:opacity-40"
              >
                <span>{busy ? tr("Saving swap…") : tr("Confirm swap")}</span>
                <ArrowRight size={20} />
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
      </MobileSheet>
      {aiAccessModal}
    </>
  )
}
