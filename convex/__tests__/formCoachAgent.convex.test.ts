import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";
import {
  EXERCISE_REFERENCE_INSTRUCTION_CAP,
  buildDigest,
  buildExerciseReference,
  buildFormCoachTools,
  buildPointCloud,
  isSaneReferenceMatch,
} from "../ai/formCoachAgent";
import {
  LANDMARK,
  type FormCoachCapture,
  type KinematicFrame,
  type KinematicRep,
} from "../ai/formCoachKinematics";

const modules = import.meta.glob("../**/*.ts");

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
    expect(digest.byPhase.start.kneeLeft.mean).toBeCloseTo(180, 0);
    expect(digest.byPhase.turnaround.kneeLeft.mean).toBeCloseTo(90, 0);
  });

  // The mean alone is what the averaged rep used to give, and it is the reading
  // a breakdown mid-set hides behind.
  test("carries the spread across reps, not just the mean", () => {
    const digest = buildDigest(capture);
    const knee = digest.byPhase.turnaround.kneeLeft;
    expect(knee.reps).toBe(3);
    expect(knee.min).toBeCloseTo(80, 0);
    expect(knee.max).toBeCloseTo(100, 0);
    expect(knee.perRep).toHaveLength(3);
  });

  test("answers how far the lift travelled without a tool call", () => {
    const digest = buildDigest(capture);
    expect(digest.travelAtTurnaround?.signal).toBe("hip_to_ankle");
    // Hip to ankle closes as the lifter descends, so this is negative.
    expect(digest.travelAtTurnaround?.mean).toBeLessThan(0);
  });

  test("stays small enough to be worth sending up front", () => {
    // Generous by design: five phases of both sides beats the tool calls it
    // replaces. Still a fraction of what shipping the reps themselves would be.
    expect(JSON.stringify(buildDigest(capture)).length).toBeLessThan(6000);
  });
});

// The reference is the catalog's word on how the movement should be done. It
// rides in the digest, so these cover its shape, its size, and — because a
// wrong reference misleads worse than a missing one — when it stays away.
describe("exerciseReference", () => {
  const catalogRow = {
    name: "Barbell Squat",
    category: "strength",
    level: "beginner",
    mechanic: "compound",
    force: "push",
    equipment: "barbell",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes", "hamstrings"],
    instructions: ["Set the bar on your traps.", "Squat down.", "Stand up."],
  };

  test("carries the catalog fields the coach can plan from", () => {
    const reference = buildExerciseReference(catalogRow);
    expect(reference).toEqual({
      name: "Barbell Squat",
      category: "strength",
      level: "beginner",
      mechanic: "compound",
      force: "push",
      equipment: "barbell",
      primaryMuscles: ["quadriceps"],
      secondaryMuscles: ["glutes", "hamstrings"],
      instructions: "Set the bar on your traps. Squat down. Stand up.",
    });
  });

  test("fields a custom exercise does not have arrive as null", () => {
    const reference = buildExerciseReference({
      name: "Yoke Carry",
      category: "strength",
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
    });
    expect(reference.level).toBeNull();
    expect(reference.mechanic).toBeNull();
    expect(reference.force).toBeNull();
    expect(reference.equipment).toBeNull();
  });

  test("truncates long instructions at a step boundary, under the cap", () => {
    const step = "Keep the bar over the middle of the foot. ".repeat(9).trim(); // ~385 chars
    const steps = Array.from({ length: 8 }, () => step);
    const reference = buildExerciseReference({
      ...catalogRow,
      instructions: steps,
    });
    expect(reference.instructions.length).toBeLessThanOrEqual(
      EXERCISE_REFERENCE_INSTRUCTION_CAP,
    );
    // Whole steps only: what survives is an exact prefix-join of the input.
    expect(reference.instructions).toBe([step, step, step, step].join(" "));
  });

  test("a single oversized step is sliced rather than dropped to nothing", () => {
    const reference = buildExerciseReference({
      ...catalogRow,
      instructions: ["x".repeat(EXERCISE_REFERENCE_INSTRUCTION_CAP + 500)],
    });
    expect(reference.instructions).toHaveLength(
      EXERCISE_REFERENCE_INSTRUCTION_CAP,
    );
  });

  test("rides in the digest when resolved, and is null when it is not", () => {
    const reference = buildExerciseReference(catalogRow);
    expect(buildDigest(capture, reference).exerciseReference?.name).toBe(
      "Barbell Squat",
    );
    expect(buildDigest(capture).exerciseReference).toBeNull();
  });

  test("accepts a hit only when the names or the movement genuinely agree", () => {
    // Containment after normalisation.
    expect(isSaneReferenceMatch("Barbell Squat", "squat", "squat")).toBe(true);
    // Same named movement, different phrasing.
    expect(
      isSaneReferenceMatch("Barbell Full Squat", "Front Squat", "squat"),
    ).toBe(true);
    // A search hit that shares a word but not a movement.
    expect(isSaneReferenceMatch("Barbell Curl", "Barbell Squat", "squat")).toBe(
      false,
    );
    // `general` matches everything, so agreeing on it proves nothing.
    expect(isSaneReferenceMatch("Cable Fly", "Zercher Carry", "general")).toBe(
      false,
    );
    expect(isSaneReferenceMatch("", "Squat", "squat")).toBe(false);
  });
});

