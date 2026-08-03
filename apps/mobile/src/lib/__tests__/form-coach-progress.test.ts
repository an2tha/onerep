import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { formCoachAngleWeight, formCoachProgressValue } from "@/lib/form-coach"

describe("formCoachAngleWeight", () => {
  it("weights a longer clip more heavily", () => {
    expect(formCoachAngleWeight({ kind: "video", durationMs: 12000 })).toBe(
      12000
    )
    expect(
      formCoachAngleWeight({ kind: "video", durationMs: 12000 })
    ).toBeGreaterThan(formCoachAngleWeight({ kind: "video", durationMs: 2000 }))
  })

  it("gives a still a small but non-zero weight", () => {
    const weight = formCoachAngleWeight({ kind: "image", durationMs: 0 })
    expect(weight).toBeGreaterThan(0)
    expect(weight).toBeLessThan(
      formCoachAngleWeight({ kind: "video", durationMs: 5000 })
    )
  })

  // An upload whose duration the browser refused to report arrives as 0, and a
  // zero-weight angle would make the bar stall on it.
  it("never returns zero for a clip of unknown length", () => {
    expect(
      formCoachAngleWeight({ kind: "video", durationMs: 0 })
    ).toBeGreaterThan(0)
  })
})

describe("formCoachProgressValue", () => {
  const angles = [
    { kind: "video" as const, durationMs: 8000 },
    { kind: "video" as const, durationMs: 2000 },
  ]
  const total = angles.reduce(
    (sum, angle) => sum + formCoachAngleWeight(angle),
    0
  )

  it("starts at zero and finishes at one", () => {
    expect(
      formCoachProgressValue({
        doneWeight: 0,
        currentWeight: formCoachAngleWeight(angles[0]),
        fraction: 0,
        totalWeight: total,
      })
    ).toBe(0)
    expect(
      formCoachProgressValue({
        doneWeight: total,
        currentWeight: 0,
        fraction: 0,
        totalWeight: total,
      })
    ).toBe(1)
  })

  it("spends most of the bar on the longer clip", () => {
    // Finishing the 8s angle should be 80% of the way, not 50%.
    const afterFirst = formCoachProgressValue({
      doneWeight: formCoachAngleWeight(angles[0]),
      currentWeight: 0,
      fraction: 0,
      totalWeight: total,
    })
    expect(afterFirst).toBeCloseTo(0.8, 6)
  })

  // A bar that goes backwards looks broken, so this is the property that
  // matters most.
  it("never moves backwards across a whole run", () => {
    const readings: number[] = []
    let done = 0
    for (const angle of angles) {
      const weight = formCoachAngleWeight(angle)
      for (let step = 0; step <= 10; step += 1) {
        readings.push(
          formCoachProgressValue({
            doneWeight: done,
            currentWeight: weight,
            fraction: step / 10,
            totalWeight: total,
          })
        )
      }
      done += weight
      readings.push(
        formCoachProgressValue({
          doneWeight: done,
          currentWeight: 0,
          fraction: 0,
          totalWeight: total,
        })
      )
    }

    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i]).toBeGreaterThanOrEqual(readings[i - 1])
    }
    expect(readings.at(-1)).toBe(1)
  })

  it("clamps rather than overshooting on a ragged final frame", () => {
    expect(
      formCoachProgressValue({
        doneWeight: total,
        currentWeight: 5000,
        fraction: 1,
        totalWeight: total,
      })
    ).toBe(1)
  })

  it("reports done rather than dividing by zero with nothing to do", () => {
    expect(
      formCoachProgressValue({
        doneWeight: 0,
        currentWeight: 0,
        fraction: 0,
        totalWeight: 0,
      })
    ).toBe(1)
  })
})

/**
 * The decode loop is DOM-bound, so this reads the source rather than running
 * it. The bug it guards against was invisible on desktop and deterministic on
 * the phone, which is the worst combination to leave untested.
 */
describe("video decoding", () => {
  const source = readFileSync(
    new URL("../form-coach.ts", import.meta.url),
    "utf8"
  )

  // Sampling starts at t=0 on a video already at 0. Assigning the current time
  // performs no seek, so WebKit fires no `seeked` and the wait never ends —
  // the progress bar sat at exactly 0% forever. Chrome fires it regardless.
  it("does not wait for a seek to a time the video is already at", () => {
    expect(source).toContain(
      "if (Math.abs(video.currentTime - seconds) < SEEK_EPSILON_S)"
    )
  })

  it("gives up rather than hanging when a decode never answers", () => {
    expect(source).toContain("DECODE_TIMEOUT_MS")
    // Both waits, not just the seek.
    expect(source).toContain("The video took too long to decode")
    expect(source).toContain("The video stopped responding while being read")
  })

  it("clears its handlers and timer once settled", () => {
    expect(source).toContain("video.onseeked = null")
    expect(source).toContain("window.clearTimeout(timer)")
  })

  // WebKit treats preload as a hint; setting src alone can fetch nothing.
  it("explicitly loads the element", () => {
    expect(source).toContain("video.load()")
  })
})
