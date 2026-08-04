import { useState } from "react"
import { Plus, Trash, X } from "@phosphor-icons/react"
import { PrimaryButton, toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { MobileSheet } from "@/components/mobile-sheet"
import { hapticSelection } from "@/lib/haptics"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { cn } from "@/lib/utils"
import {
  validateCustomExerciseDraft,
  type CustomExerciseDraft,
} from "@/lib/custom-exercises"
import type { Exercise, ExerciseCategory } from "@/lib/exercise-catalog"

const CATEGORY_OPTIONS: Array<{ value: ExerciseCategory; label: string }> = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mobility", label: "Mobility" },
  { value: "core", label: "Core" },
]

/** Opens the editor from a picker, seeded with whatever the user typed. */
export function CreateExerciseButton({
  query,
  onClick,
  className,
}: {
  query: string
  onClick: () => void
  className?: string
}) {
  const trimmed = query.trim()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/60 active:text-foreground",
        className
      )}
    >
      <Plus size={14} weight="bold" aria-hidden />
      {trimmed ? `Create “${trimmed}”` : "Create your own exercise"}
    </button>
  )
}

export function CustomExerciseSheet({
  initialDraft,
  onClose,
  onSaved,
  onDeleted,
}: {
  initialDraft: CustomExerciseDraft
  onClose: () => void
  /** Receives the saved exercise so the caller can add it straight away. */
  onSaved: (exercise: Exercise) => void
  onDeleted?: (docId: string) => void
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const saveExercise = useOfflineMutation(
    api.logs.customExercises.save,
    "logs.customExercises.save"
  )
  const removeExercise = useOfflineMutation(
    api.logs.customExercises.remove,
    "logs.customExercises.remove"
  )

  const validation = validateCustomExerciseDraft(draft)
  const nameError = validation.errors.name
  const editing = Boolean(draft.docId)
  const update = (patch: Partial<CustomExerciseDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  async function handleSave() {
    if (!validation.valid) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    try {
      const { id, ...rest } = validation.value
      const saved = await saveExercise({
        ...rest,
        ...(id ? { id: id as Id<"customExercises"> } : {}),
      })
      if (saved) {
        hapticSelection()
        onSaved(saved as Exercise)
      } else {
        // Queued offline — there is no id to add to the workout yet.
        toast.success("Exercise saved. It'll sync when you're back online.")
        onClose()
      }
    } catch (error) {
      reportOfflineMutationError(error, "Couldn't save that exercise.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!draft.docId) return
    setSaving(true)
    try {
      await removeExercise({ id: draft.docId as Id<"customExercises"> })
      onDeleted?.(draft.docId)
      onClose()
    } catch (error) {
      reportOfflineMutationError(error, "Couldn't delete that exercise.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <MobileSheet
      onClose={onClose}
      panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-y-auto rounded-t-2xl border-t border-border bg-card"
      maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
    >
      <div className="px-5 pt-4 pb-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-[21px] font-semibold">
            {editing ? "Edit exercise" : "New exercise"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="native-toolbar-button -mt-1 -mr-2 px-0 text-muted-foreground"
            aria-label="Close exercise editor"
          >
            <X size={17} weight="bold" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="native-field">
            <span className="native-field-label">Name</span>
            <input
              className="native-input"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Reverse hyper"
              autoFocus={!editing}
            />
            {showErrors && nameError && (
              <span className="native-field-error" role="alert">
                {nameError}
              </span>
            )}
          </label>

          <fieldset>
            <legend className="native-field-label mb-2">Type</legend>
            <div className="flex gap-1.5">
              {CATEGORY_OPTIONS.map(({ value, label }) => {
                const active = draft.category === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update({ category: value })}
                    aria-pressed={active}
                    className={cn(
                      "min-h-11 flex-1 rounded-lg text-[14px] font-medium transition-colors",
                      active
                        ? "bg-foreground text-background"
                        : "bg-muted/60 text-muted-foreground active:bg-muted"
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="native-field">
            <span className="native-field-label">Equipment (optional)</span>
            <input
              className="native-input"
              value={draft.equipment}
              onChange={(event) => update({ equipment: event.target.value })}
              placeholder="Barbell"
            />
          </label>

          <label className="native-field">
            <span className="native-field-label">
              Primary muscles (optional)
            </span>
            <input
              className="native-input"
              value={draft.primaryMuscles}
              onChange={(event) =>
                update({ primaryMuscles: event.target.value })
              }
              placeholder="Glutes, hamstrings"
            />
            <span className="text-[12px] text-muted-foreground">
              Comma separated. Used for your muscle volume and recovery charts.
            </span>
          </label>

          <label className="native-field">
            <span className="native-field-label">
              Secondary muscles (optional)
            </span>
            <input
              className="native-input"
              value={draft.secondaryMuscles}
              onChange={(event) =>
                update({ secondaryMuscles: event.target.value })
              }
              placeholder="Lower back"
            />
          </label>

          <label className="native-field">
            <span className="native-field-label">Notes (optional)</span>
            <textarea
              className="native-input min-h-20 resize-y py-2"
              value={draft.instructions}
              onChange={(event) => update({ instructions: event.target.value })}
              placeholder={"One cue per line"}
            />
          </label>
        </div>

        <PrimaryButton
          className="mt-5 w-full"
          onClick={handleSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Save exercise"}
        </PrimaryButton>

        {editing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-[15px] font-semibold text-destructive"
          >
            <Trash size={16} weight="bold" aria-hidden />
            Delete exercise
          </button>
        )}
      </div>
    </MobileSheet>
  )
}