describe("resolveExerciseReference", () => {
  const seed = {
    userId: "__global__",
    exerciseId: "Barbell_Squat",
    name: "Barbell Squat",
    category: "strength",
    level: "beginner",
    mechanic: "compound",
    force: "push",
    equipment: "barbell",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    instructions: ["Set the bar on your traps.", "Squat down.", "Stand up."],
  };

  function harness() {
    const t = convexTest(schema, modules);
    return t;
  }

  test("finds the catalog row by the exerciseId the client sends", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await ctx.db.insert("exercises", seed);
    });
    const reference = await t.query(
      internal.ai.formCoachAgent.resolveExerciseReference,
      {
        userId: "user_1",
        exerciseId: "Barbell_Squat",
        exerciseName: "Barbell Squat",
        slug: "squat",
      },
    );
    expect(reference?.name).toBe("Barbell Squat");
    expect(reference?.instructions).toContain("Squat down.");
  });

  test("falls back to a name search when the id is not in the catalog", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await ctx.db.insert("exercises", seed);
    });
    const reference = await t.query(
      internal.ai.formCoachAgent.resolveExerciseReference,
      {
        userId: "user_1",
        exerciseId: "legacy-uuid-1234",
        exerciseName: "Barbell Squat",
        slug: "squat",
      },
    );
    expect(reference?.name).toBe("Barbell Squat");
  });

  test("returns nothing rather than a wrong reference on a weak hit", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await ctx.db.insert("exercises", {
        ...seed,
        exerciseId: "Barbell_Curl",
        name: "Barbell Curl",
      });
    });
    const reference = await t.query(
      internal.ai.formCoachAgent.resolveExerciseReference,
      {
        userId: "user_1",
        exerciseId: "unknown-id",
        exerciseName: "Barbell Squat",
        slug: "squat",
      },
    );
    expect(reference).toBeNull();
  });

  test("reads a custom exercise, but only for its owner", async () => {
    const t = harness();
    const docId = await t.run(async (ctx) =>
      ctx.db.insert("customExercises", {
        userId: "user_1",
        name: "Yoke Carry",
        category: "strength",
        primaryMuscles: ["traps"],
        secondaryMuscles: [],
        instructions: ["Stand under the yoke.", "Walk."],
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const owned = await t.query(
      internal.ai.formCoachAgent.resolveExerciseReference,
      {
        userId: "user_1",
        exerciseId: `custom:${docId}`,
        exerciseName: "Yoke Carry",
        slug: "general",
      },
    );
    expect(owned?.name).toBe("Yoke Carry");
    const foreign = await t.query(
      internal.ai.formCoachAgent.resolveExerciseReference,
      {
        userId: "user_2",
        exerciseId: `custom:${docId}`,
        exerciseName: "Yoke Carry",
        slug: "general",
      },
    );
    expect(foreign).toBeNull();
  });
});

// Rep detection failing is a normal outcome, not a broken capture: a hold, a
// set of partials or patchy tracking all produce zero reps from good footage.
describe("a capture with no detected reps", () => {
  const repless: FormCoachCapture = {
    ...capture,
    repCount: 0,
    reps: [],
    angles: [{ ...capture.angles[0], repCount: 0, repSignal: null }],
    timeline: [
      { angleIndex: 1, timeMs: 0, worldLandmarks: frame(0).worldLandmarks },
    ],
  };

  test("still builds a digest, and says why it is thin", () => {
    const digest = buildDigest(repless);
    expect(digest.reps).toBe(0);
    expect(digest.travelAtTurnaround).toBeNull();
    expect(digest.warnings.join(" ")).toContain("no rep was detected");
  });

  test("still carries the point cloud", () => {
    expect(buildPointCloud(repless)!.samples).toHaveLength(1);
  });

  // "No angle matched that view" would send it hunting for a view that exists.
  test("tells the model no rep was found rather than blaming the view", async () => {
    const result = await call(
      buildFormCoachTools(repless).measure_joint_angle,
      {
        joint: "knee",
        side: "left",
        phase: "turnaround",
      },
    );
    expect(result.unavailable).toContain("no rep was detected");
  });
});

// The checklist is read standing over the bar before the next set, so it is a
// distinct field rather than the findings reformatted.
describe("the report schema", () => {
  test("requires a checklist", () => {
    const prompt = readFileSync(
      new URL("../ai/prompts/form_coach.yaml", import.meta.url),
      "utf8",
    );
    expect(prompt).toContain("CHECKLIST");
    expect(prompt).toContain("Never return an\n  empty checklist");
  });
});

describe("buildPointCloud", () => {
  const timeline = [
    {
      angleIndex: 1,
      timeMs: 0,
      worldLandmarks: frame(0).worldLandmarks,
    },
    {
      angleIndex: 2,
      timeMs: 1000,
      worldLandmarks: frame(90).worldLandmarks,
    },
  ];

  test("is absent rather than empty when the client sent no timeline", () => {
    expect(buildPointCloud(capture)).toBeNull();
  });

  test("lines every sample up against one joint header", () => {
    const cloud = buildPointCloud({ ...capture, timeline })!;
    expect(cloud.joints).toContain("leftKnee");
    expect(cloud.samples).toHaveLength(2);
    for (const sample of cloud.samples) {
      expect(sample.xyz).toHaveLength(cloud.joints.length);
    }
    expect(cloud.samples.map((s) => s.angle)).toEqual([1, 2]);
  });

  // The raw arrays hold an untracked joint at the origin, which reads as a limb
  // folded into the lifter's hips rather than as an absence.
  test("reports an untracked joint as null, never as the origin", () => {
    const blind = frame(0);
    blind.worldLandmarks[LANDMARK.leftKnee] = {
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.1,
    };
    const cloud = buildPointCloud({
      ...capture,
      timeline: [
        { angleIndex: 1, timeMs: 0, worldLandmarks: blind.worldLandmarks },
      ],
    })!;
    const kneeAt = cloud.joints.indexOf("leftKnee");
    expect(cloud.samples[0].xyz[kneeAt]).toBeNull();
    expect(
      cloud.samples[0].xyz[cloud.joints.indexOf("leftHip")],
    ).not.toBeNull();
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
    expect(result.mean).toBeCloseTo(90, 0);
    expect(result.reps).toBe(3);
  });

  test("restricts a measurement to the views that could see it", async () => {
    const frontOnly = await call(tools.measure_joint_angle, {
      joint: "knee",
      side: "left",
      phase: "turnaround",
      views: ["front"],
    });
    // The front angle's rep only reaches an 80 degree bend.
    expect(frontOnly.mean).toBeCloseTo(100, 0);
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
    expect(result.mean).toBeUndefined();
  });

  test("measures alignment in a chosen plane, with direction", async () => {
    const shifted: FormCoachCapture = {
      ...capture,
      reps: [
        {
          angleIndex: 1,
          repIndex: 1,
          frames: [frame(0, 0.06), frame(90, 0.06)],
          timing: { totalMs: 2000, toTurnaroundMs: 1100 },
        },
      ],
    };
    const result = await call(buildFormCoachTools(shifted).measure_alignment, {
      subject: "leftKnee",
      lineFrom: "leftAnkle",
      lineTo: "leftHip",
      plane: "frontal",
      phase: "start",
    });
    expect(Math.abs(result.mean as number)).toBeCloseTo(0.06, 2);
  });

  test("reports range of motion across the rep", async () => {
    const result = await call(tools.get_range_of_motion, {
      joint: "knee",
      side: "left",
    });
    expect(result.mostExtendedDegrees).toBeCloseTo(180, 0);
    expect(result.mostFlexedDegrees).toBeCloseTo(80, 0);
  });

  test("splits tempo either side of the turnaround", async () => {
    const result = await call(tools.get_tempo, {});
    expect((result.totalMs as { mean: number }).mean).toBe(2000);
    expect((result.towardsTurnaroundMs as { mean: number }).mean).toBe(1100);
    expect((result.returnMs as { mean: number }).mean).toBe(900);
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
              line: "shoulder",
              side: "left",
              phase: "turnaround",
            };
      const result = await call(definition, input);
      expect(JSON.stringify(result).length).toBeLessThan(600);
    }
  });
});
