import { describe, expect, it } from "bun:test"
import {
  MIN_REP_RANGE_FRACTION,
  applyOrientation,
  chooseRepSignal,
  classifyCameraView,
  buildTimeline,
  collectReps,
  detectReps,
  fitToFrameBudget,
  hipToAnkle,
  toBodyFrame,
} from "@/lib/pose-reps"
import { POSE_LANDMARK_COUNT } from "@/lib/pose-scene"
import type { FormCoachAngleLandmarks, FormCoachFrame } from "@/lib/form-coach"

type P = { x: number; y: number; z: number; visibility: number }

/**
 * A stick lifter standing with hips at the origin, squatting to `depth` (0 =
 * standing, 1 = deepest), optionally yawed about the vertical axis to stand in
 * for a different camera angle.
 */
function pose(depth: number, yawRadians = 0): P[] {
  const hipToAnkleGap = 0.9 - depth * 0.35
  const points = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 1,
  }))
  // MediaPipe world y grows downward, so these are negated: a standing lifter
  // has their head at negative y. Getting this backwards would invert every
  // gravity-referenced measurement.
  const set = (i: number, x: number, y: number, z: number) => {
    points[i] = { x, y: -y, z, visibility: 1 }
  }
  set(11, -0.2, 0.5, 0) // left shoulder
  set(12, 0.2, 0.5, 0) // right shoulder
  set(23, -0.15, 0, 0) // left hip
  set(24, 0.15, 0, 0) // right hip
  set(25, -0.15, -hipToAnkleGap / 2, depth * 0.2) // left knee
  set(26, 0.15, -hipToAnkleGap / 2, depth * 0.2) // right knee
  set(27, -0.15, -hipToAnkleGap, 0) // left ankle
  set(28, 0.15, -hipToAnkleGap, 0) // right ankle
  // Nose forward of the shoulders. At yaw 0 that puts it nearer the camera
  // (MediaPipe z grows away from it), i.e. the lifter is facing the lens.
  set(0, 0, 0.75, -0.1) // nose

  if (yawRadians === 0) return points
  const cos = Math.cos(yawRadians)
  const sin = Math.sin(yawRadians)
  return points.map((p) => ({
    x: p.x * cos - p.z * sin,
    y: p.y,
    z: p.x * sin + p.z * cos,
    visibility: p.visibility,
  }))
}

function frameFrom(points: P[], timeMs: number): FormCoachFrame {
  return { timeMs, landmarks: points, worldLandmarks: points }
}

/** `count` reps sampled at 10fps, each a smooth down-and-up over 2s. */
function repClip(count: number, yaw = 0, index = 1): FormCoachAngleLandmarks {
  const perRep = 20
  const frames: FormCoachFrame[] = []
  for (let i = 0; i < count * perRep; i += 1) {
    const phase = (i % perRep) / perRep
    const depth = (1 - Math.cos(phase * 2 * Math.PI)) / 2
    frames.push(frameFrom(pose(depth, yaw), i * 100))
  }
  return { index, frames }
}

/**
 * The same lifter standing still from the waist down, with their wrists placed
 * `metres` from their shoulders along `axis`. Stands in for every lift where the
 * arms do the travelling and the hips barely move at all.
 */
function armPose(
  metres: number,
  axis: "forward" | "up" | "out",
  yawRadians = 0
): P[] {
  const points = pose(0)
  const offset = (sign: number) =>
    axis === "forward"
      ? { x: 0, y: 0, z: -metres }
      : axis === "up"
        ? { x: 0, y: -metres, z: 0 }
        : { x: sign * metres, y: 0, z: 0 }

  for (const [wrist, shoulder, sign] of [
    [15, 11, -1],
    [16, 12, 1],
  ] as const) {
    const from = points[shoulder]
    const delta = offset(sign)
    points[wrist] = {
      x: from.x + delta.x,
      y: from.y + delta.y,
      z: from.z + delta.z,
      visibility: 1,
    }
  }

  if (yawRadians === 0) return points
  const cos = Math.cos(yawRadians)
  const sin = Math.sin(yawRadians)
  return points.map((p) => ({
    x: p.x * cos - p.z * sin,
    y: p.y,
    z: p.x * sin + p.z * cos,
    visibility: p.visibility,
  }))
}

