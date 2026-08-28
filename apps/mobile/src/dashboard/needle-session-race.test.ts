/**
 * The bug this is about, verbatim from a device:
 *
 *   Log 250ml of water → log_food{food: water, grams: 250}
 *   → needle called unknown tool log_food
 *
 * One engine, one toolbox, two callers. The warm-up registers the food family
 * and the run registers wellbeing; whichever finishes last owns the toolbox,
 * whichever initialised last owns the grammar, and there is no rule saying it
 * is the same one. The fix is not inside the session — it already tracks the
 * toolbox version correctly — it is refusing to let two of these overlap.
 *
 * `NeedleSession` is stubbed rather than imported because the failure is in the
 * ordering of the calls, not in what the engine does with them, and the real
 * one needs 14 MB of weights to say so.
 */

import { describe, expect, test } from "bun:test"

/** A stand-in with the one behaviour that matters: the grammar is whatever the
 * toolbox held the last time a turn had to make one. */
function fakeEngine() {
  let registered: string[] = []
  let grammar: string[] = []
  let version = 0
  let initialised = -1
  return {
    async register(tools: string[], delay: number) {
      await new Promise((r) => setTimeout(r, delay))
      registered = tools
      version += 1
    },
    async prepare() {
      if (initialised !== version) {
        grammar = [...registered]
        initialised = version
      }
    },
    /**
     * What a turn does: fix the grammar, spend a while decoding against it,
     * then look the call it produced up in the toolbox. Decoding takes real
     * time — a second or so on a phone — and that gap is the whole bug. A
     * registration landing inside it changes the toolbox out from under a
     * grammar that has already been committed to.
     */
    async run(wanted: string, decodeMs = 30) {
      await this.prepare()
      const named = grammar.includes(wanted) ? wanted : "empty_call"
      await new Promise((r) => setTimeout(r, decodeMs))
      if (named === "empty_call") return "refused"
      if (!registered.includes(named)) {
        return `needle called unknown tool ${named}`
      }
      return "done"
    },
  }
}

const FOOD = ["log_food", "search_food"]
const WELLBEING = ["log_water", "start_fast"]

describe("two callers, one toolbox", () => {
  test("unserialised, the grammar and the toolbox come apart", async () => {
    const engine = fakeEngine()
    // The run gets there first and commits to the wellbeing grammar. The
    // warm-up, slower to resolve, drops the food family on top of the toolbox
    // while the turn is still decoding.
    const run = (async () => {
      await engine.register(WELLBEING, 0)
      return await engine.run("log_water")
    })()
    const warm = (async () => {
      await engine.register(FOOD, 10)
      await engine.prepare()
    })()
    const [outcome] = await Promise.all([run, warm])
    expect(outcome).toContain("unknown tool")
  })

  test("through one chain, the last scope asked for is the one that answers", async () => {
    const engine = fakeEngine()
    let chain: Promise<unknown> = Promise.resolve()
    const serialize = <T>(work: () => Promise<T>): Promise<T> => {
      const next = chain.then(work, work)
      chain = next.catch(() => undefined)
      return next
    }
    const warm = serialize(async () => {
      await engine.register(FOOD, 10)
      await engine.prepare()
    })
    const run = serialize(async () => {
      await engine.register(WELLBEING, 0)
      return await engine.run("log_water")
    })
    const [, outcome] = await Promise.all([warm, run])
    expect(outcome).toBe("done")
  })

  test("a failed link does not poison the ones behind it", async () => {
    let chain: Promise<unknown> = Promise.resolve()
    const serialize = <T>(work: () => Promise<T>): Promise<T> => {
      const next = chain.then(work, work)
      chain = next.catch(() => undefined)
      return next
    }
    const failed = serialize(async () => {
      throw new Error("the model failed to load")
    })
    await expect(failed).rejects.toThrow("the model failed to load")
    await expect(serialize(async () => "fine")).resolves.toBe("fine")
  })
})
