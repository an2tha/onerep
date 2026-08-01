import { describe, expect, test } from "vitest";
import { buildDigest, buildFormCoachTools } from "../ai/formCoachAgent";
import {
  LANDMARK,
  type FormCoachCapture,
  type KinematicFrame,
  type KinematicRep,
} from "../ai/formCoachKinematics";

const LANDMARK_COUNT = 33;

function frame(bendDegrees: number, kneeOffsetX = 0): KinematicFrame {
  const points = Array.from({ length: LANDMARK_COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));
  const set = (index: number, x: number, y: number, z: number) => {
    points[index] = { x, y, z, visibility: 1 };
  };
  const radians = (bendDegrees * Math.PI) / 180;
  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? -1 : 1;
    set(LANDMARK[`${side}Shoulder`], sign * 0.2, 0.5, 0);
    set(LANDMARK[`${side}Hip`], sign * 0.15, 0, 0);
    set(LANDMARK[`${side}Knee`], sign * 0.15 + kneeOffsetX, -0.45, 0);
    set(
      LANDMARK[`${side}Ankle`],
      sign * 0.15,
      -0.45 - 0.45 * Math.cos(radians),
      0.45 * Math.sin(radians),
    );
  }
  return { worldLandmarks: points };
}

function rep(bends: number[], overrides: Partial<KinematicRep> = {}) {
  return {
    angleIndex: 1,
    repIndex: 1,
    frames: bends.map((bend) => frame(bend)),
    timing: { totalMs: 2000, toTurnaroundMs: 1100 },
    ...overrides,
  } satisfies KinematicRep;
}

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
      repSignal: "hip_to_ankle",
    },
    // Deliberately without a repSignal: captures recorded before the detector
    // went beyond squats still have to read.
    {
      index: 2,
      view: "front",
      repCount: 1,
      trackingRate: 0.8,
      durationMs: 2000,
    },
  ],
  reps: [
    rep([0, 50, 100, 40], { angleIndex: 1, repIndex: 1 }),
    rep([0, 45, 90, 30], { angleIndex: 1, repIndex: 2 }),
    rep([0, 40, 80, 20], { angleIndex: 2, repIndex: 1 }),
  ],
  canonical: [frame(0), frame(45), frame(90), frame(30)],
};

/** Tools are declared with an optional `execute`; every one of ours has it. */
async function call(tool: unknown, input: unknown) {
  const runnable = tool as {
    execute: (input: unknown, options: unknown) => Promise<unknown>;
  };
  return (await runnable.execute(input, {})) as Record<string, unknown>;
}

describe("buildDigest", () => {
  test("orients the model without spending a tool call", () => {
    const digest = buildDigest(capture);
    expect(digest.exercise).toBe("Barbell Squat");
    expect(digest.reps).toBe(3);
    expect(digest.angles.map((a) => a.view)).toEqual(["side", "front"]);
    expect(digest.overview.start.kneeLeft).toBeCloseTo(180, 0);
    expect(digest.overview.turnaround.kneeLeft).toBeCloseTo(90, 0);
  });

  test("stays small enough to be worth sending up front", () => {
    // The whole point of tools is that the prompt does not carry everything.
    expect(JSON.stringify(buildDigest(capture)).length).toBeLessThan(1200);
  });
});

describe("form coach tools", () => {
  const tools = buildFormCoachTools(capture);

  test("advertises what can be measured, including the views available", async () => {
    const result = await call(tools.list_available_measurements, {});
    expect(result.joints).toContain("knee");
    expect(result.segments).toContain("torso");
    expect(result.anglesAvailable).toHaveLength(2);
  });

  test("measures a joint angle at a named phase", async () => {
    const result = await call(tools.measure_joint_angle, {
      joint: "knee",
      side: "left",
      phase: "turnaround",
    });
    expect(result.degrees).toBeCloseTo(90, 0);
  });

  test("restricts a measurement to the views that could see it", async () => {
    const frontOnly = await call(tools.measure_joint_angle, {
      joint: "knee",
      side: "left",
      phase: "turnaround",
      views: ["front"],
    });
    // The front angle's rep only reaches an 80 degree bend.
    expect(frontOnly.degrees).toBeCloseTo(100, 0);
    expect(frontOnly.reps).toBe(1);
  });

  test("says so rather than inventing a number when no angle matched", async () => {
    const result = await call(tools.measure_joint_angle, {
      joint: "knee",
      side: "left",
      phase: "turnaround",
      views: ["back"],
    });
    expect(result.unavailable).toBeTruthy();
    expect(result.degrees).toBeUndefined();
  });

  test("measures alignment in a chosen plane, with direction", async () => {
    const shifted: FormCoachCapture = {
      ...capture,
      canonical: [frame(0, 0.06), frame(90, 0.06)],
    };
    const result = await call(buildFormCoachTools(shifted).measure_alignment, {
      subject: "leftKnee",
      lineFrom: "leftAnkle",
      lineTo: "leftHip",
      plane: "frontal",
      phase: "start",
    });
    expect(Math.abs(result.metres as number)).toBeCloseTo(0.06, 2);
  });

  test("reports range of motion across the rep", async () => {
    const result = await call(tools.get_range_of_motion, {
      joint: "knee",
      side: "left",
    });
    expect(result.maxDegrees).toBeCloseTo(180, 0);
    expect(result.minDegrees).toBeCloseTo(90, 0);
  });

  test("splits tempo either side of the turnaround", async () => {
    const result = await call(tools.get_tempo, {});
    expect(result.totalMs).toBe(2000);
    expect(result.towardsTurnaroundMs).toBe(1100);
    expect(result.returnMs).toBe(900);
  });

  // Averaging is exactly what hides rep-to-rep breakdown, so this tool has to
  // read the individual reps.
  test("reads individual reps when asked about consistency", async () => {
    const result = await call(tools.get_consistency, {
      joint: "knee",
      side: "left",
      phase: "turnaround",
    });
    expect(result.reps).toBe(3);
    expect(result.minDegrees).toBeCloseTo(80, 0);
    expect(result.maxDegrees).toBeCloseTo(100, 0);
    expect(result.standardDeviationDegrees).toBeGreaterThan(0);
  });

  test("exposes capture quality so view-dependent claims can be checked", async () => {
    const result = await call(tools.get_capture_quality, {});
    expect(result.totalReps).toBe(3);
    expect(result.angles).toEqual([
      {
        index: 1,
        view: "side",
        trackingRate: 1,
        reps: 2,
        durationMs: 4000,
        repSignal: "hip_to_ankle",
      },
      {
        index: 2,
        view: "front",
        trackingRate: 0.8,
        reps: 1,
        durationMs: 2000,
        repSignal: null,
      },
    ]);
  });

  test("every tool returns something small enough to be cheap", async () => {
    for (const [name, definition] of Object.entries(tools)) {
      const input =
        name === "measure_alignment"
          ? {
              subject: "leftKnee",
              lineFrom: "leftAnkle",
              lineTo: "leftHip",
              plane: "frontal",
              phase: "turnaround",
            }
          : {
              joint: "knee",
              segment: "torso",
              side: "left",
              phase: "turnaround",
            };
      const result = await call(definition, input);
      expect(JSON.stringify(result).length).toBeLessThan(600);
    }
  });
});
