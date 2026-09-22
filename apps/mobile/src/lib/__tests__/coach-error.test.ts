import { expect, test } from "bun:test"
import { coachErrorMessage } from "../coach-error"
test("Coach uses the public Convex error without request IDs and stack traces", () => {
  const error = Object.assign(new Error("[CONVEX A(ai/chat)] Request ID: 123 Server error stack..."), { data: "The AI provider is temporarily rate-limiting this model." })
  expect(coachErrorMessage(error)).toBe(error.data)
  expect(coachErrorMessage(new Error("[CONVEX A(ai/chat)] raw stack"))).not.toContain("[CONVEX")
  expect(coachErrorMessage(new Error("Network unavailable"))).toBe("Network unavailable")
})