/**
 * `count` arm reps at 10fps. `near` is the wrist-to-shoulder distance at the
 * turnaround and `far` the distance at each end, so swapping them is the
 * difference between a bench press (starts locked out) and an overhead press
 * (starts racked).
 */
function armClip(
  count: number,
  { near, far, axis }: { near: number; far: number; axis: "forward" | "up" },
  index = 1
): FormCoachAngleLandmarks {
  const perRep = 20
  const frames: FormCoachFrame[] = []
  for (let i = 0; i < count * perRep; i += 1) {
    const phase = (i % perRep) / perRep
    const t = (1 - Math.cos(phase * 2 * Math.PI)) / 2
    frames.push(frameFrom(armPose(far + (near - far) * t, axis), i * 100))
  }
  return { index, frames }
}

describe("toBodyFrame", () => {
  it("puts the hips at the origin", () => {
    const body = toBodyFrame(pose(0))!
    expect(body[23].x).toBeCloseTo(-0.15, 5)
    expect((body[23].y + body[24].y) / 2).toBeCloseTo(0, 5)
  })

  it("makes the same pose identical from any camera angle", () => {
    const front = toBodyFrame(pose(0.5, 0))!
    const side = toBodyFrame(pose(0.5, Math.PI / 2))!
    const behind = toBodyFrame(pose(0.5, Math.PI))!
    for (let i = 0; i < POSE_LANDMARK_COUNT; i += 1) {
      expect(side[i].x).toBeCloseTo(front[i].x, 5)
      expect(side[i].y).toBeCloseTo(front[i].y, 5)
      expect(side[i].z).toBeCloseTo(front[i].z, 5)
      expect(behind[i].z).toBeCloseTo(front[i].z, 5)
    }
  })

  it("keeps the torso pointing up", () => {
    const body = toBodyFrame(pose(0))!
    expect((body[11].y + body[12].y) / 2).toBeGreaterThan(0.4)
    expect((body[27].y + body[28].y) / 2).toBeLessThan(0)
  })

  it("gives up when the torso landmarks are missing", () => {
    expect(toBodyFrame([])).toBeNull()
    const noHips = pose(0)
    noHips[23] = { x: 0, y: 0, z: 0, visibility: 1 }
    noHips[24] = { x: 0, y: 0, z: 0, visibility: 1 }
    expect(toBodyFrame(noHips)).toBeNull()
  })
})

describe("hipToAnkle", () => {
  it("shrinks as the lifter descends", () => {
    const standing = hipToAnkle(frameFrom(pose(0), 0))!
    const deep = hipToAnkle(frameFrom(pose(1), 0))!
    expect(deep).toBeLessThan(standing)
  })

  it("does not change with the camera angle", () => {
    const front = hipToAnkle(frameFrom(pose(0.5, 0), 0))!
    const side = hipToAnkle(frameFrom(pose(0.5, Math.PI / 2), 0))!
    expect(side).toBeCloseTo(front, 5)
  })

  it("returns null for an untracked frame", () => {
    expect(
      hipToAnkle({ timeMs: 0, landmarks: [], worldLandmarks: [] })
    ).toBeNull()
  })
})

