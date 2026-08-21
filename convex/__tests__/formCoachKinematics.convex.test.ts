import { describe, expect, test } from "vitest";
import {
  LANDMARK,
  alignmentOffset,
  meanTempo,
  consistency,
  jointAngle,
  phaseIndex,
  rangeOfMotion,
  repsFromViews,
  segmentFromVertical,
  symmetry,
  travel,
  tempo,
  turnaroundIndex,
  type FormCoachCapture,
  type KinematicFrame,
  type KinematicRep,
  type Vec3,
  bodyLineTilt,
  trunkRotation,
} from "../ai/formCoachKinematics";

const LANDMARK_COUNT = 33;

function emptyFrame(): KinematicFrame {
  return {
    worldLandmarks: Array.from({ length: LANDMARK_COUNT }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0,
    })),
  };
}

function put(frame: KinematicFrame, name: keyof typeof LANDMARK, at: Vec3) {
  frame.worldLandmarks[LANDMARK[name]] = { visibility: 1, ...at };
  return frame;
}

/**
 * A body-framed stick lifter. `bend` in degrees flexes the knee in the sagittal
 * plane about a fixed hip and knee, so the knee angle is known exactly.
 */
function legFrame(bendDegrees: number, side: "left" | "right" = "left") {
  const frame = emptyFrame();
  const x = side === "left" ? -0.15 : 0.15;
  const radians = (bendDegrees * Math.PI) / 180;
  put(frame, side === "left" ? "leftHip" : "rightHip", { x, y: 0, z: 0 });
  put(frame, side === "left" ? "leftKnee" : "rightKnee", { x, y: -0.45, z: 0 });
  // Rotate the shin away from straight-down by the requested amount.
  put(frame, side === "left" ? "leftAnkle" : "rightAnkle", {
    x,
    y: -0.45 - 0.45 * Math.cos(radians),
    z: 0.45 * Math.sin(radians),
  });
  return frame;
}

function uprightFrame(): KinematicFrame {
  const frame = emptyFrame();
  put(frame, "leftShoulder", { x: -0.2, y: 0.5, z: 0 });
  put(frame, "rightShoulder", { x: 0.2, y: 0.5, z: 0 });
  put(frame, "leftHip", { x: -0.15, y: 0, z: 0 });
  put(frame, "rightHip", { x: 0.15, y: 0, z: 0 });
  put(frame, "leftKnee", { x: -0.15, y: -0.45, z: 0 });
  put(frame, "rightKnee", { x: 0.15, y: -0.45, z: 0 });
  put(frame, "leftAnkle", { x: -0.15, y: -0.9, z: 0 });
  put(frame, "rightAnkle", { x: 0.15, y: -0.9, z: 0 });
  return frame;
}

function repFrom(
  frames: KinematicFrame[],
  overrides: Partial<KinematicRep> = {},
) {
  return {
    angleIndex: 1,
    repIndex: 1,
    frames,
    timing: { totalMs: 2000, toTurnaroundMs: 1200 },
    ...overrides,
  } satisfies KinematicRep;
}

describe("jointAngle", () => {
  test("measures a straight limb as 180 degrees", () => {
    expect(jointAngle(legFrame(0), "knee", "left")).toBeCloseTo(180, 6);
  });

  test.each([30, 45, 60, 90, 120])(
    "recovers a constructed %i degree bend",
    (bend) => {
      // The shin is rotated `bend` from straight, so the interior knee angle is
      // its supplement.
      expect(jointAngle(legFrame(bend), "knee", "left")).toBeCloseTo(
        180 - bend,
        4,
      );
    },
  );

  test("measures each side independently", () => {
    const frame = legFrame(60, "left");
    const right = legFrame(20, "right");
    for (const name of ["rightHip", "rightKnee", "rightAnkle"] as const) {
      frame.worldLandmarks[LANDMARK[name]] =
        right.worldLandmarks[LANDMARK[name]];
    }
    expect(jointAngle(frame, "knee", "left")).toBeCloseTo(120, 4);
    expect(jointAngle(frame, "knee", "right")).toBeCloseTo(160, 4);
  });

  test("reports unknown rather than guessing when a landmark is untracked", () => {
    const frame = legFrame(45);
    frame.worldLandmarks[LANDMARK.leftKnee] = {
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.1,
    };
    expect(jointAngle(frame, "knee", "left")).toBeNull();
  });

  test("is unchanged by where the body sits in space", () => {
    const frame = legFrame(75);
    const shifted: KinematicFrame = {
      worldLandmarks: frame.worldLandmarks.map((p) => ({
        ...p,
        x: p.x + 3,
        y: p.y - 2,
        z: p.z + 1,
      })),
    };
    expect(jointAngle(shifted, "knee", "left")).toBeCloseTo(
      jointAngle(frame, "knee", "left")!,
      6,
    );
  });
});

