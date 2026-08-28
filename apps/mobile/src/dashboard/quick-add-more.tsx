/**
 * The page behind the hold: the front end for Needle 2.
 *
 * The model is on the device and the toolbox is the app's own fifty quick
 * actions, so what this page does is short: take a sentence, hand it to the
 * engine, and show what it did with it. There is no chat here and there never
 * will be — Needle has no free-text mode at all. Every turn comes back as a
 * list of calls or the empty call meaning "nothing declared here serves this",
 * and that is exactly what the readout below renders.
 *
 * One family is declared at a time, never the whole catalogue, and the
 * families are the fine ones — five tools at most, the number the engine
 * declares before it starts embedding the query and keeping only the best
 * five. Both halves of that are measured. `prepare()` over fifty tools takes
 * five and a half seconds against two hundred milliseconds over one; and a
 * ten-tool family answered "Log 250ml of water" at 35% confidence, under the
 * floor, with `log_water` sitting in it the whole time.
 *
 * The chips pick a family outright. A typed sentence is routed by the words in
 * it and lands on food when nothing else fits, because most of what anyone
 * types into this box is something they ate.
 *
 * On the sheet it all sits on: `.quick-add-reveal` pours `--background`, not
 * `--foreground`. The page is the app's own colour, thickened and frosted, so
 * the dark theme stays dark. Everything in here is ordinary `--foreground`
 * ink on top of that.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { ComponentType, CSSProperties } from "react"
import {
  ArrowCounterClockwise,
  ArrowUp,
  Barbell,
  Check,
  Cactus,
  CircleNotch,
  ForkKnife,
  PintGlass,
  Timer,
  X,
} from "@phosphor-icons/react"
import { hapticMedium, hapticTap } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { useNeedleRun } from "@/dashboard/use-needle-run"
import { inverseOfRun } from "@/dashboard/needle-undo"
import type { NeedleFamily } from "@/lib/needle-tools"

/** Says what the page is, and is the only thing on it allowed to be loud. */
const TITLE = "Quick actions"

/**
 * The four asks common enough to be a button rather than a sentence.
 *
 * Each one writes an opening into the box instead of running on the spot: the
 * amounts are the part only the user knows, and a chip that logged 500ml the
 * instant it was touched would be wrong more often than right.
 */
const SHORTCUTS: {
  label: string
  opening: string
  family: NeedleFamily
  icon: ComponentType<{ size?: number; weight?: "bold"; className?: string }>
}[] = [
  { label: "Food", opening: "Log ", family: "food", icon: ForkKnife },
  {
    label: "Water",
    opening: "Log a glass of water",
    family: "hydration",
    icon: PintGlass,
  },
  {
    label: "Workout",
    opening: "Log a workout: ",
    family: "workout",
    icon: Barbell,
  },
  {
    label: "Fast",
    opening: "Start a 16 hour fast",
    family: "fasting",
    icon: Timer,
  },
]

/**
 * Which family a sentence belongs to.
 *
 * Crude on purpose, and ordered so the narrow readings win: "water" is
 * hydration before it is anything else, and a sentence with a number and a
 * food in it should never reach the bottom of this list. It only has to be
 * right often enough to save a re-prepare — when it is wrong the chips are
 * there, and a family that does not hold the tool refuses, which the page says
 * out loud.
 */
