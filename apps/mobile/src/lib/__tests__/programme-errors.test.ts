import { describe, expect, test } from "bun:test"
import { programmeErrorMessage } from "../programme-errors"

describe("programme error copy", () => {
  test("old profile errors show a recovery instruction without a stack", () => {
    const result = programmeErrorMessage(
      new Error(
        "[CONVEX A(ai/guidedProgramme:generate)] [Request ID: abc] Server Error Uncaught Error: Your nutrition profile requires an individual plan with a qualified professional. at handler (../convex/guidedProgrammes.ts:836:8) Called by client",
      ),
    )
    expect(result).toBe(
      "Review your nutrition profile. Some settings require a supervised plan.",
    )
  })
  test("uses public Convex data including nested serialization", () => {
    expect(
      programmeErrorMessage({
        data: JSON.stringify("Enter a height between 80 and 250 cm."),
      }),
    ).toBe("Enter a height between 80 and 250 cm.")
  })
  test("does not display transport diagnostics", () => {
    expect(
      programmeErrorMessage(
        new Error(
          "[CONVEX A(generate)] Server Error Uncaught Error: secret details",
        ),
      ),
    ).not.toContain("secret")
    expect(
      programmeErrorMessage(
        new Error("[CONVEX A(save)] Server Error"),
        "Could not save profile.",
      ),
    ).toBe("Could not save profile.")
  })
})
