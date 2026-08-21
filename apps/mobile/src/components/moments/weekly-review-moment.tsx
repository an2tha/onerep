import { useState } from "react"
import { useAction, useMutation } from "convex/react"
import { Check, X } from "@phosphor-icons/react"
import {
  MomentPrimaryAction,
  MomentScreen,
  MomentSecondaryAction,
  toast,
} from "@repo/ui"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { logDevWarn } from "@/lib/utils"
import type { FullScreenEventOutcome } from "@/lib/full-screen-events"

export type CoachReview = {
  id: Id<"coachReviews">
  weekStart: string
  weekKey: string
  headline: string
  summary: string[]
  focus: string | null
  operations: Array<{
    type?: string
    summary?: string
    assumptions?: string[]
    warnings?: string[]
  }>
  appliedOperations: number[]
  requestId: string
}

function rangeLabel(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const format = (date: Date) =>
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return `${format(start)} – ${format(end)}`
}

/**
 * The Sunday review, and whatever the coach wants to change about next week.
 *
 * Nobody asked for this screen, which sets the whole design brief: the verdict
 * reads in one line, the proposals are individually refusable, and refusing
 * every one of them is a first-class outcome that costs one tap. Proposals go
 * through the same executor as anything typed into Coach, so an approval here
 * lands in the action history with its undo intact — the review can be wrong
 * without being expensive.
 */
export function WeeklyReviewMoment({
  review,
  onClose,
}: {
  review: CoachReview
  onClose: (outcome: FullScreenEventOutcome) => void
}) {
  const applyOperations = useAction(api.ai.coachOperations.applyApproved)
  const markApplied = useMutation(api.ai.coachReviews.markApplied)
  const dismissReview = useMutation(api.ai.coachReviews.dismiss)

  const [applied, setApplied] = useState<number[]>(review.appliedOperations)
  const [busyIndex, setBusyIndex] = useState<number | null>(null)
  const [refused, setRefused] = useState<number[]>([])

  const outstanding = review.operations.filter(
    (_, index) => !applied.includes(index) && !refused.includes(index)
  ).length

  async function approve(index: number) {
    if (busyIndex !== null) return
    setBusyIndex(index)
    try {
      await applyOperations({
        // Per-operation, so approving one and refusing another cannot collide
        // on a shared idempotency key.
        requestId: `${review.requestId}-${index}`,
        operations: [review.operations[index]],
      })
      await markApplied({ reviewId: review.id, index })
      setApplied((current) => [...current, index])
      hapticMedium()
      toast.success("Done.")
    } catch (error) {
      logDevWarn("Failed to apply a review proposal", error)
      toast.error("Couldn't apply that one.")
    } finally {
      setBusyIndex(null)
    }
  }

  function refuse(index: number) {
    hapticSelection()
    setRefused((current) => [...current, index])
  }

  async function close(outcome: FullScreenEventOutcome) {
    try {
      // Applied proposals are already recorded; this only settles the review's
      // own status so it stops being offered.
      if (applied.length === 0 || outcome === "dismissed") {
        await dismissReview({ reviewId: review.id })
      }
    } catch (error) {
      logDevWarn("Failed to close the weekly review", error)
    }
    onClose(outcome)
  }

  return (
    <MomentScreen
      title={`Your week: ${rangeLabel(review.weekStart)}`}
      subtitle={review.headline}
      onClose={() => void close("dismissed")}
      showClose={false}
      actions={
        <>
          <MomentPrimaryAction
            onClick={() =>
              void close(applied.length > 0 ? "resolved" : "dismissed")
            }
          >
            {applied.length > 0 ? "Done" : "Got it"}
          </MomentPrimaryAction>
          {outstanding > 0 && (
            <MomentSecondaryAction
              onClick={() => void close("dismissed")}
              className="bg-transparent text-muted-foreground active:bg-muted/40"
            >
              Not this week
            </MomentSecondaryAction>
          )}
        </>
      }
    >
      {review.summary.length > 0 && (
        <ul className="flex flex-col gap-2">
          {review.summary.map((line) => (
            <li
              key={line}
              className="rounded-2xl bg-muted/30 px-4 py-3 text-[13px] leading-snug text-muted-foreground"
            >
              {line}
            </li>
          ))}
        </ul>
      )}

      {review.focus && (
        <div className="app-surface mt-3 px-4 py-4">
          <p className="text-[12px] tracking-wide text-muted-foreground uppercase">
            Next week
          </p>
          <p className="mt-1 text-[15px] leading-snug font-semibold tracking-tight">
            {review.focus}
          </p>
        </div>
      )}

      {review.operations.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {review.operations.map((operation, index) => {
            const isApplied = applied.includes(index)
            const isRefused = refused.includes(index)
            if (isRefused) return null

            return (
              <div
                key={`${operation.type ?? "operation"}-${index}`}
                className="app-surface px-4 py-4"
              >
                <p className="text-[14px] leading-snug font-medium">
                  {operation.summary ?? "A change to your plan"}
                </p>

                {(operation.assumptions?.length ||
                  operation.warnings?.length) && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {operation.warnings?.map((line) => (
                      <li
                        key={line}
                        className="text-[12px] leading-snug text-amber-600 dark:text-amber-500"
                      >
                        {line}
                      </li>
                    ))}
                    {operation.assumptions?.map((line) => (
                      <li
                        key={line}
                        className="text-[12px] leading-snug text-muted-foreground"
                      >
                        Assuming: {line}
                      </li>
                    ))}
                  </ul>
                )}

                {isApplied ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                    <Check size={14} weight="bold" />
                    Applied
                  </p>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyIndex !== null}
                      onClick={() => void approve(index)}
                      className="app-button-primary h-10 flex-1 text-[14px] disabled:opacity-50"
                    >
                      {busyIndex === index ? "Applying…" : "Do it"}
                    </button>
                    <button
                      type="button"
                      aria-label="Skip this suggestion"
                      disabled={busyIndex !== null}
                      onClick={() => refuse(index)}
                      className="app-icon-button h-10 w-10 bg-muted/55 text-muted-foreground disabled:opacity-40"
                    >
                      <X size={15} weight="bold" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </MomentScreen>
  )
}