describe("segmentFromVertical", () => {
  test("calls an upright torso zero", () => {
    expect(segmentFromVertical(uprightFrame(), "torso", "left")).toBeCloseTo(
      0,
      4,
    );
  });

  test.each([15, 30, 45])("recovers a %i degree lean", (lean) => {
    const frame = uprightFrame();
    const radians = (lean * Math.PI) / 180;
    // Pitch both shoulders forward about the hips.
    put(frame, "leftShoulder", {
      x: -0.2,
      y: 0.5 * Math.cos(radians),
      z: 0.5 * Math.sin(radians),
    });
    put(frame, "rightShoulder", {
      x: 0.2,
      y: 0.5 * Math.cos(radians),
      z: 0.5 * Math.sin(radians),
    });
    expect(segmentFromVertical(frame, "torso", "left")).toBeCloseTo(lean, 4);
  });

  // Shoulders are wider than hips, so a one-sided torso reads several degrees
  // of lean on a lifter who is perfectly upright.
  test("measures the trunk down the midline, not one side", () => {
    expect(segmentFromVertical(uprightFrame(), "torso", "left")).toBeCloseTo(
      segmentFromVertical(uprightFrame(), "torso", "right")!,
      6,
    );
  });

  test("treats leaning forward and back alike", () => {
    const forward = uprightFrame();
    put(forward, "leftShoulder", { x: -0.2, y: 0.4, z: 0.3 });
    put(forward, "rightShoulder", { x: 0.2, y: 0.4, z: 0.3 });
    const back = uprightFrame();
    put(back, "leftShoulder", { x: -0.2, y: 0.4, z: -0.3 });
    put(back, "rightShoulder", { x: 0.2, y: 0.4, z: -0.3 });
    expect(segmentFromVertical(forward, "torso", "left")).toBeCloseTo(
      segmentFromVertical(back, "torso", "left")!,
      6,
    );
  });
});

describe("alignmentOffset", () => {
  test("is zero when the joint sits on the line", () => {
    const offset = alignmentOffset(
      uprightFrame(),
      "leftKnee",
      "leftAnkle",
      "leftHip",
      "frontal",
    );
    expect(offset).toBeCloseTo(0, 6);
  });

  test("measures a knee falling inwards, with a sign", () => {
    const frame = uprightFrame();
    // Left knee 5cm towards the midline.
    put(frame, "leftKnee", { x: -0.1, y: -0.45, z: 0 });
    const offset = alignmentOffset(
      frame,
      "leftKnee",
      "leftAnkle",
      "leftHip",
      "frontal",
    )!;
    expect(Math.abs(offset)).toBeCloseTo(0.05, 4);

    const outward = uprightFrame();
    put(outward, "leftKnee", { x: -0.2, y: -0.45, z: 0 });
    const other = alignmentOffset(
      outward,
      "leftKnee",
      "leftAnkle",
      "leftHip",
      "frontal",
    )!;
    // Falling in and flaring out must not look the same.
    expect(Math.sign(offset)).not.toBe(Math.sign(other));
  });

  test("ignores movement outside the chosen plane", () => {
    const frame = uprightFrame();
    // Knee travels forward, which the frontal plane should not see.
    put(frame, "leftKnee", { x: -0.15, y: -0.45, z: 0.12 });
    expect(
      alignmentOffset(frame, "leftKnee", "leftAnkle", "leftHip", "frontal"),
    ).toBeCloseTo(0, 6);
    expect(
      Math.abs(
        alignmentOffset(frame, "leftKnee", "leftAnkle", "leftHip", "sagittal")!,
      ),
    ).toBeCloseTo(0.12, 4);
  });
});

