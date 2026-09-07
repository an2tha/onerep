import { describe, expect, test } from "bun:test"

import {
  ONE_REP_VISUAL_IDENTITY,
  cssVariable,
  defineVisualIdentity,
  resolveVisualIdentityTokens,
} from "./visual-identity"
import {
  MICRO_COLORS,
  MUSCLE_COLORS,
  ONE_REP_PALETTE,
  VISUAL_IDENTITY_PALETTE,
} from "./design-tokens"

describe("visual identity tokens", () => {
  test("keeps the incumbent OneRep identity override-free", () => {
    expect(
      resolveVisualIdentityTokens(ONE_REP_VISUAL_IDENTITY, "light")
    ).toEqual({})
    expect(
      resolveVisualIdentityTokens(ONE_REP_VISUAL_IDENTITY, "dark")
    ).toEqual({})
  })

  test("merges shared tokens with the resolved appearance", () => {
    const identity = defineVisualIdentity({
      id: "test",
      label: "Test",
      tokens: {
        "--radius-control": "0.25rem",
        "--surface-app": "canvas",
      },
      dark: {
        "--surface-app": "dark-canvas",
        "--foreground": "white",
      },
    })

    expect(resolveVisualIdentityTokens(identity, "dark")).toEqual({
      "--radius-control": "0.25rem",
      "--surface-app": "dark-canvas",
      "--foreground": "white",
    })
    expect(resolveVisualIdentityTokens(identity, "light")).toEqual({
      "--radius-control": "0.25rem",
      "--surface-app": "canvas",
    })
  })

  test("builds CSS variable references with stable fallbacks", () => {
    expect(cssVariable("--palette-iron", "#5b5bd6")).toBe(
      "var(--palette-iron, #5b5bd6)"
    )
    expect(cssVariable("--surface-app")).toBe("var(--surface-app)")
  })

  test("routes shared data palettes through overridable variables", () => {
    expect(ONE_REP_PALETTE.iron).toBe("#5b5bd6")
    expect(VISUAL_IDENTITY_PALETTE.iron).toBe(
      "var(--palette-iron, #5b5bd6)"
    )
    expect(MUSCLE_COLORS.biceps).toBe("var(--muscle-biceps, #736a78)")
    expect(MICRO_COLORS.vitaminD).toBe("var(--micro-vitamin-d, #7d7668)")
  })
})
