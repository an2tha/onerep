import { useState } from "react"
import { useAction } from "convex/react"
import { Microphone } from "@phosphor-icons/react"
import { toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { MobileSheet } from "@/components/mobile-sheet"
import { currentDateKey } from "@/lib/food-log"
import { hapticSelection } from "@/lib/haptics"
import { useCoachDictation } from "@/lib/use-coach-dictation"
import { cn, logDevWarn } from "@/lib/utils"

/** Lifting vocabulary, so "dropset at ninety" survives recognition. */
const COACH_DICTATION_TERMS = [
  "repetitions",
  "kilograms",
  "pounds",
  "dropset",
  "superset",
  "one rep max",
  "deload",
]

type Exchange = {
  question: string
  reply: string
  suggestion: string | null
}

/**
 * The coach between sets: a sheet, one question, one sentence back.
 *
 * Deliberately not a chat. There is no history, no typing-indicator theatre,
 * and no way to wander into meal planning ninety seconds before a top set —
 * the server reads the live session and answers like a spotter, from a thin
 * context slice and a tight token ceiling because the rest timer is the
 * deadline.
 *
 * The layout follows BrainDumpSheet, the other input sheet in the live
 * workout: inline heading, muted rounded field, one full-width action button.
 * Two sheets in the same screen with two visual languages is one too many.
 */
export function InWorkoutCoach({
  open,
  onClose,
  slot,
}: {
  open: boolean
  onClose: () => void
  slot: 1 | 2
}) {
  const ask = useAction(api.ai.inWorkout.ask)
  const [question, setQuestion] = useState("")
  const [busy, setBusy] = useState(false)
  const [exchange, setExchange] = useState<Exchange | null>(null)
  const dictation = useCoachDictation({
    value: question,
    onChange: setQuestion,
    contextualStrings: COACH_DICTATION_TERMS,
  })

  async function submit() {
    // Stopping first recovers the tail iOS drops, so the last word someone
    // says before hitting Ask is not silently lost.
    const finalText =
      dictation.status === "listening" ? await dictation.stop() : question
    const trimmed = (finalText ?? question).trim()
    if (trimmed.length < 2 || busy) return
    setBusy(true)
    hapticSelection()
    try {
      const answer = await ask({
        question: trimmed,
        today: currentDateKey(),
        slot,
      })
      setExchange({
        question: trimmed,
        reply: answer.reply,
        suggestion: answer.suggestion,
      })
      setQuestion("")
    } catch (error) {
      logDevWarn("In-workout coach failed", error)
      toast.error(
        error instanceof Error ? error.message : "Couldn't reach your coach."
      )
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <MobileSheet onClose={onClose} ariaLabel="Ask your coach">
      <div className="px-6 pt-2 pb-6">
        <h2 className="text-[20px] font-semibold tracking-tight">
          Ask your coach
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/80">
          One question about this session — load, reps, push or stop. It can
          see your sets so far.
        </p>

        {exchange && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="max-w-[85%] self-end rounded-[18px] rounded-br-[6px] bg-muted/60 px-4 py-2.5 text-[14px] leading-snug">
              {exchange.question}
            </p>
            <p className="max-w-[92%] rounded-[18px] rounded-bl-[6px] bg-muted/30 px-4 py-2.5 text-[14px] leading-relaxed">
              {exchange.reply}
            </p>
            {exchange.suggestion && (
              <p className="max-w-[92%] rounded-[18px] px-4 py-2.5 text-[13px] leading-snug font-semibold ring-1 ring-foreground/15">
                {exchange.suggestion}
              </p>
            )}
          </div>
        )}

        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit()
          }}
          disabled={busy}
          aria-label="Your question"
          placeholder={exchange ? "Anything else?" : "Heavier on the last set?"}
          maxLength={300}
          enterKeyHint="send"
          className="mt-4 h-[52px] w-full rounded-[20px] bg-muted/40 px-4 text-[15px] outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
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

        <div className="mt-3 flex gap-2">
          {dictation.available && (
            <button
              type="button"
              aria-label={
                dictation.status === "listening"
                  ? "Stop dictation"
                  : "Dictate your question"
              }
              aria-pressed={dictation.status === "listening"}
              disabled={busy}
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
            disabled={busy || question.trim().length < 2}
            aria-busy={busy}
            className="h-[52px] flex-1 rounded-[20px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {busy ? "Asking..." : "Ask"}
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}