describe("phases", () => {
  /** A rep that travels away from the start pose and comes back. */
  function descentRep(peakAt: number, length = 9) {
    const frames = Array.from({ length }, (_, i) => {
      const distance =
        1 - Math.abs(i - peakAt) / Math.max(peakAt, length - peakAt);
      const frame = emptyFrame();
      put(frame, "leftHip", { x: 0, y: -distance, z: 0 });
      put(frame, "leftKnee", { x: 0, y: -0.45 - distance, z: 0 });
      return frame;
    });
    return frames;
  }

  test("finds the turnaround at the point furthest from the start", () => {
    expect(turnaroundIndex(descentRep(4))).toBe(4);
    expect(turnaroundIndex(descentRep(6))).toBe(6);
  });

  test("orders the named phases through the rep", () => {
    const frames = descentRep(4);
    expect(phaseIndex(frames, "start")).toBe(0);
    expect(phaseIndex(frames, "mid_out")).toBe(2);
    expect(phaseIndex(frames, "turnaround")).toBe(4);
    expect(phaseIndex(frames, "mid_back")).toBe(6);
    expect(phaseIndex(frames, "end")).toBe(8);
  });

  test("does not fall over on an empty rep", () => {
    expect(phaseIndex([], "turnaround")).toBe(0);
    expect(turnaroundIndex([])).toBe(0);
  });
});

describe("aggregates", () => {
  const rep = repFrom([legFrame(0), legFrame(45), legFrame(90), legFrame(20)]);

  test("reports the range a joint moved through", () => {
    const extent = rangeOfMotion(rep, "knee", "left")!;
    expect(extent.max).toBeCloseTo(180, 4);
    expect(extent.min).toBeCloseTo(90, 4);
    expect(extent.travel).toBeCloseTo(90, 4);
  });

  test("compares left against right at a chosen phase", () => {
    const frames = rep.frames.map((frame, i) => {
      const merged: KinematicFrame = {
        worldLandmarks: [...frame.worldLandmarks],
      };
      const right = legFrame([0, 30, 60, 10][i], "right");
      for (const name of ["rightHip", "rightKnee", "rightAnkle"] as const) {
        merged.worldLandmarks[LANDMARK[name]] =
          right.worldLandmarks[LANDMARK[name]];
      }
      return merged;
    });
    const reading = symmetry(repFrom(frames), "knee", "turnaround");
    expect(reading.left).toBeCloseTo(90, 3);
    expect(reading.right).toBeCloseTo(120, 3);
    expect(reading.difference).toBeCloseTo(30, 3);
  });

  test("splits tempo either side of the turnaround", () => {
    expect(tempo(rep)).toEqual({
      totalMs: 2000,
      towardsTurnaroundMs: 1200,
      returnMs: 800,
    });
  });

  test("never reports a negative return time", () => {
    const odd = repFrom(rep.frames, {
      timing: { totalMs: 1000, toTurnaroundMs: 4000 },
    });
    expect(tempo(odd).returnMs).toBe(0);
  });

  // How far the lift went is the reading that survives a bad camera angle, so
  // it has to be right: a ratio against the lifter's own standing distance.
  test("measures how far two landmarks closed together", () => {
    const shallow = travel(
      repFrom([legFrame(0), legFrame(30), legFrame(0)]),
      "leftHip",
      "leftAnkle",
    )!;
    const deep = travel(
      repFrom([legFrame(0), legFrame(120), legFrame(0)]),
      "leftHip",
      "leftAnkle",
    )!;

    expect(shallow.startMetres).toBeCloseTo(0.9, 3);
    // Both close towards the hip, and the deeper rep closes considerably more.
    expect(shallow.changeFraction).toBeLessThan(0);
    expect(deep.changeFraction).toBeLessThan(shallow.changeFraction);
  });

  test("reports no travel rather than zero when a landmark was lost", () => {
    expect(
      travel(repFrom([emptyFrame(), emptyFrame()]), "leftHip", "leftAnkle"),
    ).toBeNull();
  });

  test("summarises spread across reps", () => {
    const spread = consistency([100, 104, 96, null])!;
    expect(spread.mean).toBeCloseTo(100, 6);
    expect(spread.min).toBe(96);
    expect(spread.max).toBe(104);
    expect(spread.samples).toBe(3);
    expect(spread.standardDeviation).toBeGreaterThan(0);
  });

  test("says nothing rather than zero when there is no data", () => {
    expect(consistency([null, null])).toBeNull();
    expect(rangeOfMotion(repFrom([emptyFrame()]), "knee", "left")).toBeNull();
  });
});

