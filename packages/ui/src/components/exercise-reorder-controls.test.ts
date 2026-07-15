import { describe, expect, test } from "bun:test"

import { moveArrayItemByStep } from "./exercise-reorder-controls"

describe("exercise reordering", () => {
  test("moves an item one position in either direction", () => {
    expect(moveArrayItemByStep(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"])
    expect(moveArrayItemByStep(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"])
  })

  test("leaves boundary items in place", () => {
    expect(moveArrayItemByStep(["a", "b"], 0, -1)).toEqual(["a", "b"])
    expect(moveArrayItemByStep(["a", "b"], 1, 1)).toEqual(["a", "b"])
  })
})
