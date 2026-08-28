/**
 * The quick-add page's end of Needle 2.
 *
 * One session, one run at a time, and every state the run can be in kept
 * where a component can render it. The session itself is the app-wide one
 * from `@/lib/needle` — there is a single engine in the process, so a second
 * session would not be a second model, it would be two callers corrupting one
 * KV cache.
 *
 * Warming is deliberate and eager, and it is scoped to one fine family — five
 * tools at most. Measured against the real engine in a browser, `prepare()`
 * costs what the catalogue costs:
 *
 *     1 tool    213ms      20 tools   2.2s
 *     5 tools   751ms      50 tools   5.5s
 *
 * That is the index being built over every declared schema, and it is why the
 * whole catalogue is never registered here. Five tools is half a second, which
 * is a page that opens; fifty is six, which is a page that looks broken.
 * `NEEDLE_FAMILIES` makes the same argument from the accuracy side — at five
 * or fewer nothing is dropped and retrieval is not consulted at all.
 *
 * Re-scoping costs another prepare, so the scope in hand is remembered and a
 * repeat is free.
 *
 * Destructive tools stop the loop rather than run. `confirm` here resolves a
 * promise the UI holds open, so nothing is deleted without a human answering
 * a question — and if this hook is torn down mid-question, the pending
 * promise resolves `false` and the run ends unconfirmed. Failing closed is the
 * only acceptable default when the caller is a 45M-parameter model.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { NeedleCall, NeedleRun, NeedleSession } from "@repo/needle"
import { needleQuickActions, type NeedleFamily } from "@/lib/needle-tools"
import { inverseOfRun } from "@/dashboard/needle-undo"

export type NeedlePhase = "cold" | "warming" | "ready" | "running" | "failed"

export type NeedleRunState = {
  phase: NeedlePhase
  /** The last completed run, whatever its ending. Named `result` and not
   * `run` because the thing that starts one is called that. */
  result: NeedleRun | null
  /** Whatever broke — a missing engine, a dead runtime — in the user's face. */
  error: string | null
  /** Destructive calls waiting on an answer, and the answer's way back. */
  pending: NeedleCall[] | null
  /** Which family is currently declared, for the readout. */
  scope: NeedleFamily | null
  /** Set once the last run has been taken back, so the button can stop
   * offering to do it twice. */
  undone: boolean
}

const IDLE: NeedleRunState = {
  phase: "cold",
  result: null,
  error: null,
  pending: null,
  scope: null,
  undone: false,
}

