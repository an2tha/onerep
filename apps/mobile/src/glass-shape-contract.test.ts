import { readLocalizedSource as readFileSync } from "../tests/helpers/localized-source"

import { describe, expect, test } from "vitest"

const UI_CSS = readFileSync(
  new URL("../../../packages/ui/src/index.css", import.meta.url),
  "utf8"
)
const MOBILE_MODAL_CSS = readFileSync(
  new URL("../../../packages/ui/src/styles/mobile-modals.css", import.meta.url),
  "utf8"
)

describe("glass shape contracts", () => {
  test("keeps pills circular instead of remapping them to control corners", () => {
    expect(UI_CSS).not.toMatch(
      /\.rounded-full\[class\*=["'](?:p|pr|pl)x?-["']\]/
    )
  })

  test("top-rounded sheets do not acquire rounded bottom corners", () => {
    const sheetCompatibilityRule = UI_CSS.match(
      /\.rounded-t-3xl,[\s\S]*?\n\}/
    )?.[0]

    expect(sheetCompatibilityRule).toBeDefined()
    expect(sheetCompatibilityRule).not.toContain("border-bottom-right-radius")
    expect(sheetCompatibilityRule).not.toContain("border-bottom-left-radius")
  })

  test("modal glass does not repaint every descendant control", () => {
    expect(MOBILE_MODAL_CSS).not.toMatch(
      /&\s+:where\([\s\S]*?button:not\([\s\S]*?background-color:/
    )
    expect(MOBILE_MODAL_CSS).toContain(
      "Controls keep their authored geometry and paint"
    )
  })
})
