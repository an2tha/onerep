/**
 * free-exercise-db illustrations.
 *
 * The dataset ships two stills per movement — the start and the end. They are
 * stepped through with arrows rather than animated: two photographs fading into
 * each other on a loop is a distraction, and someone reading the instructions
 * wants to look at one position for as long as they feel like it.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Barbell, CaretLeft, CaretRight } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import { hapticSelection } from "@/lib/haptics"
import { exerciseImageUrls, exerciseThumbnailUrl } from "@/lib/exercise-media"

const FRAME_LABELS = ["Start", "Finish"]

/**
 * Small round frame for list rows. Falls back to an icon, never to nothing.
 *
 * The `<img>` is only mounted once the row nears the viewport. `loading="lazy"`
 * alone is not enough here: the library renders ~900 rows, and the route
 * transition waits on every image element in the incoming page, so nine hundred
 * pending lazy images would hold the whole navigation hostage.
 */
export function ExerciseThumbnail({
  exerciseId,
  className,
}: {
  exerciseId: string
  className?: string
}) {
  const src = exerciseThumbnailUrl(exerciseId)
  const [failed, setFailed] = useState(false)
  const [near, setNear] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || near) return
    if (typeof IntersectionObserver === "undefined") {
      setNear(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { rootMargin: "300px 0px" }
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [near])

  return (
    <div
      ref={frameRef}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground/[0.05]",
        className
      )}
    >
      {src && near && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Barbell size={17} className="text-muted-foreground/60" />
      )}
    </div>
  )
}

/** The detail illustration, one frame at a time, with arrows to step. */
export function ExerciseArt({
  exerciseId,
  exerciseName,
  className,
}: {
  exerciseId: string
  exerciseName: string
  className?: string
}) {
  const urls = useMemo(() => exerciseImageUrls(exerciseId), [exerciseId])
  const [frame, setFrame] = useState(0)
  const [failed, setFailed] = useState<Record<number, boolean>>({})

  useEffect(() => {
    setFrame(0)
    setFailed({})
  }, [urls])

  // A missing 1.jpg is common enough in the dataset that pretending it exists
  // would leave people clicking an arrow into a broken image.
  const frames = urls.map((_, index) => index).filter((index) => !failed[index])
  const current = frames.includes(frame) ? frame : (frames[0] ?? 0)
  const position = frames.indexOf(current)

  function step(delta: number) {
    const next = frames[position + delta]
    if (next === undefined) return
    hapticSelection()
    setFrame(next)
  }

  if (urls.length === 0 || frames.length === 0) {
    return (
      <div
        className={cn(
          "flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-foreground/[0.04]",
          className
        )}
      >
        <Barbell size={30} className="text-muted-foreground/40" />
      </div>
    )
  }

  return (
    <figure className={cn("m-0", className)}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-foreground/[0.04]">
        {urls.map((url, index) => (
          <img
            key={url}
            src={url}
            alt={`${exerciseName}, ${FRAME_LABELS[index] ?? `frame ${index + 1}`}`}
            decoding="async"
            hidden={index !== current}
            onError={() => setFailed((state) => ({ ...state, [index]: true }))}
            className="h-full w-full object-cover"
          />
        ))}

        {frames.length > 1 && (
          <>
            <ArtArrow
              side="left"
              label="Previous frame"
              disabled={position === 0}
              onClick={() => step(-1)}
            />
            <ArtArrow
              side="right"
              label="Next frame"
              disabled={position === frames.length - 1}
              onClick={() => step(1)}
            />
          </>
        )}
      </div>

      {frames.length > 1 && (
        <figcaption className="mt-2 flex items-center justify-between text-[13px] text-muted-foreground">
          <span className="font-medium">
            {FRAME_LABELS[current] ?? `Frame ${current + 1}`}
          </span>
          <span>
            {position + 1} / {frames.length}
          </span>
        </figcaption>
      )}
    </figure>
  )
}

function ArtArrow({
  side,
  label,
  disabled,
  onClick,
}: {
  side: "left" | "right"
  label: string
  disabled: boolean
  onClick: () => void
}) {
  const Icon = side === "left" ? CaretLeft : CaretRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-opacity",
        side === "left" ? "left-2" : "right-2",
        disabled ? "pointer-events-none opacity-0" : "opacity-100"
      )}
    >
      <Icon size={16} weight="bold" />
    </button>
  )
}