describe("detectReps", () => {
  it("counts three reps in a three-rep clip", () => {
    expect(detectReps(repClip(3).frames)).toHaveLength(3)
  })

  it("puts the bottom of each rep at the deepest frame", () => {
    const clip = repClip(2)
    for (const rep of detectReps(clip.frames)) {
      const depths = clip.frames
        .slice(rep.startIndex, rep.endIndex + 1)
        .map((frame) => hipToAnkle(frame)!)
      expect(hipToAnkle(clip.frames[rep.bottomIndex])).toBeCloseTo(
        Math.min(...depths),
        5
      )
    }
  })

  it("ignores standing still", () => {
    const frames = Array.from({ length: 40 }, (_, i) =>
      frameFrom(pose(0), i * 100)
    )
    expect(detectReps(frames)).toEqual([])
  })

  // The case that broke: five real quarter squats came back as zero reps. The
  // hip-to-ankle chord is 2L*sin(theta/2), so it barely moves near lockout, and
  // the old absolute threshold needed the knee past 120 degrees before it
  // registered anything at all.
  it("counts quarter squats", () => {
    const perRep = 20
    const frames: FormCoachFrame[] = []
    for (let i = 0; i < 5 * perRep; i += 1) {
      const phase = (i % perRep) / perRep
      // Peaks at a knee angle of roughly 140 degrees: shallow, but a rep.
      const depth = 0.22 * (1 - Math.cos(phase * 2 * Math.PI))
      frames.push(frameFrom(pose(depth), i * 100))
    }
    expect(detectReps(frames)).toHaveLength(5)
  })

  it("reads a partial rep off the joint angle when the chord is too flat", () => {
    const detection = chooseRepSignal(
      Array.from({ length: 60 }, (_, i) => {
        const phase = (i % 20) / 20
        return frameFrom(pose(0.18 * (1 - Math.cos(phase * 2 * Math.PI))), i * 100)
      })
    )
    expect(detection.reps).toHaveLength(3)
    expect(detection.signal).not.toBeNull()
  })

  it("ignores a dip too shallow to be a rep", () => {
    // A sway of a centimetre or two, which is tracking noise rather than a rep.
    const frames = Array.from({ length: 40 }, (_, i) => {
      const depth = 0.012 * (1 - Math.cos((i / 20) * 2 * Math.PI))
      return frameFrom(pose(depth), i * 100)
    })
    expect(detectReps(frames)).toEqual([])
  })

  // A pause or bounce at the bottom makes several local minima inside one rep.
  it("counts a bounced rep once", () => {
    const frames: FormCoachFrame[] = []
    const depths = [0, 0.3, 0.7, 1, 0.92, 1, 0.9, 1, 0.6, 0.2, 0, 0, 0]
    depths.forEach((depth, i) => frames.push(frameFrom(pose(depth), i * 100)))
    expect(detectReps(frames)).toHaveLength(1)
  })

  it("returns nothing for a single frame", () => {
    expect(detectReps([frameFrom(pose(0), 0)])).toEqual([])
  })
})

// The coach is offered on every exercise, so the detector cannot assume the
// hips are what moved.
describe("detectReps beyond the squat", () => {
  it("reads a squat off the hips", () => {
    expect(chooseRepSignal(repClip(3).frames).signal).toBe("hip_to_ankle")
  })

  it("counts a press that starts locked out and closes", () => {
    const clip = armClip(3, { near: 0.15, far: 0.65, axis: "forward" })
    const detected = chooseRepSignal(clip.frames)
    expect(detected.reps).toHaveLength(3)
    expect(detected.signal).toBe("wrist_to_shoulder")
  })

  // The rep is an opening rather than a closing here, which a detector that
  // only looks for a dip would undercount by one.
  it("counts a press that starts racked and opens", () => {
    const clip = armClip(3, { near: 0.7, far: 0.12, axis: "up" })
    expect(chooseRepSignal(clip.frames).reps).toHaveLength(3)
  })

  it("counts a raise where the elbow angle never changes", () => {
    // A straight arm sweeping up from the hip: wrist-to-shoulder is fixed at
    // 0.6 throughout, so only the wrist-to-hip distance carries the rep.
    const perRep = 20
    const frames: FormCoachFrame[] = []
    for (let i = 0; i < 2 * perRep; i += 1) {
      const phase = (i % perRep) / perRep
      const lift = (1 - Math.cos(phase * 2 * Math.PI)) / 2
      const theta = (lift * Math.PI) / 2
      const points = pose(0)
      for (const [wrist, shoulder, sign] of [
        [15, 11, -1],
        [16, 12, 1],
      ] as const) {
        const from = points[shoulder]
        points[wrist] = {
          x: from.x + sign * 0.6 * Math.sin(theta),
          y: from.y + 0.6 * Math.cos(theta),
          z: from.z,
          visibility: 1,
        }
      }
      frames.push(frameFrom(points, i * 100))
    }

    const detected = chooseRepSignal(frames)
    expect(detected.reps).toHaveLength(2)
    expect(detected.signal).toBe("wrist_to_hip")
  })

  it("ignores arms that barely move", () => {
    const clip = armClip(3, { near: 0.55, far: 0.6, axis: "forward" })
    expect(chooseRepSignal(clip.frames)).toMatchObject({
      signal: null,
      reps: [],
    })
  })
})

