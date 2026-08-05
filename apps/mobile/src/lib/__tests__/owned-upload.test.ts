import { beforeEach, describe, expect, mock, test } from "bun:test"

const mutationMock = mock(async (_ref: unknown, _args: unknown) => ({}) as any)

mock.module("../convex", () => ({
  convexClient: {
    mutation: mutationMock,
  },
}))

const { uploadOwnedFile } = await import("../owned-upload")

let lastRequest: { url: string; init: RequestInit } | undefined

beforeEach(() => {
  lastRequest = undefined
  // The two mutations are createIntent then finalize, in that order.
  let call = 0
  mutationMock.mockImplementation(async () =>
    call++ === 0
      ? { uploadUrl: "https://example.convex.cloud/upload", uploadId: "i1" }
      : { uploadId: "upload_1" }
  )
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    lastRequest = { url, init }
    return new Response(JSON.stringify({ storageId: "st_1" }), {
      headers: { "Content-Type": "application/json" },
    })
  }) as unknown as typeof fetch
})

describe("uploadOwnedFile", () => {
  // CapacitorHttp's native bridge serializes File bodies and silently drops
  // plain Blob ones, failing with CapacitorUrlRequestError 0 on device.
  test("sends a File body even when handed a plain Blob", async () => {
    const blob = new Blob([JSON.stringify({ frames: [] })], {
      type: "application/json",
    })

    await uploadOwnedFile(blob, "form_coach_landmarks", "squat-1.json")

    const body = lastRequest?.init.body
    expect(body).toBeInstanceOf(File)
    expect((body as File).name).toBe("squat-1.json")
    expect((body as File).type).toStartWith("application/json")
    expect((lastRequest?.init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    )
    expect(await (body as File).text()).toBe(JSON.stringify({ frames: [] }))
  })

  test("passes an existing File through untouched", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", {
      type: "image/jpeg",
    })

    await uploadOwnedFile(file, "recipe_photo", "photo.jpg")

    expect(lastRequest?.init.body).toBe(file)
  })

  test("falls back to a generic name when none is given", async () => {
    await uploadOwnedFile(new Blob(["x"], { type: "text/plain" }), "coach_image")

    expect((lastRequest?.init.body as File).name).toBe("upload")
  })
})
