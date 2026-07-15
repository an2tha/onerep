import { cn } from "../lib/utils"

export function ActiveWorkoutSetBanner({
  exerciseName,
  setLabel,
  contextLabel,
  complete = false,
  onActivate,
  className,
}: {
  exerciseName: string
  setLabel: string
  contextLabel?: string
  complete?: boolean
  onActivate?: () => void
  className?: string
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] leading-tight font-semibold text-foreground">
          {exerciseName}
        </p>
        {contextLabel && (
          <p className="mt-1 truncate text-[13px] font-medium text-muted-foreground">
            {contextLabel}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-semibold text-foreground tabular-nums">
          {setLabel}
        </p>
        {!complete && onActivate && (
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            View
          </p>
        )}
      </div>
    </>
  )

  if (!complete && onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className={cn(
          "mb-3 flex min-h-14 w-full items-center gap-3 border-y border-border py-2.5 text-left transition-colors active:bg-muted/35",
          className
        )}
        aria-label={`Go to active set: ${exerciseName}, ${setLabel}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      className={cn(
        "mb-3 flex min-h-14 items-center gap-3 border-y border-border py-2.5",
        className
      )}
      aria-label="Workout complete"
      aria-live="polite"
    >
      {content}
    </div>
  )
}