describe("collectReps", () => {
  it("keeps every rep from every angle in one capture", () => {
    const collected = collectReps([repClip(3, 0, 1), repClip(2, Math.PI / 2, 2)])!
    expect(collected.repCount).toBe(5)
    expect(collected.angleCount).toBe(2)
  })

  // The reason averaging went: a mean rep is shallower than the deepest rep and
  // deeper than the shallowest, so the two reps worth talking about both vanish.
  it("preserves the extremes rather than averaging them away", () => {
    const deep = repClip(1, 0, 2)
    // The first angle's lifter cuts every rep half as deep as the second's.
    const shallow: FormCoachAngleLandmarks = {
      index: 1,
      frames: deep.frames.map((frame, i) => {
        const phase = (i % 20) / 20
        const depth = ((1 - Math.cos(phase * 2 * Math.PI)) / 2) * 0.5
        return frameFrom(pose(depth), i * 100)
      }),
    }

    const collected = collectReps([shallow, deep])!
    const lowestOf = (angleIndex: number) =>
      Math.min(
        ...collected.reps
          .filter((rep) => rep.angleIndex === angleIndex)
          .flatMap((rep) => rep.frames.map((frame) => hipToAnkle(frame)!))
      )
    expect(lowestOf(2)).toBeLessThan(lowestOf(1) - 0.02)
  })

  it("plays a real rep rather than a synthesised one", () => {
    const collected = collectReps([repClip(2)])!
    const played = collected.display.frames
    const match = collected.reps.find(
      (rep) => rep.frames.length === played.length
    )
    expect(match).toBeDefined()
    expect(played[0].worldLandmarks[27].y).toBeCloseTo(
      match!.frames[0].worldLandmarks[27].y,
      6
    )
  })

  it("keeps the rep filmed at its own cadence", () => {
    const collected = collectReps([repClip(2)])!
    const rep = collected.reps[0]
    // 20 frames of a 10fps clip make one 2s rep, give or take the hysteresis
    // band the detector uses to close a cycle.
    expect(rep.frames.length).toBeGreaterThan(10)
    expect(rep.frames.at(-1)!.timeMs).toBeGreaterThan(1000)
    expect(rep.frames[0].timeMs).toBe(0)
  })

  it("produces a rep that actually descends and comes back up", () => {
    const collected = collectReps([repClip(2)])!
    const depths = collected.display.frames.map((frame) => hipToAnkle(frame)!)
    const lowest = Math.min(...depths)
    expect(depths[0] - lowest).toBeGreaterThan(MIN_REP_RANGE_FRACTION)
    expect(depths.at(-1)! - lowest).toBeGreaterThan(MIN_REP_RANGE_FRACTION)
    // Deepest point sits in the middle of the cycle, not at either end.
    const bottom = depths.indexOf(lowest)
    expect(bottom).toBeGreaterThan(2)
    expect(bottom).toBeLessThan(depths.length - 3)
  })

  it("plays the better-tracked rep of the two", () => {
    const clear = repClip(1, 0, 1)
    const occluded = repClip(1, 0, 2)
    // One angle lost the left ankle and guessed it a metre off.
    for (const frame of occluded.frames) {
      frame.worldLandmarks[27] = { x: 9, y: 9, z: 9, visibility: 0.02 }
      frame.landmarks[27] = frame.worldLandmarks[27]
    }
    const collected = collectReps([clear, occluded])!
    expect(collected.display.index).toBe(1)
  })

  // Rep detection is a guess, and being unable to find a rep is not a reason to
  // throw away footage the coach can still read.
  it("keeps a capture that contained no countable rep", () => {
    const still: FormCoachAngleLandmarks = {
      index: 1,
      frames: Array.from({ length: 20 }, (_, i) => frameFrom(pose(0), i * 100)),
    }
    const collected = collectReps([still])!
    expect(collected.repCount).toBe(0)
    expect(collected.reps).toEqual([])
    expect(collected.angles).toHaveLength(1)
    expect(collected.angles[0].repSignal).toBeNull()
    // Something to look at, rather than an empty box.
    expect(collected.display.frames.length).toBeGreaterThan(0)
  })

  it("returns null only when nothing at all was tracked", () => {
    expect(collectReps([])).toBeNull()
    expect(
      collectReps([
        {
          index: 1,
          frames: [{ timeMs: 0, landmarks: [], worldLandmarks: [] }],
        },
      ])
    ).toBeNull()
  })

  it("still summarises an angle that produced no rep", () => {
    const still: FormCoachAngleLandmarks = {
      index: 2,
      frames: Array.from({ length: 20 }, (_, i) => frameFrom(pose(0), i * 100)),
    }
    const collected = collectReps([repClip(2, 0, 1), still])!
    expect(collected.angles.map((angle) => angle.index)).toEqual([1, 2])
    expect(collected.angles[1].repCount).toBe(0)
    // It contributed no rep, so it is not a contributing angle.
    expect(collected.angleCount).toBe(1)
  })

  it("records which signal each angle's reps came from", () => {
    const collected = collectReps([
      repClip(2, 0, 1),
      armClip(3, { near: 0.15, far: 0.65, axis: "forward" }, 2),
    ])!
    expect(collected.angles.map((angle) => angle.repSignal)).toEqual([
      "hip_to_ankle",
      "wrist_to_shoulder",
    ])
  })

  it("counts no reps in a still photo but keeps it", () => {
    const photo: FormCoachAngleLandmarks = {
      index: 1,
      frames: [frameFrom(pose(0.5), 0)],
    }
    const collected = collectReps([photo])!
    expect(collected.repCount).toBe(0)
    expect(collected.display.frames).toHaveLength(1)
  })
})