export function useNeedleRun(navigate: (path: string) => void) {
  const [state, setState] = useState<NeedleRunState>(IDLE)
  const session = useRef<Promise<NeedleSession> | null>(null)
  /** The family the engine is currently holding. Changing it is a re-prepare,
   * so it is worth knowing when nothing has changed. */
  const declared = useRef<NeedleFamily | null>(null)
  const answer = useRef<((ok: boolean) => void) | null>(null)
  /** The last thing asked, kept so it can be asked again over the floor. */
  const asked = useRef<{ query: string; scope: NeedleFamily } | null>(null)
  const runRef = useRef<
    | ((
        query: string,
        scope: NeedleFamily,
        options?: { minConfidence?: number }
      ) => Promise<NeedleRun | undefined>)
    | null
  >(null)
  const alive = useRef(true)
  // Handlers outlive renders; the navigate a stale closure captured would
  // route into a screen that has since unmounted.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      // Whoever is waiting on an answer is not getting one now.
      answer.current?.(false)
      answer.current = null
    }
  }, [])

  const gate = useCallback(
    (calls: NeedleCall[]) =>
      new Promise<boolean>((resolve) => {
        if (!alive.current) return resolve(false)
        setState((was) => ({ ...was, pending: calls }))
        answer.current = (ok) => {
          answer.current = null
          setState((was) => ({ ...was, pending: null }))
          resolve(ok)
        }
      }),
    []
  )

  /**
   * Everything that touches the session, in the order it was asked for.
   *
   * There is one engine and one toolbox in the process, and `needleQuickActions`
   * re-registers that toolbox wholesale. Two of those in flight at once — the
   * warm-up holding `food` while a run asks for `wellbeing` — is not a slow
   * path, it is a wrong one: the engine can end up with a grammar built from
   * one family and a toolbox holding another, and the model then names a tool
   * that is no longer there.
   *
   * That is not theoretical. It shipped, and it looked like this:
   *
   *   Log 250ml of water → log_food{food: water, grams: 250}
   *   → needle called unknown tool log_food
   *
   * The grammar was still the food family from the warm-up. So every scope
   * change, every run, and every undo goes through this one chain, and nothing
   * re-registers underneath a turn that has already started decoding.
   */
  const chain = useRef<Promise<unknown>>(Promise.resolve())

  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.current.then(work, work)
    // The chain must survive a rejection or every later call inherits it.
    chain.current = next.catch(() => undefined)
    return next
  }

  /**
   * The session, holding exactly one family. Re-registering a different one is
   * a fresh `prepare()`, which is the cost this whole file exists to control.
   * Only ever called from inside `serialize`.
   */
  const open = useCallback(
    async (scope: NeedleFamily) => {
      const held = await session.current
      if (held && declared.current === scope) return held
      const ready = await needleQuickActions({
        navigate: (path) => navigateRef.current(path),
        confirm: gate,
        families: [scope],
      })
      declared.current = scope
      session.current = Promise.resolve(ready)
      await ready.prepare()
      if (alive.current) setState((was) => ({ ...was, scope }))
      return ready
    },
    [gate]
  )

  const warm = useCallback(
    async (scope: NeedleFamily) => {
      setState((was) =>
        was.phase === "cold" ? { ...was, phase: "warming" } : was
      )
      try {
        await serialize(() => open(scope))
        if (!alive.current) return
        setState((was) => ({ ...was, phase: "ready", error: null }))
      } catch (cause) {
        if (!alive.current) return
        setState((was) => ({
          ...was,
          phase: "failed",
          error:
            cause instanceof Error
              ? cause.message
              : "The model failed to load.",
        }))
      }
    },
    [open]
  )

  const run = useCallback(
    async (
      query: string,
      scope: NeedleFamily,
      options?: { minConfidence?: number }
    ) => {
      const text = query.trim()
      if (!text) return
      setState((was) => ({
        ...was,
        phase: "running",
        result: null,
        error: null,
        undone: false,
      }))
      asked.current = { query: text, scope }
      try {
        // Scope and turn in one link of the chain: a re-register that landed
        // between them would be the exact bug this queue exists to prevent.
        const result = await serialize(async () => {
          const ready = await open(scope)
          // A fresh question starts from nothing. `run()` deliberately keeps
          // the context across its own steps so tool results feed the next
          // one, but it never rewinds between calls, and the engine holds one
          // KV cache for the process — so without this the last question is
          // still sitting in front of this one. Measured against the real
          // engine: ask "log an omlette", then "200g of chicken breast for
          // lunch", and the second comes back `log_food{food: "omlette"}`.
          // Reset first, and it is `chicken breast, 200g, lunch`.
          await ready.reset()
          return await ready.run(text, options)
        })
        if (!alive.current) return
        setState((was) => ({ ...was, phase: "ready", result }))
        return result
      } catch (cause) {
        if (!alive.current) return
        setState((was) => ({
          ...was,
          phase: "failed",
          error: cause instanceof Error ? cause.message : "The run failed.",
        }))
      }
    },
    [open]
  )

  /**
   * Ask the same thing again with the floor taken off.
   *
   * The floor is a calibration, not a verdict: below it the engine has decided
   * a call it can name is a call it would rather not make, and the honest
   * answer to that is to show the user what it wanted and let them say. This
   * re-decodes rather than executing the refused turn directly, so the
   * destructive gate and everything else stays on the one path it is tested on.
   */
  const runAnyway = useCallback(async () => {
    const again = asked.current
    if (!again) return
    return await runRef.current?.(again.query, again.scope, {
      minConfidence: 0,
    })
  }, [])

  /**
   * Put the last run back.
   *
   * Straight through the toolbox, never through the model: the inverses are
   * already decided by `needle-undo`, and asking a language model to undo
   * something is asking it to guess at a second write.
   *
   * `confirmed` is true because the human pressed undo — that press *is* the
   * confirmation the gate exists to collect, and `remove_food_entry` is
   * destructive on paper for exactly the reason it is safe here.
   */
  const undo = useCallback(async () => {
    const calls = inverseOfRun(state.result?.calls ?? [])
    if (!calls.length || !session.current) return
    setState((was) => ({ ...was, phase: "running" }))
    try {
      await serialize(async () => {
        const ready = await session.current
        if (!ready) return
        for (const call of calls) {
          await ready.toolbox.execute(call, { confirmed: true })
        }
      })
      if (!alive.current) return
      setState((was) => ({ ...was, phase: "ready", undone: true }))
    } catch (cause) {
      if (!alive.current) return
      setState((was) => ({
        ...was,
        phase: "ready",
        error:
          cause instanceof Error ? cause.message : "That would not come back.",
      }))
    }
  }, [state.result])

  /** The human's answer to a destructive call. */
  const resolvePending = useCallback((ok: boolean) => {
    answer.current?.(ok)
  }, [])

  // `runAnyway` and `run` would otherwise have to be declared in the wrong
  // order or memoised into each other's dependency lists.
  runRef.current = run

  return { ...state, warm, run, runAnyway, undo, resolvePending }
}
