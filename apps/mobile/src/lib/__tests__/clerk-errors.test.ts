import { describe, expect, test } from "bun:test"
import { isAlreadySignedInError } from "../clerk-errors"

describe("Clerk error helpers", () => {
  test("detects already signed in messages", () => {
    expect(isAlreadySignedInError("You're already signed in")).toBe(true)
    expect(isAlreadySignedInError({ code: "already_signed_in" })).toBe(true)
  })

  test("detects nested Clerk errors", () => {
    expect(
      isAlreadySignedInError({
        errors: [
          {
            longMessage: "You are already signed in.",
          },
        ],
      })
    ).toBe(true)
    expect(
      isAlreadySignedInError(
        Object.assign(new Error("Clerk request failed"), {
          errors: [{ code: "already-signed-in" }],
        })
      )
    ).toBe(true)
  })

  test("ignores unrelated auth failures", () => {
    expect(isAlreadySignedInError({ code: "form_password_incorrect" })).toBe(
      false
    )
    expect(isAlreadySignedInError(new Error("Network error"))).toBe(false)
  })
})