describe("buildTimeline", () => {
  it("samples the whole clip once a second", () => {
    // Three 2s reps at 10fps is 6s of footage.
    const timeline = buildTimeline([repClip(3, 0, 1)])
    expect(timeline).toHaveLength(6)
    expect(timeline.map((sample) => sample.timeMs)).toEqual([
      0, 1000, 2000, 3000, 4000, 5000,
    ])
  })

  it("puts every angle in one series, each sample saying where it came from", () => {
    const timeline = buildTimeline([repClip(2, 0, 1), repClip(1, Math.PI / 2, 2)])
    expect(new Set(timeline.map((sample) => sample.angleIndex))).toEqual(
      new Set([1, 2])
    )
  })

  // Body framing is what makes one series legitimate: the same movement filmed
  // from two directions has to land in the same coordinate system.
  it("puts two angles of the same movement in the same frame", () => {
    const [front] = buildTimeline([repClip(1, 0, 1)])
    const [side] = buildTimeline([repClip(1, Math.PI / 2, 2)])
    front.worldLandmarks.forEach((point, i) => {
      expect(point.x).toBeCloseTo(side.worldLandmarks[i].x, 4)
      expect(point.y).toBeCloseTo(side.worldLandmarks[i].y, 4)
      expect(point.z).toBeCloseTo(side.worldLandmarks[i].z, 4)
    })
  })

  it("covers the gaps between reps, not just the reps", () => {
    const clip = repClip(1, 0, 1)
    // Four seconds of standing about after the set.
    const tail = Array.from({ length: 40 }, (_, i) =>
      frameFrom(pose(0), 2000 + i * 100)
    )
    const timeline = buildTimeline([{ index: 1, frames: [...clip.frames, ...tail] }])
    expect(timeline.length).toBeGreaterThan(4)
    expect(timeline.at(-1)!.timeMs).toBeGreaterThanOrEqual(5000)
  })

  it("thins a long clip instead of cutting it short", () => {
    const long = repClip(30, 0, 1)
    const timeline = buildTimeline([long], 10)
    expect(timeline).toHaveLength(10)
    expect(timeline[0].timeMs).toBe(0)
    expect(timeline.at(-1)!.timeMs).toBeGreaterThan(50_000)
  })

  // With no rep detected the point cloud is the only evidence left, and a
  // second between samples cannot show a two-second rep.
  it("samples densely when asked to", () => {
    const dense = buildTimeline([repClip(2, 0, 1)], 60, 333)
    const coarse = buildTimeline([repClip(2, 0, 1)])
    expect(dense.length).toBeGreaterThan(coarse.length * 2)
    expect(dense[1].timeMs - dense[0].timeMs).toBeLessThan(500)
  })

  it("returns nothing when no frame was tracked", () => {
    expect(
      buildTimeline([
        { index: 1, frames: [{ timeMs: 0, landmarks: [], worldLandmarks: [] }] },
      ])
    ).toEqual([])
  })
})