const ROUTES: [NeedleFamily, RegExp][] = [
  ["hydration", /\b(water|drank|drink|glass|bottle|sip|hydrat)/i],
  ["fasting", /\b(fast|fasting|eating window)/i],
  [
    "supplements",
    /\b(supplement|creatine|vitamin|protein powder|caffeine|pill)/i,
  ],
  [
    "body",
    /\b(weigh|weight|body fat|waist|chest|measurement|mood|energy|steps)/i,
  ],
  [
    "workout",
    /\b(workout|session|train|training|lift|set|sets|rep|reps|squat|bench|deadlift|run|ran|cycl|bike|swim)/i,
  ],
  ["restDays", /\b(rest day|day off|history)\b/i],
  [
    "schedule",
    /\b(schedule|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week)/i,
  ],
  ["routines", /\b(preset|routine|programme|program|template)/i],
  ["groceries", /\b(grocer|shopping|buy|basket|list)\b/i],
  ["repeats", /\b(repeat|every day|daily|recurring)/i],
  ["mealPrep", /\b(meal prep|prepped|batch)/i],
  ["recipes", /\b(recipe|cook)/i],
  ["meals", /\b(usual|my breakfast|save this|same as)/i],
  ["diary", /\b(what did i|show me|today.s log|yesterday)/i],
  ["navigation", /\b(open|take me to|go to)\b/i],
]

function routeOf(text: string): NeedleFamily {
  return ROUTES.find(([, pattern]) => pattern.test(text))?.[0] ?? "food"
}

/** `restDays` is a key, not a label. */
function spellFamily(family: NeedleFamily) {
  return family.replace(/([A-Z])/g, " $1").toLowerCase()
}

/** `log_food` reads as `Log food`. The model's names are snake_case because
 * grammars are; nothing on a screen should be. */
