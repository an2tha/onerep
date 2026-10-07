import { expect, test } from "bun:test"
import { ConvexError } from "convex/values"
import { aiSharingErrorMessage } from "../ai-sharing-error"

const fallback = "Could not save your permission. No AI request was started. Try again."

test("outdated clients see the server's update instruction", () => {
  const message = "Please update OneRep to review the current AI sharing disclosure."
  expect(aiSharingErrorMessage(new ConvexError(message), fallback)).toBe(message)
})

test("network and unexpected failures keep the retry message without diagnostics", () => {
  for (const error of [new Error("[CONVEX mutation] internal details"), null, { data: {} }, { data: "" }]) {
    expect(aiSharingErrorMessage(error, fallback)).toBe(fallback)
  }
})