describe("fitToFrameBudget", () => {
  const rep = (repIndex: number, frames: number) => ({
    angleIndex: 1,
    repIndex,
    startMs: 0,
    timing: { totalMs: 2000, toTurnaroundMs: 1000 },
    frames: Array.from({ length: frames }, (_, i) => frameFrom(pose(0), i * 100)),
  })

  it("leaves a capture inside the budget alone", () => {
    const reps = [rep(1, 20), rep(2, 20)]
    expect(fitToFrameBudget(reps, 100)).toHaveLength(2)
  })

  // Dropping the tail would throw away the reps where a set breaks down, which
  // are the ones worth keeping.
  it("thins evenly rather than truncating the set", () => {
    const reps = Array.from({ length: 10 }, (_, i) => rep(i + 1, 20))
    const kept = fitToFrameBudget(reps, 100)
    expect(kept.length).toBeLessThan(10)
    expect(kept[0].repIndex).toBe(1)
    expect(kept.at(-1)!.repIndex).toBe(10)
  })
})

describe("classifyCameraView", () => {
  // The yaw in `pose()` rotates the lifter about the vertical axis, which is
  // equivalent to walking the camera around them.
  const clipAt = (yaw: number) => repClip(1, yaw).frames

  it("recognises a front-on shot", () => {
    expect(classifyCameraView(clipAt(0))).toBe("front")
  })

  it("recognises a shot from behind", () => {
    expect(classifyCameraView(clipAt(Math.PI))).toBe("back")
  })

  it("recognises both side-on shots", () => {
    expect(classifyCameraView(clipAt(Math.PI / 2))).toBe("side")
    expect(classifyCameraView(clipAt(-Math.PI / 2))).toBe("side")
  })

  it("calls a 45 degree shot oblique rather than guessing", () => {
    expect(classifyCameraView(clipAt(Math.PI / 4))).toBe("oblique")
  })

  it("tolerates a shot that is nearly but not exactly square on", () => {
    expect(classifyCameraView(clipAt(0.3))).toBe("front")
    expect(classifyCameraView(clipAt(-0.3))).toBe("front")
  })

  // Whether the frame is mirrored is not something we can know, so front and
  // back must not be decided by the sign of the shoulder line's x.
  it("is unchanged when the image is mirrored", () => {
    const mirrored = clipAt(0).map((frame) => ({
      ...frame,
      worldLandmarks: frame.worldLandmarks.map((p) => ({ ...p, x: -p.x })),
    }))
    expect(classifyCameraView(mirrored)).toBe("front")
  })

  it("says oblique when the face gives nothing away", () => {
    const faceless = clipAt(0).map((frame) => ({
      ...frame,
      worldLandmarks: frame.worldLandmarks.map((p, i) =>
        i === 0 ? { ...p, z: 0 } : p
      ),
    }))
    expect(classifyCameraView(faceless)).toBe("oblique")
  })

  it("falls back to oblique with nothing to measure", () => {
    expect(classifyCameraView([])).toBe("oblique")
    expect(
      classifyCameraView([{ timeMs: 0, landmarks: [], worldLandmarks: [] }])
    ).toBe("oblique")
  })
})

describe("collectReps per-rep output", () => {
  it("returns every contributing rep separately", () => {
    const collected = collectReps([repClip(3, 0, 1), repClip(2, Math.PI / 2, 2)])!
    expect(collected.reps).toHaveLength(5)
    expect(collected.reps.every((rep) => rep.frames.length > 0)).toBe(true)
  })

  it("numbers reps within each angle", () => {
    const collected = collectReps([repClip(3, 0, 1), repClip(2, Math.PI / 2, 2)])!
    const first = collected.reps.filter((rep) => rep.angleIndex === 1)
    const second = collected.reps.filter((rep) => rep.angleIndex === 2)
    expect(first.map((rep) => rep.repIndex)).toEqual([1, 2, 3])
    expect(second.map((rep) => rep.repIndex)).toEqual([1, 2])
  })

  it("says where in its clip each rep began", () => {
    const collected = collectReps([repClip(3, 0, 1)])!
    const starts = collected.reps.map((rep) => rep.startMs)
    expect(starts[0]).toBeLessThan(starts[1])
    expect(starts[1]).toBeLessThan(starts[2])
  })

  it("summarises each contributing angle", () => {
    const collected = collectReps([repClip(2, 0, 1), repClip(1, Math.PI / 2, 2)])!
    expect(collected.angles).toHaveLength(2)
    expect(collected.angles[0]).toMatchObject({
      index: 1,
      view: "front",
      repCount: 2,
    })
    expect(collected.angles[1]).toMatchObject({
      index: 2,
      view: "side",
      repCount: 1,
    })
    expect(collected.angles[0].trackingRate).toBe(1)
  })

  it("marks an angle that contributed no reps rather than dropping it", () => {
    const still: FormCoachAngleLandmarks = {
      index: 2,
      frames: Array.from({ length: 20 }, (_, i) => frameFrom(pose(0), i * 100)),
    }
    const collected = collectReps([repClip(2, 0, 1), still])!
    expect(collected.angles.map((angle) => angle.repCount)).toEqual([2, 0])
  })
})

