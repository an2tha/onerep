/**
 * The families are a table of names, and a table of names rots.
 *
 * Every guarantee the split is supposed to buy — that a declared tool is
 * reachable, that no tool is stranded outside every family — is a claim about
 * this table matching the catalogue, and nothing in the type system checks it.
 * Add a tool and it belongs to no family; rename one and its family points at
 * a ghost. Both are silent. Neither is silent here.
 */

import { describe, expect, test } from "bun:test"
import {
  NEEDLE_FAMILIES,
  buildQuickActionTools,
  familySize,
  familyToolbox,
  type NeedleFamily,
  type QuickActionDeps,
} from "@/lib/needle-tools"

const deps: QuickActionDeps = {
  query: async () => undefined,
  mutate: async () => ({ ok: true }),
  today: () => "2026-08-26",
  now: () => "2026-08-26T14:30:00.000Z",
  id: () => "id-1",
  searchFoods: async () => [],
  foodByCode: async () => null,
  foodByBarcode: async () => null,
  navigate: () => {},
}

const catalogue = buildQuickActionTools(deps).map((tool) => tool.name)
const families = Object.keys(NEEDLE_FAMILIES) as NeedleFamily[]
const filed: string[] = families.flatMap((family) => [
  ...NEEDLE_FAMILIES[family],
])

describe("the fine families", () => {
  test("file every tool in the catalogue", () => {
    const missing = catalogue.filter((name) => !filed.includes(name))
    expect(missing).toEqual([])
  })

  test("name no tool that does not exist", () => {
    const ghosts = filed.filter((name) => !catalogue.includes(name))
    expect(ghosts).toEqual([])
  })

  test("file each tool exactly once", () => {
    const twice = filed.filter((name, index) => filed.indexOf(name) !== index)
    expect(twice).toEqual([])
  })

  /**
   * Five is the whole point. Past it the engine stops declaring every tool and
   * starts embedding the query to pick five, and the tools that lose are
   * unreachable rather than unlikely — which is how a ten-tool wellbeing
   * family answered "log 250ml of water" at 35% confidence.
   */
  test("stay at or under the five retrieval keeps", () => {
    const crowded = families.filter(
      (family) => NEEDLE_FAMILIES[family].length > 5
    )
    expect(crowded).toEqual([])
  })

  test("build a toolbox holding only what was asked for", () => {
    const box = familyToolbox(deps, ["hydration"])
    expect(
      box
        .list()
        .map((tool) => tool.name)
        .sort()
    ).toEqual(["log_water", "undo_last_water"])
  })

  test("combine into a set a caller can size before declaring it", () => {
    expect(familySize(["hydration", "fasting"])).toBe(4)
    const box = familyToolbox(deps, ["hydration", "fasting"])
    expect(box.list()).toHaveLength(4)
  })
})
