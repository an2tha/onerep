import { v } from "convex/values";
// Namespace import, not `import { z }`: zod v4 exposes `z` as a
// self-referential `export * as z`, which Bun does not materialise, so the
// named form is undefined at runtime under `bun` (as in CI, where the
// oven/bun image has no node and vitest therefore runs on Bun).
import * as z from "zod";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getAuthUser } from "../lib/auth";
import {
  hasOpenAiApiKey,
  runOpenAiAgent,
  tool,
  type AgentToolCall,
  type ToolSet,
} from "./provider";
import { renderSystemPrompt } from "./prompts.generated";
import { matchFormCoachExercise } from "./formCoach";
import {
  customExerciseDocId,
  isCustomExerciseId,
} from "../lib/exerciseShape";
import { consumeAiUsageOrThrow } from "./usage";
import { claimRateLimit } from "../lib/rateLimits";
import {
  APP_UPDATE_REQUIRED,
  attachUpload,
  requireReadyUpload,
} from "../lib/uploads";
import {
  BODY_LINES,
  JOINTS,
  PHASES,
  PLANES,
  SEGMENTS,
  alignmentOffset,
  consistency,
  bodyLineTilt,
  jointAngle,
  meanTempo,
  phaseIndex,
  rangeOfMotion,
  repsFromViews,
  segmentFromVertical,
  trunkRotation,
  symmetry,
  tempo,
  travel,
  LANDMARK,
  type BodyLineName,
  type FormCoachCapture,
  type JointName,
  type KinematicFrame,
  type LandmarkName,
  type KinematicRep,
  type Phase,
  type Plane,
  type SegmentName,
  type Side,
} from "./formCoachKinematics";

/**
 * A hard ceiling on billed round-trips. The prompt asks for four to eight tool
 * calls; this stops a confused loop from running up a bill, and the final answer
 * is still produced from whatever it gathered.
 */
const MAX_AGENT_STEPS = 12;
/**
 * Covers reasoning tokens as well as the report itself, so it is not a budget
 * for the prose alone. A full report — findings with evidence, drills, a
 * checklist and corrections — ran into the old 1,600 ceiling and came back
 * truncated, which reaches the app as a failed request rather than a short one.
 */
const MAX_OUTPUT_TOKENS = 4_000;

/**
 * Frames of the footage the model is shown alongside the numbers.
 *
 * Landmarks describe a skeleton; they cannot say that the camera was hand-held,
 * that a second lifter walked through the shot, or what the bar was doing. Five
 * is enough to establish all three and few enough to stay affordable.
 */
const MAX_STILLS = 5;

/** Roughly 400 KB per still once base64-encoded. */
const MAX_STILL_BYTES = 550_000;

const JOINT_NAMES = Object.keys(JOINTS) as [JointName, ...JointName[]];
const SEGMENT_NAMES = Object.keys(SEGMENTS) as [SegmentName, ...SegmentName[]];
const BODY_LINE_NAMES = Object.keys(BODY_LINES) as [
  BodyLineName,
  ...BodyLineName[],
];
const LANDMARK_NAMES = Object.keys(LANDMARK) as [string, ...string[]];

const sideSchema = z.enum(["left", "right"]);
const phaseSchema = z.enum(PHASES as unknown as [Phase, ...Phase[]]);