describe("toBodyFrame is gravity-referenced", () => {
  /** A lifter leaning `lean` degrees forward at the hips. */
  function leaning(leanDegrees: number) {
    const points = pose(0)
    const radians = (leanDegrees * Math.PI) / 180
    // Shoulders pitch forward about the hips. `pose` negates y, so these do too.
    for (const [index, x] of [
      [11, -0.2],
      [12, 0.2],
    ] as const) {
      points[index] = {
        x,
        y: -0.5 * Math.cos(radians),
        z: 0.5 * Math.sin(radians),
        visibility: 1,
      }
    }
    return points
  }

  const torsoLean = (points: ReturnType<typeof pose>) => {
    const body = toBodyFrame(points)!
    const shoulders = {
      x: (body[11].x + body[12].x) / 2,
      y: (body[11].y + body[12].y) / 2,
      z: (body[11].z + body[12].z) / 2,
    }
    // Angle of the hips-to-shoulders axis away from the frame's vertical.
    return (
      (Math.atan2(Math.hypot(shoulders.x, shoulders.z), shoulders.y) * 180) /
      Math.PI
    )
  }

  // The frame used to be built from the torso itself, which made this
  // structurally zero — torso lean, the measurement a side-on squat turns on,
  // could never be seen.
  it("can actually see a torso lean", () => {
    expect(torsoLean(leaning(0))).toBeCloseTo(0, 4)
    expect(torsoLean(leaning(30))).toBeCloseTo(30, 4)
    expect(torsoLean(leaning(50))).toBeCloseTo(50, 4)
  })

  it("still cancels the camera angle", () => {
    const front = toBodyFrame(pose(0.5, 0))!
    const side = toBodyFrame(pose(0.5, Math.PI / 2))!
    for (let i = 0; i < POSE_LANDMARK_COUNT; i += 1) {
      expect(side[i].x).toBeCloseTo(front[i].x, 5)
      expect(side[i].y).toBeCloseTo(front[i].y, 5)
      expect(side[i].z).toBeCloseTo(front[i].z, 5)
    }
  })

  it("keeps the head above the feet", () => {
    const body = toBodyFrame(pose(0))!
    expect((body[11].y + body[12].y) / 2).toBeGreaterThan(0.4)
    expect((body[27].y + body[28].y) / 2).toBeLessThan(0)
  })
})

describe("applyOrientation", () => {
  const clip = repClip(1)

  it("leaves the data alone when nothing was adjusted", () => {
    expect(applyOrientation([clip], { pitchDeg: 0, rollDeg: 0 })[0]).toBe(clip)
  })

  // Body framing removes yaw only, so a tilt correction has to survive it —
  // otherwise the coach measures a skeleton the lifter never approved.
  it("changes what the measurements see", () => {
    const upright = toBodyFrame(clip.frames[0].worldLandmarks)!
    const tilted = applyOrientation([clip], { pitchDeg: 20, rollDeg: 0 })
    const after = toBodyFrame(tilted[0].frames[0].worldLandmarks)!
    const moved = after.some(
      (point, i) => Math.abs(point.z - upright[i].z) > 0.01
    )
    expect(moved).toBe(true)
  })

  it("does not move the body relative to itself", () => {
    const tilted = applyOrientation([clip], { pitchDeg: 20, rollDeg: -10 })
    const before = clip.frames[0].worldLandmarks
    const after = tilted[0].frames[0].worldLandmarks
    const span = (p: typeof before, a: number, b: number) =>
      Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y, p[a].z - p[b].z)
    // A rotation, so every bone keeps its length.
    expect(span(after, 23, 27)).toBeCloseTo(span(before, 23, 27), 9)
    expect(span(after, 11, 12)).toBeCloseTo(span(before, 11, 12), 9)
  })
})
