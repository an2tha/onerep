import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

/**
 * The client builds the coach context; Convex validates it. Convex rejects any
 * field the validator does not declare, so the two drift silently until a user
 * opens Coach and gets an ArgumentValidationError instead of an answer — which
 * is exactly what happened when `hasAnyData`, `weekDays`, `todayCalories`,
 * `todayProtein` and `lastWorkout` were added on one side only.
 *
 * Compared by field name rather than by shape: the shapes are hand-written in
 * two languages and will never be mechanically comparable, but a missing name
 * is the failure that actually breaks the screen.
 */

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8")
}

const CLIENT = source("../coach-context.ts")
const SERVER = source("../../../../../convex/ai/metricGeneration.ts")

/** Top-level keys of a braced block, ignoring anything nested deeper. */
function topLevelKeys(block: string) {
  return new Set(
    [...block.matchAll(/^ {2}(\w+)[?]?:/gm)].map((match) => match[1])
  )
}

function blockAfter(text: string, opener: string) {
  const start = text.indexOf(opener)
  assert.notEqual(start, -1, `could not find ${opener}`)
  const rest = text.slice(start + opener.length)
  const end = rest.search(/^\}\)?;?$/m)
  assert.notEqual(end, -1, `could not find the end of ${opener}`)
  return rest.slice(0, end)
}

describe("coach context contract", () => {
  test("the client type and the Convex validator declare the same fields", () => {
    const clientFields = topLevelKeys(
      blockAfter(CLIENT, "export type CoachContext = {")
    )
    const validatorFields = topLevelKeys(
      blockAfter(SERVER, "const coachContextValidator = v.object({")
    )

    assert.ok(clientFields.size > 20, "client type did not parse")
    assert.deepEqual(
      [...clientFields].filter((field) => !validatorFields.has(field)),
      [],
      "the client sends fields the validator will reject"
    )
    assert.deepEqual(
      [...validatorFields].filter((field) => !clientFields.has(field)),
      [],
      "the validator requires fields the client never sends"
    )
  })

  test("the server's own CoachContext type keeps up with its validator", () => {
    const typeFields = topLevelKeys(blockAfter(SERVER, "type CoachContext = {"))
    const validatorFields = topLevelKeys(
      blockAfter(SERVER, "const coachContextValidator = v.object({")
    )

    assert.deepEqual([...typeFields], [...validatorFields])
  })
})
