import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import {
  COACH_IMAGE_TYPES,
  coachImageValidationError,
  prepareCoachImage,
} from "../coach-media.ts"

const originalCreateImageBitmap = globalThis.createImageBitmap
const originalDocument = globalThis.document

afterEach(() => {
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    writable: true,
    value: originalCreateImageBitmap,
  })
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: originalDocument,
  })
})

describe("Coach image preparation", () => {
  test("accepts only supported, non-empty images up to 12 MB", () => {
    assert.deepEqual(COACH_IMAGE_TYPES, [
      "image/jpeg",
      "image/png",
      "image/webp",
    ])
    assert.equal(
      coachImageValidationError({ type: "image/jpeg", size: 1 }),
      null
    )
    assert.equal(
      coachImageValidationError({
        type: "image/webp",
        size: 12 * 1024 * 1024,
      }),
      null
    )
    assert.equal(
      coachImageValidationError({ type: "image/gif", size: 1 }),
      "Choose a JPEG, PNG, or WebP image."
    )
    assert.equal(
      coachImageValidationError({ type: "image/png", size: 0 }),
      "That image is empty."
    )
    assert.equal(
      coachImageValidationError({
        type: "image/png",
        size: 12 * 1024 * 1024 + 1,
      }),
      "Choose an image smaller than 12 MB."
    )
  })

  test("rejects an invalid image before decoding it", async () => {
    let decoded = false
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: async () => {
        decoded = true
        throw new Error("should not decode")
      },
    })

    await assert.rejects(
      prepareCoachImage(
        new File(["not an image"], "coach.gif", { type: "image/gif" })
      ),
      /Choose a JPEG, PNG, or WebP image\./
    )
    assert.equal(decoded, false)
  })

  test("downscales the longest edge, encodes JPEG, and closes the bitmap", async () => {
    const drawCalls: unknown[][] = []
    let bitmapClosed = false
    let encodedType: string | undefined
    let encodedQuality: number | undefined
    const bitmap = {
      width: 3_200,
      height: 1_600,
      close() {
        bitmapClosed = true
      },
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (...args: unknown[]) => drawCalls.push(args),
      }),
      toBlob: (callback: BlobCallback, type?: string, quality?: number) => {
        encodedType = type
        encodedQuality = quality
        callback(new Blob(["jpeg"], { type: type ?? "image/jpeg" }))
      },
    }

    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: async () => bitmap,
    })
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: (tagName: string) => {
          assert.equal(tagName, "canvas")
          return canvas
        },
      },
    })

    const prepared = await prepareCoachImage(
      new File(["source"], "Lunch.PnG", { type: "image/png" })
    )

    assert.equal(canvas.width, 1_600)
    assert.equal(canvas.height, 800)
    assert.deepEqual(drawCalls, [[bitmap, 0, 0, 1_600, 800]])
    assert.equal(bitmapClosed, true)
    assert.equal(encodedType, "image/jpeg")
    assert.equal(encodedQuality, 0.84)
    assert.equal(prepared.name, "Lunch.jpg")
    assert.equal(prepared.type, "image/jpeg")
    assert.equal(await prepared.text(), "jpeg")
  })

  test("does not upscale small images and rejects oversized encoded output", async () => {
    let bitmapClosed = false
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (callback: BlobCallback) =>
        callback(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)])),
    }

    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: async () => ({
        width: 640,
        height: 480,
        close: () => {
          bitmapClosed = true
        },
      }),
    })
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: { createElement: () => canvas },
    })

    await assert.rejects(
      prepareCoachImage(
        new File(["source"], "large-output.jpg", { type: "image/jpeg" })
      ),
      /The prepared image is still too large\./
    )
    assert.equal(canvas.width, 640)
    assert.equal(canvas.height, 480)
    assert.equal(bitmapClosed, true)
  })
})