describe("capture helpers", () => {
  const capture: FormCoachCapture = {
    slug: "squat",
    exerciseName: "Barbell Squat",
    repCount: 3,
    angles: [
      {
        index: 1,
        view: "side",
        repCount: 2,
        trackingRate: 1,
        durationMs: 4000,
      },
      {
        index: 2,
        view: "front",
        repCount: 1,
        trackingRate: 0.9,
        durationMs: 3000,
      },
    ],
    reps: [
      repFrom([legFrame(0)], { angleIndex: 1, repIndex: 1 }),
      repFrom([legFrame(45)], { angleIndex: 1, repIndex: 2 }),
      repFrom([legFrame(90)], { angleIndex: 2, repIndex: 1 }),
    ],
  };

  // Knee tracking is only visible from the front; torso lean only from the side.
  test("selects the reps a given view could actually see", () => {
    expect(repsFromViews(capture, ["front"]).map((r) => r.angleIndex)).toEqual([
      2,
    ]);
    expect(repsFromViews(capture, ["side"]).map((r) => r.angleIndex)).toEqual([
      1, 1,
    ]);
    expect(repsFromViews(capture, ["back"])).toEqual([]);
  });

  test("averages tempo across reps without averaging the reps themselves", () => {
    const pace = meanTempo(capture.reps);
    expect(pace.totalMs).toBe(2000);
    expect(pace.towardsTurnaroundMs).toBe(1200);
    expect(pace.returnMs).toBe(800);
  });
});

describe("body lines", () => {
  /** Rotates a point about the body's vertical axis by `radians`. */
  function twist(frame: KinematicFrame, names: string[], radians: number) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    for (const name of names) {
      const p = frame.worldLandmarks[LANDMARK[name as LandmarkName]];
      const x = p.x * cos - p.z * sin;
      const z = p.x * sin + p.z * cos;
      p.x = x;
      p.z = z;
    }
  }

  test("reports a level lifter as level", () => {
    expect(bodyLineTilt(uprightFrame(), "shoulder")).toBeCloseTo(0, 5);
    expect(bodyLineTilt(uprightFrame(), "hip")).toBeCloseTo(0, 5);
    expect(trunkRotation(uprightFrame())).toBeCloseTo(0, 5);
  });

  test("signs a tilt positive when the right side is higher", () => {
    const frame = uprightFrame();
    // Right shoulder raised, left dropped by the same amount, so the line tips
    // without the midpoint moving.
    frame.worldLandmarks[LANDMARK.rightShoulder].y += 0.2;
    frame.worldLandmarks[LANDMARK.leftShoulder].y -= 0.2;

    const tilt = bodyLineTilt(frame, "shoulder");
    expect(tilt).not.toBeNull();
    expect(tilt!).toBeGreaterThan(0);
    // Half-width 0.2, rise 0.2 either side: atan(0.4/0.4) = 45 degrees.
    expect(tilt!).toBeCloseTo(45, 0);
  });

  test("measures shoulders turned against the hips", () => {
    const frame = uprightFrame();
    twist(frame, ["leftShoulder", "rightShoulder"], Math.PI / 6);

    const rotation = trunkRotation(frame);
    expect(rotation).not.toBeNull();
    expect(Math.abs(rotation!)).toBeCloseTo(30, 0);
  });

  test("does not read a forward lean as rotation", () => {
    // The whole trunk pitches forward; shoulders and hips stay square to each
    // other, which is exactly what projecting onto the transverse plane is for.
    const frame = uprightFrame();
    for (const name of ["leftShoulder", "rightShoulder"] as const) {
      const p = frame.worldLandmarks[LANDMARK[name]];
      p.z += 0.3;
      p.y -= 0.1;
    }

    expect(trunkRotation(frame)).toBeCloseTo(0, 5);
  });

  test("is unknown when a landmark was not tracked", () => {
    const frame = uprightFrame();
    frame.worldLandmarks[LANDMARK.leftShoulder].visibility = 0;

    expect(bodyLineTilt(frame, "shoulder")).toBeNull();
    expect(trunkRotation(frame)).toBeNull();
  });
});