function spell(name: string) {
  const words = name.replace(/_/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The arguments the model filled in, as a line.
 *
 * Shown because they are the interesting half of a tool call and the only
 * place a mistake is visible before it is in the diary: `log_food` is always
 * going to say "Log food", and whether it understood you is entirely in the
 * `grams`. Quotes are dropped — this is a readout, not a REPL — and anything
 * with structure falls back to JSON rather than being flattened into a lie.
 */
function payload(args: Record<string, unknown>) {
  const parts = Object.entries(args)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
    .map(([key, value]) => {
      const shown =
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : typeof value === "boolean"
            ? value
              ? "yes"
              : "no"
            : JSON.stringify(value)
      return `${key.replace(/_/g, " ")} ${shown}`
    })
  return parts.join(" · ")
}

/** What the engine gives back, in a line: which tools it was holding, how
 * sure it was, how fast it ran. */
function readout(
  run: ReturnType<typeof useNeedleRun>["result"],
  family: NeedleFamily | null
) {
  const bits = [family ? `${spellFamily(family)} tools` : "On device"]
  if (run?.turn.confidence != null) {
    bits.push(`${Math.round(run.turn.confidence * 100)}% sure`)
  }
  if (run?.turn.decodeTps != null) {
    bits.push(`${Math.round(run.turn.decodeTps)} tok/s`)
  }
  return bits.join(" · ")
}

export function QuickAddMore({
  closing,
  onClose,
}: {
  closing: boolean
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState("")
  // Set by a chip, otherwise read out of the sentence when it is sent.
  const [picked, setPicked] = useState<NeedleFamily | null>(null)
  const navigate = useSmoothNavigate()
  const needle = useNeedleRun((path) => navigate(path))
  const { warm, run, resolvePending } = needle
  const busy = needle.phase === "running"

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // The engine warms as the page opens, holding the family most sentences want.
  // Anything else costs a re-prepare, and only once per family.
  useEffect(() => {
    void warm("food")
  }, [warm])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const submit = useCallback(() => {
    if (busy || !prompt.trim()) return
    hapticMedium()
    void run(prompt, picked ?? routeOf(prompt))
  }, [busy, prompt, picked, run])

  const calls = needle.result?.calls ?? []
  const refused = needle.result?.stop === "refused"
  // Only some writes have an opposite that already exists as a tool. The
  // button says how many when it is not all of them, rather than quietly
  // putting half of it back.
  const undoable = inverseOfRun(calls).length
  // Two different refusals wear the same `stop`. The engine that named a tool
  // and then thought better of it is not the engine that found nothing — the
  // first one has something to show, and something to offer.
  const wanted = refused ? (needle.result?.turn.calls ?? []) : []
  const unsure = refused && wanted.length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TITLE}
      data-state={closing ? "closing" : "open"}
      className="quick-add-more fixed inset-0 z-[61] text-foreground"
    >
      <div className="quick-add-page">
        {/* One column, capped. Stretched across a desktop the editor becomes a
            letterbox nobody can read the start and the end of. */}
        <div className="mx-auto flex h-full w-full max-w-[34rem] flex-col gap-5">
          <header className="flex shrink-0 items-start justify-between gap-4">
            <h1
              style={{ "--rise": 0 } as CSSProperties}
              className="quick-add-rise text-[32px] leading-[1.05] font-semibold tracking-[-0.035em]"
            >
              {TITLE}
            </h1>
            <button
              ref={closeRef}
              type="button"
              aria-label="Back to today"
              onClick={() => {
                hapticTap()
                onClose()
              }}
              className="quick-add-chip motion-tactile inline-flex size-11 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              <X size={17} weight="bold" />
            </button>
          </header>

          <nav
            aria-label="Shortcuts"
            className="quick-add-rail -mx-1 shrink-0 overflow-x-auto"
          >
            <ul className="flex w-max gap-2 px-1 pb-1">
              {SHORTCUTS.map((shortcut, index) => (
                <li key={shortcut.label}>
                  <button
                    type="button"
                    style={{ "--rise": index + 1 } as CSSProperties}
                    data-armed={picked === shortcut.family ? "true" : "false"}
                    onClick={() => {
                      hapticTap()
                      setPicked(shortcut.family)
                      setPrompt(shortcut.opening)
                      inputRef.current?.focus()
                    }}
                    className="quick-add-chip quick-add-rise motion-tactile flex items-center gap-2 px-3.5 py-2.5 text-[13px] leading-none font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-current"
                  >
                    <shortcut.icon size={16} weight="bold" aria-hidden="true" />
                    {shortcut.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section
            aria-label="Prompt"
            data-busy={busy ? "true" : "false"}
            style={{ "--rise": SHORTCUTS.length + 1 } as CSSProperties}
            className="quick-add-editor quick-add-rise flex min-h-0 shrink-0 flex-col"
          >
            <label htmlFor="needle-prompt" className="sr-only">
              Tell Needle what happened
            </label>
            <textarea
              ref={inputRef}
              id="needle-prompt"
              rows={3}
              spellCheck={false}
              value={prompt}
              disabled={busy}
              onChange={(event) => {
                setPrompt(event.target.value)
                // Typing over a chip's opening means the chip is no longer the
                // subject; let the sentence choose again.
                if (picked) setPicked(null)
              }}
              // Enter sends, because this box takes one sentence and not a
              // paragraph. Shift keeps the newline for the rare exception.
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder="Two eggs and a flat white, then forty minutes on the bike."
              className="quick-add-input min-h-[6.5rem] w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed outline-none disabled:opacity-60"
            />
            <div className="flex shrink-0 items-center justify-between gap-3 px-3 pt-2 pb-3">
              <p className="quick-add-meta truncate text-[11.5px] leading-none">
                {needle.phase === "warming"
                  ? "Loading the model…"
                  : needle.phase === "running"
                    ? "Thinking…"
                    : readout(needle.result, needle.scope)}
              </p>
              <button
                type="button"
                aria-label="Run"
                disabled={busy || !prompt.trim()}
                onClick={submit}
                className="quick-add-run motion-tactile inline-flex size-10 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                {busy ? (
                  <CircleNotch
                    size={16}
                    weight="bold"
                    className="animate-spin"
                  />
                ) : (
                  <ArrowUp size={17} weight="bold" />
                )}
              </button>
            </div>

            {(calls.length > 0 || refused || needle.error) && (
              <div className="quick-add-result px-4 py-3">
                {needle.error ? (
                  <p className="text-[13px] leading-snug" data-tone="error">
                    {needle.error}
                  </p>
                ) : unsure ? (
                  <div className="flex flex-col gap-2">
                    <p className="quick-add-meta text-[13px] leading-snug">
                      Not sure enough to write it. It wanted:
                    </p>
                    <ul className="flex flex-col gap-1">
                      {wanted.map((call, index) => (
                        <li
                          key={`${call.name}-${index}`}
                          className="flex flex-col gap-0.5"
                        >
                          <span className="text-[13px] leading-snug font-medium">
                            {spell(call.name)}
                          </span>
                          {payload(call.arguments) && (
                            <p className="quick-add-payload text-[11.5px] leading-snug">
                              {payload(call.arguments)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        hapticMedium()
                        void needle.runAnyway()
                      }}
                      className="quick-add-chip motion-tactile mt-1 flex items-center gap-2 self-start px-3 py-2 text-[12.5px] leading-none font-medium outline-none focus-visible:ring-2 focus-visible:ring-current disabled:opacity-45"
                    >
                      <Check size={14} weight="bold" aria-hidden="true" />
                      Do it anyway
                    </button>
                  </div>
                ) : refused ? (
                  <p className="quick-add-meta text-[13px] leading-snug">
                    Nothing in the{" "}
                    {needle.scope ? spellFamily(needle.scope) : "declared"}{" "}
                    tools fits that one. Try naming what you want logged.
                  </p>
                ) : (
                  <>
                    {/* An `ol`, and numbered, because the order is the point:
                        a logged yoghurt was looked up first, and the lookup is
                        where a wrong match becomes a wrong diary entry. One
                        call has no order to show, so it keeps the plain list. */}
                    <ol
                      className={
                        calls.length > 1
                          ? "quick-add-chain flex list-decimal flex-col gap-2"
                          : "flex flex-col gap-2"
                      }
                    >
                      {calls.map((call, index) => (
                        <li
                          key={`${call.name}-${index}`}
                          data-tone={call.error ? "error" : "done"}
                          className="flex flex-col gap-0.5"
                        >
                          <div className="flex items-baseline justify-between gap-3 text-[13px] leading-snug">
                            <span className="font-medium">
                              {spell(call.name)}
                            </span>
                            <span className="quick-add-meta shrink-0 text-[11.5px]">
                              {call.error ?? "done"}
                            </span>
                          </div>
                          {payload(call.arguments) && (
                            <p className="quick-add-payload text-[11.5px] leading-snug">
                              {payload(call.arguments)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                    {undoable > 0 && (
                      <button
                        type="button"
                        disabled={busy || needle.undone}
                        onClick={() => {
                          hapticMedium()
                          void needle.undo()
                        }}
                        className="quick-add-chip motion-tactile mt-3 flex items-center gap-2 px-3 py-2 text-[12.5px] leading-none font-medium outline-none focus-visible:ring-2 focus-visible:ring-current disabled:opacity-45"
                      >
                        <ArrowCounterClockwise
                          size={14}
                          weight="bold"
                          aria-hidden="true"
                        />
                        {needle.undone
                          ? "Undone"
                          : undoable === calls.length
                            ? "Undo"
                            : `Undo ${undoable} of ${calls.length}`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {needle.pending && (
            <div
              role="alertdialog"
              aria-label="Confirm"
              className="quick-add-editor flex shrink-0 flex-col gap-3 p-4"
            >
              <p className="text-[13.5px] leading-snug">
                {needle.pending.map((call) => spell(call.name)).join(", ")} —
                this one deletes something. Sure?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    hapticTap()
                    resolvePending(false)
                  }}
                  className="quick-add-chip motion-tactile flex-1 px-3 py-2.5 text-[13px] font-medium"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticMedium()
                    resolvePending(true)
                  }}
                  className="quick-add-run motion-tactile flex-1 px-3 py-2.5 text-[13px] font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          <footer className="quick-add-credit mt-auto flex shrink-0 items-center justify-center gap-1.5 text-[11.5px]">
            <Cactus size={14} weight="fill" aria-hidden="true" />
            Powered by Needle 2
          </footer>
        </div>
      </div>
    </div>
  )
}