function round(value: number | null, places = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Reps the agent should read for a measurement, honouring any view filter. */
function selectReps(
  capture: FormCoachCapture,
  views: readonly string[] | undefined,
): KinematicRep[] {
  if (!views || views.length === 0) return capture.reps;
  const matching = repsFromViews(
    capture,
    views as ReadonlyArray<"front" | "back" | "side" | "oblique">,
  );
  return matching.length > 0 ? matching : [];
}

const viewsField = z
  .array(z.enum(["front", "back", "side", "oblique"]))
  .optional()
  .describe(
    "Only use angles filmed from these views. Omit to read every rep in the capture.",
  );

/** How many per-rep readings a tool result lists before it is just noise. */
const MAX_PER_REP_REPORTED = 12;

/**
 * One reading per rep, reported as a spread rather than a single number.
 *
 * The mean alone is what the old averaged rep gave, and it is the least useful
 * summary available: a lifter whose third rep collapses has a perfectly
 * respectable mean. Handing over the extremes and the per-rep list lets the model
 * see the rep that went wrong and check whether it went wrong more than once.
 */
function report(values: Array<number | null>, places = 1) {
  const spread = consistency(values);
  if (!spread) return { unavailable: "not tracked in any rep" };
  return {
    mean: round(spread.mean, places),
    min: round(spread.min, places),
    max: round(spread.max, places),
    spreadAcrossReps: round(spread.standardDeviation, 2),
    reps: spread.samples,
    /** In the order the reps were performed. Null where the joint was lost. */
    perRep: values
      .slice(0, MAX_PER_REP_REPORTED)
      .map((value) => round(value, places)),
  };
}

/**
 * Why a rep-shaped measurement came back empty.
 *
 * A capture with no detected rep and a view filter that matched nothing are very
 * different situations, and telling them apart is the difference between the
 * model filming advice and the model giving up.
 */
function whyNoReps(capture: FormCoachCapture) {
  return capture.reps.length === 0
    ? "no rep was detected anywhere in this capture, so nothing rep-shaped can be measured; the point cloud and the stills are what you have"
    : "no angle matched that view";
}

/** The reading at one phase of every rep. */
function atPhase(
  reps: readonly KinematicRep[],
  phase: Phase,
  read: (frame: KinematicFrame) => number | null,
) {
  return reps.map((rep) => {
    const frame = rep.frames[phaseIndex(rep.frames, phase)];
    return frame ? read(frame) : null;
  });
}

/**
 * The measurement toolbox, as tools.
 *
 * Nothing here is exercise-specific: the same set answers a squat, a lunge or a
 * press. Which of them matter is the model's call, which is what keeps adding an
 * exercise a one-line change rather than a new rule table.
 */
export function buildFormCoachTools(capture: FormCoachCapture): ToolSet {
  return {
    list_available_measurements: tool({
      description:
        "List the joints, segments, landmarks, planes and rep phases that can be measured, plus which camera views are available in this capture.",
      inputSchema: z.object({}),
      execute: async () => ({
        joints: JOINT_NAMES,
        segments: SEGMENT_NAMES,
        bodyLines: BODY_LINE_NAMES,
        landmarks: LANDMARK_NAMES,
        planes: PLANES,
        phases: PHASES,
        anglesAvailable: capture.angles.map((angle) => ({
          index: angle.index,
          view: angle.view,
          reps: angle.repCount,
        })),
      }),
    }),

    measure_joint_angle: tool({
      description:
        "Interior angle of a joint in degrees at one phase of the rep. 180 is a straight limb.",
      inputSchema: z.object({
        joint: z.enum(JOINT_NAMES),
        side: sideSchema,
        phase: phaseSchema,
        views: viewsField,
      }),
      execute: async ({ joint, side, phase, views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0)
          return { unavailable: whyNoReps(capture) };
        return {
          joint,
          side,
          phase,
          unit: "degrees",
          ...report(
            atPhase(reps, phase, (frame) => jointAngle(frame, joint, side)),
          ),
        };
      },
    }),

    measure_segment_from_vertical: tool({
      description:
        "Angle between a body segment and vertical, in degrees. 0 is upright. Torso is measured down the midline.",
      inputSchema: z.object({
        segment: z.enum(SEGMENT_NAMES),
        side: sideSchema,
        phase: phaseSchema,
        views: viewsField,
      }),
      execute: async ({ segment, side, phase, views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0)
          return { unavailable: whyNoReps(capture) };
        return {
          segment,
          side,
          phase,
          unit: "degrees from vertical",
          ...report(
            atPhase(reps, phase, (frame) =>
              segmentFromVertical(frame, segment, side),
            ),
          ),
        };
      },
    }),

    measure_body_line_tilt: tool({
      description:
        "How far the shoulder line or the hip line is off horizontal, in degrees. 0 is level, positive means the lifter's right side is higher. Catches a lateral imbalance that interior joint angles cannot see, because both sides can bend identically while the whole frame tips.",
      inputSchema: z.object({
        line: z.enum(BODY_LINE_NAMES),
        phase: phaseSchema,
        views: viewsField,
      }),
      execute: async ({ line, phase, views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0) return { unavailable: whyNoReps(capture) };
        return {
          line,
          phase,
          unit: "degrees from horizontal, positive right side high",
          ...report(
            atPhase(reps, phase, (frame) => bodyLineTilt(frame, line)),
          ),
        };
      },
    }),

    measure_trunk_rotation: tool({
      description:
        "Rotation of the shoulders against the hips about the vertical axis, in degrees. 0 is square, positive means the shoulders are turned towards the lifter's right. This is the twist a one-sided lift induces. A forward lean does not register as rotation.",
      inputSchema: z.object({
        phase: phaseSchema,
        views: viewsField,
      }),
      execute: async ({ phase, views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0) return { unavailable: whyNoReps(capture) };
        return {
          phase,
          unit: "degrees, positive shoulders right",
          ...report(atPhase(reps, phase, (frame) => trunkRotation(frame))),
        };
      },
    }),

    measure_alignment: tool({
      description:
        "Signed distance in metres from a landmark to the line between two other landmarks, within one anatomical plane. Use the frontal plane for knee tracking, the sagittal for forward or backward drift.",
      inputSchema: z.object({
        subject: z.enum(LANDMARK_NAMES),
        lineFrom: z.enum(LANDMARK_NAMES),
        lineTo: z.enum(LANDMARK_NAMES),
        plane: z.enum(PLANES as unknown as [Plane, ...Plane[]]),
        phase: phaseSchema,
        views: viewsField,
      }),
      execute: async ({ subject, lineFrom, lineTo, plane, phase, views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0)
          return { unavailable: whyNoReps(capture) };
        return {
          subject,
          plane,
          phase,
          unit: "metres",
          note: "positive is towards the lifter's right (frontal) or front (sagittal)",
          ...report(
            atPhase(reps, phase, (frame) =>
              alignmentOffset(
                frame,
                subject as never,
                lineFrom as never,
                lineTo as never,
                plane,
              ),
            ),
            3,
          ),
        };
      },
    }),

    measure_symmetry: tool({
      description:
        "Left versus right joint angle at one phase, in degrees. Needs a front or back view to be reliable.",
      inputSchema: z.object({
        joint: z.enum(JOINT_NAMES),
        phase: phaseSchema,
        views: viewsField,
      }),
      execute: async ({ joint, phase, views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0)
          return { unavailable: whyNoReps(capture) };
        const readings = reps.map((rep) => symmetry(rep, joint, phase));
        return {
          joint,
          phase,
          unit: "degrees, right minus left",
          left: round(consistency(readings.map((r) => r.left))?.mean ?? null),
          right: round(consistency(readings.map((r) => r.right))?.mean ?? null),
          ...report(readings.map((r) => r.difference)),
        };
      },
    }),

    get_range_of_motion: tool({
      description:
        "Minimum, maximum and total travel of a joint angle across the rep, in degrees.",
      inputSchema: z.object({
        joint: z.enum(JOINT_NAMES),
        side: sideSchema,
        views: viewsField,
      }),
      execute: async ({ joint, side, views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0)
          return { unavailable: whyNoReps(capture) };
        const extents = reps.map((rep) => rangeOfMotion(rep, joint, side));
        if (extents.every((extent) => extent === null))
          return { unavailable: "joint was not tracked" };
        const present = extents.filter(
          (extent): extent is NonNullable<typeof extent> => extent !== null,
        );
        return {
          joint,
          side,
          unit: "degrees",
          mostFlexedDegrees: round(Math.min(...present.map((e) => e.min))),
          mostExtendedDegrees: round(Math.max(...present.map((e) => e.max))),
          // The per-rep travel is the part worth looking at: a set where rep one
          // moved through 90° and rep five through 40° is a set that broke down.
          travel: report(extents.map((extent) => extent?.travel ?? null)),
        };
      },
    }),

    measure_travel: tool({
      description:
        "How far two landmarks moved apart or together between the start of the rep and the turnaround, in metres and as a fraction of the standing distance. This is how far the lifter actually went: hip to ankle for a squat or hinge, wrist to shoulder for a press, curl or row, wrist to hip for a raise. Camera-independent, so it works from any view.",
      inputSchema: z.object({
        from: z.enum(LANDMARK_NAMES),
        to: z.enum(LANDMARK_NAMES),
        views: viewsField,
      }),
      execute: async ({ from, to, views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0)
          return { unavailable: whyNoReps(capture) };
        const readings = reps.map((rep) =>
          travel(rep, from as never, to as never),
        );
        if (readings.every((reading) => reading === null))
          return { unavailable: "one of those landmarks was not tracked" };
        return {
          from,
          to,
          standingMetres: round(
            consistency(readings.map((r) => r?.startMetres ?? null))?.mean ??
              null,
            3,
          ),
          turnaroundMetres: round(
            consistency(readings.map((r) => r?.turnaroundMetres ?? null))
              ?.mean ?? null,
            3,
          ),
          note: "changeFraction is negative when the landmarks closed together; -0.3 means they ended 30% closer than standing",
          changeFraction: report(
            readings.map((r) => r?.changeFraction ?? null),
            2,
          ),
        };
      },
    }),

    get_tempo: tool({
      description:
        "How long each rep took, split either side of the turnaround, in milliseconds.",
      inputSchema: z.object({ views: viewsField }),
      execute: async ({ views }) => {
        const reps = selectReps(capture, views);
        if (reps.length === 0)
          return { unavailable: whyNoReps(capture) };
        const readings = reps.map(tempo);
        return {
          reps: readings.length,
          unit: "milliseconds",
          totalMs: report(
            readings.map((r) => r.totalMs),
            0,
          ),
          towardsTurnaroundMs: report(
            readings.map((r) => r.towardsTurnaroundMs),
            0,
          ),
          returnMs: report(
            readings.map((r) => r.returnMs),
            0,
          ),
        };
      },
    }),

    get_consistency: tool({
      description:
        "How much one joint angle varied from rep to rep at a given phase. Use this to spot fatigue or a breakdown across the set.",
      inputSchema: z.object({
        joint: z.enum(JOINT_NAMES),
        side: sideSchema,
        phase: phaseSchema,
      }),
      execute: async ({ joint, side, phase }) => {
        // Deliberately per-rep rather than the averaged rep: averaging is what
        // hides the variation this question is about.
        const values = capture.reps.map((rep) => {
          const frame = rep.frames[phaseIndex(rep.frames, phase)];
          return frame ? jointAngle(frame, joint, side) : null;
        });
        const spread = consistency(values);
        if (!spread) return { unavailable: "joint was not tracked" };
        return {
          joint,
          side,
          phase,
          meanDegrees: round(spread.mean),
          minDegrees: round(spread.min),
          maxDegrees: round(spread.max),
          standardDeviationDegrees: round(spread.standardDeviation, 2),
          reps: spread.samples,
        };
      },
    }),

    get_capture_quality: tool({
      description:
        "How good the footage was: camera view, tracking rate and rep count per angle. Check this before trusting a view-dependent measurement.",
      inputSchema: z.object({}),
      execute: async () => ({
        angles: capture.angles.map((angle) => ({
          index: angle.index,
          view: angle.view,
          trackingRate: round(angle.trackingRate, 2),
          reps: angle.repCount,
          durationMs: angle.durationMs,
          repSignal: angle.repSignal ?? null,
        })),
        totalReps: capture.repCount,
      }),
    }),
  };
}

/** Samples of the point cloud the prompt will carry. */
const MAX_TIMELINE_SAMPLES = 60;

/**
 * The footage as coordinates, one sample a second.
 *
 * Everything else in the payload is derived: a rep is an interpretation, a
 * measurement is an interpretation of that. This is the positions themselves,
 * so a fault nobody thought to write a tool for is still visible, and so a
 * reading that looks wrong can be checked against the thing it came from.
 *
 * Columnar against a single `joints` header rather than repeating names on every
 * sample: the same information, roughly a third of the tokens. Untracked joints
 * are null rather than the origin, which is what the raw arrays hold and would
 * otherwise read as a limb folded into the lifter's hips.
 */
export function buildPointCloud(capture: FormCoachCapture) {
  const samples = (capture.timeline ?? []).slice(0, MAX_TIMELINE_SAMPLES);
  if (samples.length === 0) return null;

  const joints = Object.keys(LANDMARK) as LandmarkName[];
  return {
    format:
      "xyz[] is aligned to joints[]; each entry is [x, y, z] in metres, or null where that joint was not tracked",
    frame:
      "body-fixed: origin at the hip midpoint, +x towards the lifter's right, +y up their torso, +z out of their chest. Yaw is removed, so samples from different angles share one coordinate system and are directly comparable",
    sampledEvery: "1s of footage, covering the whole clip and not only the reps",
    joints,
    samples: samples.map((sample) => ({
      angle: sample.angleIndex,
      tMs: sample.timeMs,
      xyz: joints.map((joint) => {
        const value = sample.worldLandmarks[LANDMARK[joint]];
        if (!value || (value.visibility ?? 1) < 0.5) return null;
        return [round(value.x, 3), round(value.y, 3), round(value.z, 3)];
      }),
    })),
  };
}

/** The landmark pair whose distance the client counted reps in. */
const SIGNAL_LANDMARKS: Record<string, [string, string]> = {
  hip_to_ankle: ["leftHip", "leftAnkle"],
  wrist_to_shoulder: ["leftWrist", "leftShoulder"],
  wrist_to_hip: ["leftWrist", "leftHip"],
};

/** Anything about the footage that should temper what is read from it. */
function captureWarnings(capture: FormCoachCapture) {
  const warnings: string[] = [];
  const worstTracking = Math.min(
    ...capture.angles.map((angle) => angle.trackingRate),
  );
  if (capture.angles.length > 0 && worstTracking < 0.75) {
    warnings.push(
      `one angle held the lifter for only ${Math.round(worstTracking * 100)}% of its frames; tracking dropouts usually mean somebody or something else was in shot`,
    );
  }
  if (capture.repCount === 0) {
    warnings.push(
      "no rep was detected, which is a limitation of the detector and not something to report to the lifter. Every rep-shaped tool will come back empty. Read the point cloud, work out what the body was doing, and coach that",
    );
  } else if (capture.repCount === 1) {
    warnings.push("one rep only, so nothing can be checked for repeatability");
  }
  if (capture.angles.every((angle) => angle.view === "oblique")) {
    warnings.push(
      "every angle came out oblique, which is what a hand-held camera looks like; frontal-plane and sagittal-plane offsets are the readings this hurts most",
    );
  }
  return warnings;
}

// ── Exercise reference ───────────────────────────────────────────────────────

/**
 * Hard cap on the instruction prose carried into the prompt. The catalog's
 * longest entry runs past 3,000 characters, and the tail of a long entry is
 * finishing detail, not the movement.
 */
export const EXERCISE_REFERENCE_INSTRUCTION_CAP = 1_600;

/** How the catalog says the movement is performed, sized for a prompt. */
export type ExerciseReference = {
  name: string;
  category: string;
  level: string | null;
  mechanic: string | null;
  force: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** The numbered steps joined into prose, cut at a step boundary. */
  instructions: string;
};

/** The catalog fields a reference is derived from; custom rows lack some. */
type ExerciseReferenceSource = {
  name: string;
  category: string;
  level?: string;
  mechanic?: string;
  force?: string;
  equipment?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

/**
 * Joins instruction steps up to the cap, dropping whole steps rather than
 * cutting mid-sentence. A first step that is alone over the cap — nothing in
 * the catalog is, but nothing stops a custom exercise being — is sliced, since
 * an empty reference would be worse than a shortened one.
 */
function capInstructions(steps: string[]): string {
  let joined = "";
  for (const step of steps) {
    const trimmed = step.trim();
    if (!trimmed) continue;
    const next = joined ? `${joined} ${trimmed}` : trimmed;
    if (next.length > EXERCISE_REFERENCE_INSTRUCTION_CAP) break;
    joined = next;
  }
  if (!joined) {
    joined = (steps[0] ?? "").trim().slice(0, EXERCISE_REFERENCE_INSTRUCTION_CAP);
  }
  return joined;
}

export function buildExerciseReference(
  source: ExerciseReferenceSource,
): ExerciseReference {
  return {
    name: source.name,
    category: source.category,
    level: source.level ?? null,
    mechanic: source.mechanic ?? null,
    force: source.force ?? null,
    equipment: source.equipment ?? null,
    primaryMuscles: source.primaryMuscles,
    secondaryMuscles: source.secondaryMuscles,
    instructions: capInstructions(source.instructions),
  };
}

function normalizeExerciseName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether a full-text hit is close enough to hand the model as the reference.
 *
 * A wrong reference is worse than none — it would tell the coach to judge a
 * row against squat instructions — so this errs towards nothing: the names
 * must contain one another once normalised, or both must resolve to the same
 * *named* form-coach movement. The `general` fallback matches everything, so
 * agreement on it means nothing and is not accepted.
 */
export function isSaneReferenceMatch(
  candidateName: string,
  recordedName: string,
  recordedSlug: string,
): boolean {
  const candidate = normalizeExerciseName(candidateName);
  const recorded = normalizeExerciseName(recordedName);
  if (!candidate || !recorded) return false;
  if (candidate.includes(recorded) || recorded.includes(candidate)) return true;
  const matched = matchFormCoachExercise(candidateName).slug;
  return matched !== "general" && matched === recordedSlug;
}

const GLOBAL_EXERCISE_USER_ID = "__global__";

/**
 * Resolves the recorded exercise to a catalog (or custom) row and returns it
 * reference-shaped, or null when nothing matches well enough to trust.
 *
 * The client sends the catalog `exerciseId` (e.g. "Barbell_Squat") for bundled
 * exercises and a `custom:<docId>` id for the user's own, so the exact lookups
 * come first and the name search is only the fallback for ids the catalog no
 * longer carries.
 */
export const resolveExerciseReference = internalQuery({
  args: {
    userId: v.string(),
    exerciseId: v.string(),
    exerciseName: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args): Promise<ExerciseReference | null> => {
    if (isCustomExerciseId(args.exerciseId)) {
      const docId = ctx.db.normalizeId(
        "customExercises",
        customExerciseDocId(args.exerciseId),
      );
      if (!docId) return null;
      const doc = await ctx.db.get(docId);
      if (!doc || doc.userId !== args.userId) return null;
      return buildExerciseReference(doc);
    }

    const exact = await ctx.db
      .query("exercises")
      .withIndex("by_userId_and_exerciseId", (q) =>
        q
          .eq("userId", GLOBAL_EXERCISE_USER_ID)
          .eq("exerciseId", args.exerciseId),
      )
      .first();
    if (exact) return buildExerciseReference(exact);

    const searchText = args.exerciseName.trim();
    if (!searchText) return null;
    const hit = await ctx.db
      .query("exercises")
      .withSearchIndex("search_name", (q) =>
        q.search("name", searchText).eq("userId", GLOBAL_EXERCISE_USER_ID),
      )
      .first();
    if (!hit || !isSaneReferenceMatch(hit.name, args.exerciseName, args.slug)) {
      return null;
    }
    return buildExerciseReference(hit);
  },
});

/**
 * The brief the model gets before it decides what to measure.
 *
 * Deliberately generous. A tool call costs a round trip and the model only gets
 * a handful, so anything it would obviously ask for first is cheaper to hand
 * over: every joint at every phase, both sides, and the spread across reps
 * rather than one number per joint. What it cannot get here — alignment offsets,
 * arbitrary landmark pairs, per-rep breakdowns of a specific fault — is what the
 * tools are for.
 */
export function buildDigest(
  capture: FormCoachCapture,
  exerciseReference: ExerciseReference | null = null,
) {
  const reps = capture.reps;
  const spread = (read: (frame: KinematicFrame) => number | null, phase: Phase) =>
    report(atPhase(reps, phase, read));

  const at = (phase: Phase) => ({
    kneeLeft: spread((f) => jointAngle(f, "knee", "left"), phase),
    kneeRight: spread((f) => jointAngle(f, "knee", "right"), phase),
    hipLeft: spread((f) => jointAngle(f, "hip", "left"), phase),
    hipRight: spread((f) => jointAngle(f, "hip", "right"), phase),
    elbowLeft: spread((f) => jointAngle(f, "elbow", "left"), phase),
    elbowRight: spread((f) => jointAngle(f, "elbow", "right"), phase),
    shoulderLeft: spread((f) => jointAngle(f, "shoulder", "left"), phase),
    shoulderRight: spread((f) => jointAngle(f, "shoulder", "right"), phase),
    torsoFromVertical: spread(
      (f) => segmentFromVertical(f, "torso", "left"),
      phase,
    ),
  });

  // How far the lift actually travelled, in the same distance the reps were
  // counted in. For a squat this is depth; there is no reason to make the model
  // spend a call discovering the single most important number in the capture.
  const signal = capture.angles.find((angle) => angle.repSignal)?.repSignal;
  const pair = signal ? SIGNAL_LANDMARKS[signal] : undefined;
  const travelled = pair
    ? report(
        reps.map(
          (rep) =>
            travel(rep, pair[0] as never, pair[1] as never)?.changeFraction ??
            null,
        ),
        2,
      )
    : null;

  return {
    exercise: capture.exerciseName,
    slug: capture.slug,
    /**
     * How the movement is meant to be performed, from the exercise catalog.
     * Null when the recorded exercise could not be matched to a row it would
     * be safe to hand over — a wrong reference misleads worse than none.
     */
    exerciseReference,
    reps: capture.repCount,
    angles: capture.angles.map((angle) => ({
      index: angle.index,
      view: angle.view,
      trackingRate: round(angle.trackingRate, 2),
      reps: angle.repCount,
      // Says which part of the body defined the rep, which for an exercise the
      // coach knows nothing else about is the strongest hint at what it was.
      repSignal: angle.repSignal ?? null,
    })),
    stills: (capture.stills ?? []).map((still) => still.label),
    warnings: captureWarnings(capture),
    tempo: meanTempo(reps),
    travelAtTurnaround: travelled
      ? {
          signal: signal ?? null,
          note: "fraction of the standing distance; -0.3 means the pair ended 30% closer than at the start",
          ...travelled,
        }
      : null,
    /**
     * Every phase, both sides, as a spread across reps rather than a mean —
     * the mean is what hid a collapsing third rep behind two good ones.
     */
    byPhase: {
      start: at("start"),
      mid_out: at("mid_out"),
      turnaround: at("turnaround"),
      mid_back: at("mid_back"),
      end: at("end"),
    },
  };
}

// ── Persistence ──────────────────────────────────────────────────────────────

const poseFrameValidator = v.object({
  timeMs: v.number(),
  worldLandmarks: v.array(
    v.object({
      x: v.number(),
      y: v.number(),
      z: v.number(),
      visibility: v.number(),
    }),
  ),
});

const angleMetaValidator = v.object({
  index: v.number(),
  kind: v.string(),
  view: v.string(),
  repCount: v.number(),
  trackingRate: v.number(),
  durationMs: v.number(),
  /** Absent from clients built before the detector went beyond squats. */
  repSignal: v.optional(v.string()),
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    throw new Error(APP_UPDATE_REQUIRED);
  },
});

export const resolveLandmarksUpload = internalQuery({
  args: { userId: v.string(), uploadId: v.id("fileUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (
      !upload ||
      upload.userId !== args.userId ||
      upload.purpose !== "form_coach_landmarks" ||
      upload.status !== "ready" ||
      upload.expiresAt <= Date.now() ||
      !upload.storageId
    ) {
      return null;
    }
    return { storageId: upload.storageId };
  },
});

export const claimFormAnalysis = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await claimRateLimit(ctx, args.userId, "form_analysis", 5, 60 * 60 * 1000);
    return null;
  },
});

