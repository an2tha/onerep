import { beforeEach, describe, expect, mock, test } from "bun:test"

const toastError = mock(() => {})

mock.module("sonner", () => ({
  toast: {
    error: toastError,
  },
}))

const {
  offlineMutationErrorMessage,
  reportOfflineMutationError,
} = await import("../offline-mutation-errors")

describe("offline mutation error reporting", () => {
  beforeEach(() => {
    toastError.mockClear()
  })

  test("uses the error message when one is available", () => {
    expect(offlineMutationErrorMessage(new Error("Storage is full"))).toBe(
      "Storage is full"
    )
  })

  test("uses a fallback for non-error values", () => {
    expect(offlineMutationErrorMessage("nope", "Save failed")).toBe(
      "Save failed"
    )
  })

  test("reports the resolved message through toast", () => {
    reportOfflineMutationError(new Error("Could not queue change"))

    expect(toastError).toHaveBeenCalledWith("Could not queue change")
  })

  test("reports fallback copy for unexpected rejection values", () => {
    reportOfflineMutationError(null, "Could not update today's log")

    expect(toastError).toHaveBeenCalledWith("Could not update today's log")
  })
})
