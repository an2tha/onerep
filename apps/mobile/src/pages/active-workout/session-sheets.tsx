/**
 * The modal furniture of a session: Ask Coach, resume/discard, the dictated
 * brain dump, the retro save step, finish, abort, and the remove-exercise
 * confirmation.
 */

import { useRef, useState } from "react"
import { Check, Microphone, PaperPlaneRight, X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { MobileSheet } from "@/components/mobile-sheet"
import { useCoachDictation } from "@/lib/use-coach-dictation"
import { todayIso } from "@/lib/workout-sync"
import {
  MAX_RETRO_DURATION_SECONDS,
  MIN_RETRO_DURATION_SECONDS,
  formatElapsed,
} from "@/lib/workout-logging"
import type { CoachWorkoutProposal, WeightUnit } from "@/lib/workout-logging"

export type AiWorkoutSheetTarget = {
  exerciseId?: string
  exerciseName?: string
} | null

export function AiWorkoutSheet({
  target,
  loading,
  contextReady,
  onAsk,
  onApply,
  onClose,
}: {
  target: AiWorkoutSheetTarget
  loading: boolean
  contextReady: boolean
  contextSummary: string
  onAsk: (text: string) => Promise<CoachWorkoutProposal>
  onApply: (proposal: CoachWorkoutProposal) => void | Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState("")
  const [proposal, setProposal] = useState<CoachWorkoutProposal | null>(null)
  const [error, setError] = useState("")
  const [closing, setClosing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canAsk = text.trim().length >= 4 && !loading && contextReady

  async function askCoach(prompt = text) {
    const request = prompt.trim()
    if (request.length < 4 || loading || !contextReady) return
    setText(request)
    setError("")
    setProposal(null)
    try {
      setProposal(await onAsk(request))
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Coach couldn't build that plan right now."
      )
    }
  }

  function askAgain() {
    setProposal(null)
    setError("")
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function requestClose() {
    if (loading || closing) return
    setClosing(true)
    window.setTimeout(onClose, 320)
  }

  async function applyProposal() {
    if (!proposal || loading || closing) return
    await onApply(proposal)
    setClosing(true)
    window.setTimeout(onClose, 320)
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-2 backdrop-blur-[8px] sm:items-center sm:p-5",
        closing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "sheet-panel max-h-[min(680px,calc(100svh-1rem))] w-full max-w-[480px] overflow-y-auto rounded-[22px] border border-border/55 bg-background shadow-2xl",
          closing ? "sheet-panel-exit" : "sheet-panel-enter"
        )}
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Ask Coach for workout help"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 truncate text-[18px] leading-tight font-semibold tracking-tight">
              {target?.exerciseName ?? "Ask Coach"}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              disabled={loading || closing}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
              aria-label="Close Ask Coach"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          {proposal ? (
            <div className="mt-4">
              <div className="rounded-[20px] border border-border/60 bg-card/55 p-4">
                <p className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                  Coach's recommendation
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/85">
                  {proposal.reply}
                </p>
                <div className="mt-4 border-t border-border/50 pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[14px] font-bold">
                      {proposal.draft.name || "Today's plan"}
                    </p>
                    <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                      {proposal.draft.exercises?.length ?? 0} exercises
                    </span>
                  </div>
                  <div className="mt-2.5 divide-y divide-border/40">
                    {(proposal.draft.exercises ?? []).map((exercise, index) => (
                      <div
                        key={`${exercise.name}-${index}`}
                        className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="w-5 shrink-0 text-center text-[11px] font-bold text-muted-foreground/70 tabular-nums">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                          {exercise.name}
                        </span>
                        <span className="shrink-0 text-[12px] text-muted-foreground">
                          {exercise.sets?.length || 3} sets
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[0.72fr_1.28fr] gap-2.5">
                <button
                  type="button"
                  onClick={askAgain}
                  disabled={loading}
                  className="h-11 rounded-xl border border-border/65 bg-card/35 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground disabled:opacity-40"
                >
                  Ask again
                </button>
                <button
                  type="button"
                  onClick={() => void applyProposal()}
                  disabled={loading}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-[13px] font-bold text-background transition-opacity active:opacity-80 disabled:opacity-40"
                >
                  {loading ? "Applying plan…" : "Use this plan"}
                  {!loading && <Check size={14} weight="bold" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 pb-1">
              <div className="rounded-[18px] border border-border/65 bg-card/25 p-2 transition-colors focus-within:border-foreground/30">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value)
                    if (error) setError("")
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      void askCoach()
                    }
                  }}
                  disabled={loading}
                  maxLength={900}
                  placeholder={
                    target?.exerciseName
                      ? `What should I do instead of ${target.exerciseName}?`
                      : "Tell Coach what you want from today's session…"
                  }
                  autoFocus
                  className="min-h-32 w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/55 disabled:opacity-60"
                />
                <div className="flex items-center justify-end px-1 pb-0.5">
                  <button
                    type="button"
                    onClick={() => void askCoach()}
                    disabled={!canAsk}
                    aria-busy={loading}
                    aria-label="Ask Coach"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition-opacity active:opacity-80 disabled:opacity-25"
                  >
                    <PaperPlaneRight
                      size={14}
                      weight="fill"
                      className={loading ? "animate-pulse" : ""}
                    />
                  </button>
                </div>
              </div>

              {error && (
                <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ResumeWorkoutSheet({
  source,
  savedAt,
  onResume,
  onDiscard,
}: {
  source: "convex" | "local"
  savedAt?: number
  onResume: () => void
  onDiscard: () => Promise<void>
}) {
  const [discarding, setDiscarding] = useState(false)
  const savedLabel = savedAt
    ? new Date(savedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  async function discard() {
    if (discarding) return
    setDiscarding(true)
    try {
      await onDiscard()
    } catch {
      setDiscarding(false)
    }
  }

  return (
    <div className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-workout-title"
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
      >
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2
            id="resume-workout-title"
            className="text-[20px] font-semibold tracking-tight"
          >
            You have an active workout
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
            Resume your {source === "local" ? "locally saved" : "saved"} workout
            {savedLabel ? ` from ${savedLabel}` : ""}, or discard it and start
            fresh.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            type="button"
            onClick={onResume}
            disabled={discarding}
            className="h-[52px] w-full rounded-[20px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-60"
          >
            Resume workout
          </button>
          <button
            type="button"
            onClick={() => void discard()}
            disabled={discarding}
            aria-busy={discarding}
            className="h-[52px] w-full rounded-[20px] bg-destructive/10 text-[14px] font-bold text-destructive transition-colors active:bg-destructive/15 disabled:opacity-50"
          >
            {discarding ? "Discarding..." : "Discard workout"}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Speech-recognition biasing vocabulary for dictating a workout. */
const WORKOUT_DICTATION_TERMS = [
  "reps",
  "sets",
  "kilograms",
  "pounds",
  "RPE",
  "superset",
  "dropset",
  "warmup",
  "AMRAP",
  "bench press",
  "squat",
  "deadlift",
  "overhead press",
  "barbell row",
]

// ─── Reconstructing a past session ────────────────────────────────────────────

/** "Today", "Yesterday", or "Tue, Mar 3" for the retro logger's header. */
export function formatRetroDateLabel(date: string) {
  if (!date) return ""
  const today = todayIso()
  if (date === today) return "Today"
  const yesterday = new Date(`${today}T12:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date === yesterday.toISOString().slice(0, 10)) return "Yesterday"
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

/** Splits seconds into the hour/minute pair the duration stepper edits. */
export function splitDurationParts(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds))
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
  }
}

/**
 * Speak or type what you did, and get editable sets back.
 *
 * The model returns exercise *names* only; they are resolved against the
 * catalog here so a name it invented shows up as an unmatched row the user has
 * to fix, rather than silently becoming a logged exercise.
 */
export function BrainDumpSheet({
  unit,
  pending,
  onClose,
  onSubmit,
}: {
  unit: WeightUnit
  pending: boolean
  onClose: () => void
  onSubmit: (text: string) => Promise<void>
}) {
  const [text, setText] = useState("")
  const dictation = useCoachDictation({
    value: text,
    onChange: setText,
    contextualStrings: WORKOUT_DICTATION_TERMS,
  })

  async function submit() {
    // Stopping first recovers the tail iOS drops, so the last exercise someone
    // says before hitting send is not silently lost.
    const finalText =
      dictation.status === "listening" ? await dictation.stop() : text
    const trimmed = (finalText ?? text).trim()
    if (trimmed.length < 4) return
    await onSubmit(trimmed)
  }

  return (
    <MobileSheet onClose={onClose} ariaLabel="Describe your workout">
      <div className="px-6 pt-2 pb-6">
        {/* The paragraph here said three times over what the placeholder
            already demonstrates. The one thing it carried that nothing else
            did was the unit, so the unit is now a chip you read on your way to
            the field instead of a clause at the end of a sentence. */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[20px] font-semibold tracking-tight">
            What did you do?
          </h2>
          <span
            className="shrink-0 rounded-full bg-muted/50 px-2.5 py-1 text-[12px] font-semibold text-muted-foreground"
            aria-label={`Weights are read as ${unit === "lbs" ? "pounds" : "kilograms"}`}
          >
            {unit === "lbs" ? "lb" : "kg"}
          </span>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          disabled={pending}
          aria-label="Workout description"
          placeholder="Bench 3x8 at 185, then rows 3x10 at 60"
          className="mt-3.5 w-full resize-none rounded-[20px] bg-muted/40 px-4 py-3.5 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
        {dictation.interim && (
          <p className="mt-2 px-1 text-[13px] text-muted-foreground">
            … · {dictation.interim}
          </p>
        )}
        {dictation.error && (
          <p className="mt-2 px-1 text-[13px] text-destructive">
            {dictation.error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          {dictation.available && (
            <button
              type="button"
              aria-label={
                dictation.status === "listening"
                  ? "Stop dictation"
                  : "Dictate your workout"
              }
              aria-pressed={dictation.status === "listening"}
              disabled={pending}
              onClick={() =>
                dictation.status === "listening"
                  ? void dictation.stop()
                  : void dictation.start()
              }
              className={cn(
                "motion-tactile inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[20px] transition-colors disabled:opacity-50",
                dictation.status === "listening"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-foreground"
              )}
            >
              <Microphone size={20} weight="bold" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || text.trim().length < 4}
            aria-busy={pending}
            className="h-[52px] flex-1 rounded-[20px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {pending ? "Reading…" : "Add exercises"}
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}

/**
 * The save step for a reconstructed session: what day, how long, and what time.
 *
 * Duration and time are prefilled but always editable — the app should never
 * quietly assert how long someone trained.
 */
export function RetroSaveSheet({
  date,
  onDateChange,
  durationSeconds,
  onDurationChange,
  completedAt,
  onCompletedAtChange,
  totalSets,
  doneSets,
  mode,
  onSave,
  onCancel,
}: {
  date: string
  onDateChange: (date: string) => void
  durationSeconds: number
  onDurationChange: (seconds: number) => void
  completedAt: number | null
  onCompletedAtChange: (value: number) => void
  totalSets: number
  doneSets: number
  mode: "create" | "edit"
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const { hours, minutes } = splitDurationParts(durationSeconds)

  function setParts(nextHours: number, nextMinutes: number) {
    const total = Math.max(0, nextHours) * 3600 + Math.max(0, nextMinutes) * 60
    onDurationChange(
      Math.min(
        MAX_RETRO_DURATION_SECONDS,
        Math.max(MIN_RETRO_DURATION_SECONDS, total)
      )
    )
  }

  const timeValue = (() => {
    if (completedAt === null) return ""
    const parsed = new Date(completedAt)
    if (Number.isNaN(parsed.getTime())) return ""
    return `${String(parsed.getHours()).padStart(2, "0")}:${String(
      parsed.getMinutes()
    ).padStart(2, "0")}`
  })()

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await onSave()
    } catch {
      setSaving(false)
    }
  }

  return (
    <MobileSheet onClose={onCancel} ariaLabel="Save this workout">
      <div className="px-6 pt-2 pb-6">
        <h2 className="text-[20px] font-semibold tracking-tight">
          {mode === "edit" ? "Save changes" : "Log this workout"}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/80">
          {doneSets} of {totalSets} set{totalSets === 1 ? "" : "s"} marked done.
          Only completed sets are saved.
        </p>

        <label className="mt-5 flex flex-col gap-1.5">
          <span className="px-1 text-[13px] font-bold text-muted-foreground">
            Date
          </span>
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(event) => onDateChange(event.target.value)}
            aria-label="Workout date"
            className="h-[52px] rounded-[20px] bg-muted/40 px-4 text-[15px] outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        <div className="mt-4 flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="px-1 text-[13px] font-bold text-muted-foreground">
              Hours
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="6"
              value={String(hours)}
              onChange={(event) =>
                setParts(Number(event.target.value) || 0, minutes)
              }
              aria-label="Workout duration hours"
              className="h-[52px] rounded-[20px] bg-muted/40 px-4 text-[15px] tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="px-1 text-[13px] font-bold text-muted-foreground">
              Minutes
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="59"
              value={String(minutes)}
              onChange={(event) =>
                setParts(hours, Number(event.target.value) || 0)
              }
              aria-label="Workout duration minutes"
              className="h-[52px] rounded-[20px] bg-muted/40 px-4 text-[15px] tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="px-1 text-[13px] font-bold text-muted-foreground">
              Finished
            </span>
            <input
              type="time"
              value={timeValue}
              onChange={(event) => {
                const [h, m] = event.target.value.split(":").map(Number)
                if (!Number.isFinite(h) || !Number.isFinite(m)) return
                const next = new Date(`${date}T12:00:00`)
                next.setHours(h, m, 0, 0)
                onCompletedAtChange(next.getTime())
              }}
              aria-label="Time the workout finished"
              className="h-[52px] rounded-[20px] bg-muted/40 px-4 text-[15px] tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || doneSets === 0}
            aria-busy={saving}
            className="h-[52px] w-full rounded-[20px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : mode === "edit"
                ? "Save changes"
                : "Log workout"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground disabled:opacity-50"
          >
            Keep editing
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}

export function FinishSheet({
  elapsed,
  totalSets,
  doneSets,
  onFinish,
  onCancel,
}: {
  elapsed: number
  totalSets: number
  doneSets: number
  onFinish: () => Promise<void>
  onCancel: () => void
}) {
  const allDone = doneSets >= totalSets
  const [finishing, setFinishing] = useState(false)

  async function confirmFinish() {
    if (finishing) return
    setFinishing(true)
    try {
      await onFinish()
    } catch {
      setFinishing(false)
    }
  }

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={finishing ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-workout-title"
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-1 w-full transition-colors duration-500"
          style={{
            background: allDone
              ? "color-mix(in srgb, var(--primary) 50%, transparent)"
              : "transparent",
          }}
        />
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2
            id="finish-workout-title"
            className="text-[20px] font-semibold tracking-tight"
          >
            {allDone ? "Workout complete" : "Finish early?"}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
            {!allDone &&
              `${totalSets - doneSets} set${totalSets - doneSets > 1 ? "s" : ""} still incomplete. `}
            Total time:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </p>
          <div className="mt-4 flex gap-3">
            {[
              { label: "Complete", value: `${doneSets}/${totalSets}` },
              { label: "Duration", value: formatElapsed(elapsed) },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-1 flex-col gap-0.5 rounded-[20px] bg-muted/40 px-3 py-2.5"
              >
                <span className="text-[13px] font-semibold text-muted-foreground">
                  {label}
                </span>
                <span className="text-[18px] font-semibold tracking-tight tabular-nums">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            type="button"
            onClick={() => void confirmFinish()}
            disabled={finishing}
            aria-busy={finishing}
            className="h-[52px] w-full rounded-[20px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {finishing ? "Finishing..." : "Finish workout"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={finishing}
            className="h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground disabled:opacity-50"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}

export function AbortSheet({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [aborting, setAborting] = useState(false)

  async function confirmAbort() {
    if (aborting) return
    setAborting(true)
    try {
      await onConfirm()
    } catch {
      setAborting(false)
    }
  }

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={aborting ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="abort-workout-title"
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2
            id="abort-workout-title"
            className="text-[20px] font-semibold tracking-tight"
          >
            Abort workout?
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground/70">
            Your progress won't be saved.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            type="button"
            onClick={() => void confirmAbort()}
            disabled={aborting}
            aria-busy={aborting}
            className="h-[52px] w-full rounded-[20px] bg-destructive text-[15px] font-semibold tracking-tight text-white transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {aborting ? "Aborting..." : "Abort workout"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={aborting}
            className="h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground disabled:opacity-50"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}

export function RemoveExerciseSheet({
  exerciseName,
  onConfirm,
  onCancel,
}: {
  exerciseName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-exercise-title"
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2
            id="remove-exercise-title"
            className="text-[20px] font-semibold tracking-tight"
          >
            Remove {exerciseName}?
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground/70">
            Its sets in this session go with it. Past workouts are untouched.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            type="button"
            onClick={onConfirm}
            className="h-[52px] w-full rounded-[20px] bg-destructive text-[15px] font-semibold tracking-tight text-white transition-opacity active:opacity-80"
          >
            Remove exercise
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground"
          >
            Keep it
          </button>
        </div>
      </div>
    </div>
  )
}