export const recordSession = internalMutation({
  args: {
    userId: v.string(),
    exerciseId: v.string(),
    exerciseName: v.string(),
    slug: v.string(),
    date: v.string(),
    landmarksUploadId: v.id("fileUploads"),
    repCount: v.number(),
    angles: v.array(angleMetaValidator),
  },
  handler: async (ctx, args) => {
    await requireReadyUpload(ctx, {
      uploadId: args.landmarksUploadId,
      userId: args.userId,
      purpose: "form_coach_landmarks",
    });
    const sessionId = await ctx.db.insert("formCoachSessions", {
      ...args,
      capturedAt: Date.now(),
    });
    await attachUpload(
      ctx,
      args.landmarksUploadId,
      args.userId,
      "form_coach_landmarks",
      "formCoachSessions",
      String(sessionId),
    );
    return sessionId;
  },
});

export const recordReport = internalMutation({
  args: {
    userId: v.string(),
    sessionId: v.id("formCoachSessions"),
    exerciseId: v.string(),
    exerciseName: v.string(),
    date: v.string(),
    summary: v.string(),
    findings: v.array(
      v.object({
        title: v.string(),
        detail: v.string(),
        severity: v.string(),
        confidence: v.string(),
        evidence: v.object({
          measurement: v.string(),
          value: v.string(),
          phase: v.optional(v.string()),
        }),
        cue: v.optional(v.string()),
      }),
    ),
    drills: v.array(v.object({ name: v.string(), reason: v.string() })),
    notMeasured: v.array(v.string()),
    checklist: v.optional(v.array(v.string())),
    pose: v.optional(v.array(poseFrameValidator)),
    corrections: v.optional(
      v.array(
        v.object({
          joint: v.string(),
          side: v.string(),
          phase: v.string(),
          targetDegrees: v.number(),
          reason: v.string(),
        }),
      ),
    ),
    toolCalls: v.array(
      v.object({ tool: v.string(), input: v.string(), output: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("formCoachReports", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getReport = query({
  args: { reportId: v.id("formCoachReports") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;
    const report = await ctx.db.get(args.reportId);
    if (!report || report.userId !== user._id) return null;
    return report;
  },
});

export const listReports = query({
  args: { exerciseId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return [];
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const rows = args.exerciseId
      ? await ctx.db
          .query("formCoachReports")
          .withIndex("by_userId_and_exerciseId", (q) =>
            q.eq("userId", user._id).eq("exerciseId", args.exerciseId!),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("formCoachReports")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(limit);
    // Projected, never whole docs: reports carry `pose` (every landmark frame)
    // and `toolCalls`, so a reactive subscription over 20 of them would ship
    // megabytes to the client. `getReport` is the hydration path.
    return rows.map((report) => {
      const findings = report.findings ?? [];
      const top = findings.find((finding) => finding.severity === "major");
      return {
        _id: report._id,
        exerciseId: report.exerciseId,
        exerciseName: report.exerciseName,
        date: report.date,
        createdAt: report.createdAt,
        summary: report.summary,
        findingCount: findings.length,
        majorCount: findings.filter((finding) => finding.severity === "major")
          .length,
        drillCount: (report.drills ?? []).length,
        hasPose: (report.pose ?? []).length > 0,
        hasCorrections: (report.corrections ?? []).length > 0,
        ...(top
          ? { topFinding: { title: top.title, severity: top.severity } }
          : {}),
      };
    });
  },
});

// ── Report shape ─────────────────────────────────────────────────────────────

/**
 * Nullable, never optional.
 *
 * Structured output runs in OpenAI's strict mode, which requires every property
 * to appear in `required` — an optional field is rejected outright with a 400.
 * A nullable field is allowed and carries the same meaning, so absent values
 * arrive as null and are dropped before storage.
 */
const reportSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      severity: z.enum(["strength", "minor", "major"]),
      confidence: z.enum(["low", "medium", "high"]),
      evidence: z.object({
        measurement: z.string(),
        value: z.string(),
        phase: z.string().nullable(),
      }),
      cue: z.string().nullable(),
    }),
  ),
  drills: z.array(z.object({ name: z.string(), reason: z.string() })),
  notMeasured: z.array(z.string()),
  /** What to hold in mind on the next set, in the order it happens. */
  checklist: z.array(z.string()),
  /**
   * Joint angles the lifter should have reached. The app rotates their own
   * skeleton to match, so the advice becomes something they can look at rather
   * than a sentence about degrees.
   */
  corrections: z.array(
    z.object({
      // Mirrors JOINTS. No ankle: there is no foot landmark to close that
      // angle, so it can be neither measured nor corrected.
      joint: z.enum(["knee", "hip", "elbow", "shoulder"]),
      side: z.enum(["left", "right", "both"]),
      phase: z.enum(PHASES as unknown as [Phase, ...Phase[]]),
      targetDegrees: z.number(),
      reason: z.string(),
    }),
  ),
});

type Report = z.infer<typeof reportSchema>;

/** Convex stores absent values as missing keys, not nulls. */
function toStoredFindings(findings: Report["findings"]) {
  return findings.map((finding) => ({
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    confidence: finding.confidence,
    evidence: {
      measurement: finding.evidence.measurement,
      value: finding.evidence.value,
      ...(finding.evidence.phase ? { phase: finding.evidence.phase } : {}),
    },
    ...(finding.cue ? { cue: finding.cue } : {}),
  }));
}

function truncate(value: unknown, limit = 600) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function toStoredToolCalls(calls: AgentToolCall[]) {
  return calls.slice(0, 24).map((call) => ({
    tool: call.tool,
    input: truncate(call.input, 300),
    output: truncate(call.output),
  }));
}

function assertCaptureLimits(
  capture: FormCoachCapture,
  angles: Array<{ index: number }>,
  pose: Array<{ worldLandmarks: unknown[] }> | undefined,
) {
  // Zero reps is allowed: a capture where the detector found nothing still
  // carries a timeline, stills and angle metadata, and why no rep was counted is
  // itself worth an answer. Only an entirely absent capture is rejected.
  if (
    !capture ||
    !Array.isArray(capture.reps) ||
    capture.reps.length > 200 ||
    !Number.isInteger(capture.repCount) ||
    capture.repCount < 0 ||
    capture.repCount > 200
  ) {
    throw new Error("Movement capture exceeds the 200-rep limit");
  }
  if (
    capture.reps.length === 0 &&
    (capture.timeline ?? []).length === 0 &&
    (capture.stills ?? []).length === 0
  ) {
    throw new Error("The recorded movement contained nothing to read");
  }
  if (
    !Array.isArray(capture.angles) ||
    capture.angles.length > 8 ||
    angles.length > 8
  ) {
    throw new Error("Movement capture exceeds the 8-angle limit");
  }

  if (capture.stills !== undefined) {
    if (!Array.isArray(capture.stills) || capture.stills.length > MAX_STILLS) {
      throw new Error(`A capture may carry at most ${MAX_STILLS} stills`);
    }
    for (const still of capture.stills) {
      if (
        !still ||
        typeof still.dataUrl !== "string" ||
        !still.dataUrl.startsWith("data:image/") ||
        still.dataUrl.length > MAX_STILL_BYTES
      ) {
        throw new Error("A capture still is not a usable image");
      }
    }
  }

  if (capture.timeline !== undefined) {
    if (
      !Array.isArray(capture.timeline) ||
      capture.timeline.length > MAX_TIMELINE_SAMPLES
    ) {
      throw new Error(
        `A capture timeline may hold at most ${MAX_TIMELINE_SAMPLES} samples`,
      );
    }
    for (const sample of capture.timeline) {
      if (
        !sample ||
        !Array.isArray(sample.worldLandmarks) ||
        sample.worldLandmarks.length > 33
      ) {
        throw new Error("Timeline samples may contain at most 33 landmarks");
      }
    }
  }

  const frames = [
    ...(Array.isArray(capture.canonical) ? capture.canonical : []),
    ...capture.reps.flatMap((rep) =>
      Array.isArray(rep.frames) ? rep.frames : [],
    ),
  ];
  if (frames.length > 1_200 || (pose?.length ?? 0) > 1_200) {
    throw new Error("Movement capture exceeds the 1,200-frame limit");
  }
  for (const frame of frames) {
    if (
      !frame ||
      !Array.isArray(frame.worldLandmarks) ||
      frame.worldLandmarks.length > 33
    ) {
      throw new Error("Movement frames may contain at most 33 landmarks");
    }
  }
  for (const frame of pose ?? []) {
    if (frame.worldLandmarks.length > 33) {
      throw new Error("Movement frames may contain at most 33 landmarks");
    }
  }
}

// ── The action ───────────────────────────────────────────────────────────────

export const analyse = action({
  args: {
    exerciseId: v.string(),
    exerciseName: v.string(),
    slug: v.string(),
    date: v.string(),
    landmarksStorageId: v.optional(v.id("_storage")),
    landmarksUploadId: v.optional(v.id("fileUploads")),
    angles: v.array(angleMetaValidator),
    /** The rep to show, kept with the report so a pinned card can render it. */
    pose: v.optional(v.array(poseFrameValidator)),
  },
  handler: async (ctx, args): Promise<{ reportId: string; report: Report }> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const userKey: string | null = await ctx.runQuery(
      internal.ai.byok.getKeyForUser,
      { userId: user._id },
    );
    if (!hasOpenAiApiKey(userKey)) {
      throw new Error("Form analysis is not configured");
    }
    if (args.landmarksStorageId !== undefined || !args.landmarksUploadId) {
      throw new Error(APP_UPDATE_REQUIRED);
    }

    const resolved: { storageId: Id<"_storage"> } | null = await ctx.runQuery(
      internal.ai.formCoachAgent.resolveLandmarksUpload,
      { userId: user._id, uploadId: args.landmarksUploadId },
    );
    if (!resolved) throw new Error("Upload not found or access denied");
    const blob = await ctx.storage.get(resolved.storageId);
    if (!blob) throw new Error("The recorded movement could not be read");
    let capture: FormCoachCapture;
    try {
      capture = JSON.parse(await blob.text()) as FormCoachCapture;
    } catch {
      throw new Error("The movement capture is not valid JSON");
    }
    assertCaptureLimits(capture, args.angles, args.pose);

    await ctx.runMutation(internal.ai.formCoachAgent.claimFormAnalysis, {
      userId: user._id,
    });

    // One app-level credit covers the whole tool loop, matching how the photo
    // snap action counts one credit for its two provider calls.
    const quota = await consumeAiUsageOrThrow(ctx, user._id, "form_coach");

    // How the catalog says this movement is performed. Best effort: a capture
    // of an exercise the catalog has never heard of is still analysed, just
    // without the reference, exactly as every capture was before it existed.
    let exerciseReference: ExerciseReference | null = null;
    try {
      exerciseReference = await ctx.runQuery(
        internal.ai.formCoachAgent.resolveExerciseReference,
        {
          userId: user._id,
          exerciseId: args.exerciseId,
          exerciseName: args.exerciseName,
          slug: args.slug,
        },
      );
    } catch {
      // A missing reference is a thinner prompt, not a failed analysis.
    }

    const result = await runOpenAiAgent({
      apiKey: quota.apiKey,
      system: renderSystemPrompt("form_coach"),
      user: JSON.stringify({
        digest: buildDigest(capture, exerciseReference),
        pointCloud: buildPointCloud(capture),
      }),
      // Ordered as the digest lists them, so "the second image" means something.
      images: (capture.stills ?? [])
        .slice(0, MAX_STILLS)
        .map((still) => ({ url: still.dataUrl, detail: "low" as const })),
      tools: buildFormCoachTools(capture),
      schema: reportSchema,
      maxSteps: MAX_AGENT_STEPS,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    const report = result.output;

    const sessionId = await ctx.runMutation(
      internal.ai.formCoachAgent.recordSession,
      {
        userId: user._id,
        exerciseId: args.exerciseId,
        exerciseName: args.exerciseName,
        slug: args.slug,
        date: args.date,
        landmarksUploadId: args.landmarksUploadId,
        repCount: capture.repCount,
        angles: args.angles,
      },
    );

    const reportId: string = await ctx.runMutation(
      internal.ai.formCoachAgent.recordReport,
      {
        userId: user._id,
        sessionId,
        exerciseId: args.exerciseId,
        exerciseName: args.exerciseName,
        date: args.date,
        summary: report.summary,
        findings: toStoredFindings(report.findings),
        drills: report.drills,
        notMeasured: report.notMeasured,
        checklist: report.checklist,
        pose: args.pose,
        corrections: report.corrections,
        toolCalls: toStoredToolCalls(result.toolCalls),
      },
    );

    // Returned as well as stored: the app renders it straight into the coach
    // conversation, so making it re-fetch what it just produced is wasteful.
    return { reportId, report };
  },
});

// ── Pinning ──────────────────────────────────────────────────────────────────

const SURFACES = ["workouts", "progress"] as const;

export const pinReport = mutation({
  args: {
    reportId: v.id("formCoachReports"),
    surface: v.union(v.literal("workouts"), v.literal("progress")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const report = await ctx.db.get(args.reportId);
    if (!report || report.userId !== user._id) {
      throw new Error("That report is not available");
    }

    // Pinning twice to the same surface should be a no-op rather than a
    // duplicate card.
    const existing = await ctx.db
      .query("formCoachPins")
      .withIndex("by_userId_and_report", (q) =>
        q.eq("userId", user._id).eq("reportId", args.reportId),
      )
      .collect();
    const already = existing.find((pin) => pin.surface === args.surface);
    if (already) return already._id;

    return await ctx.db.insert("formCoachPins", {
      userId: user._id,
      reportId: args.reportId,
      surface: args.surface,
      createdAt: Date.now(),
    });
  },
});

export const unpinReport = mutation({
  args: { pinId: v.id("formCoachPins") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const pin = await ctx.db.get(args.pinId);
    if (!pin || pin.userId !== user._id) return;
    await ctx.db.delete(args.pinId);
  },
});

export const listPinned = query({
  args: { surface: v.union(v.literal("workouts"), v.literal("progress")) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return [];

    const pins = await ctx.db
      .query("formCoachPins")
      .withIndex("by_userId_and_surface", (q) =>
        q.eq("userId", user._id).eq("surface", args.surface),
      )
      .order("desc")
      .take(6);

    const cards = await Promise.all(
      pins.map(async (pin) => {
        const report = await ctx.db.get(pin.reportId);
        if (!report) return null;
        return {
          pinId: pin._id,
          reportId: pin.reportId,
          exerciseName: report.exerciseName,
          date: report.date,
          summary: report.summary,
          pose: report.pose ?? [],
          corrections: report.corrections ?? [],
          findings: report.findings,
          drills: report.drills,
          notMeasured: report.notMeasured,
          checklist: report.checklist ?? [],
        };
      }),
    );

    // A report deleted out from under its pin should simply not appear.
    return cards.filter(
      (card): card is NonNullable<typeof card> => card !== null,
    );
  },
});

export const isPinned = query({
  args: { reportId: v.id("formCoachReports") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return [];
    const pins = await ctx.db
      .query("formCoachPins")
      .withIndex("by_userId_and_report", (q) =>
        q.eq("userId", user._id).eq("reportId", args.reportId),
      )
      .collect();
    return pins
      .map((pin) => pin.surface)
      .filter((s) => SURFACES.includes(s as never));
  },
});
