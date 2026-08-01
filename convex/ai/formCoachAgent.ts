import { v } from "convex/values";
import { tool, type ToolSet } from "ai";
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
  type AgentToolCall,
} from "./provider";
import { renderSystemPrompt } from "./prompts.generated";
import { consumeAiUsageOrThrow } from "./usage";
import { matchFormCoachExercise } from "./formCoach";
import { claimRateLimit } from "../lib/rateLimits";
import {
  APP_UPDATE_REQUIRED,
  attachUpload,
  requireReadyUpload,
} from "../lib/uploads";
import {
  JOINTS,
  PHASES,
  PLANES,
  SEGMENTS,
  alignmentOffset,
  canonicalRep,
  consistency,
  jointAngle,
  phaseIndex,
  rangeOfMotion,
  repsFromViews,
  segmentFromVertical,
  symmetry,
  tempo,
  LANDMARK,
  type FormCoachCapture,
  type JointName,
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
const MAX_OUTPUT_TOKENS = 1600;

const JOINT_NAMES = Object.keys(JOINTS) as [JointName, ...JointName[]];
const SEGMENT_NAMES = Object.keys(SEGMENTS) as [SegmentName, ...SegmentName[]];
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
  if (!views || views.length === 0) return [canonicalRep(capture)];
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
    "Only use angles filmed from these views. Omit to use every rep averaged together.",
  );

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
          return { unavailable: "no angle matched that view" };
        const values = reps.map((rep) => {
          const frame = rep.frames[phaseIndex(rep.frames, phase)];
          return frame ? jointAngle(frame, joint, side) : null;
        });
        const spread = consistency(values);
        return {
          joint,
          side,
          phase,
          degrees: round(spread?.mean ?? null),
          acrossReps: spread
            ? { min: round(spread.min), max: round(spread.max) }
            : null,
          reps: values.length,
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
          return { unavailable: "no angle matched that view" };
        const values = reps.map((rep) => {
          const frame = rep.frames[phaseIndex(rep.frames, phase)];
          return frame ? segmentFromVertical(frame, segment, side) : null;
        });
        const spread = consistency(values);
        return {
          segment,
          side,
          phase,
          degreesFromVertical: round(spread?.mean ?? null),
          reps: values.length,
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
          return { unavailable: "no angle matched that view" };
        const values = reps.map((rep) => {
          const frame = rep.frames[phaseIndex(rep.frames, phase)];
          return frame
            ? alignmentOffset(
                frame,
                subject as never,
                lineFrom as never,
                lineTo as never,
                plane,
              )
            : null;
        });
        const spread = consistency(values);
        return {
          subject,
          plane,
          phase,
          metres: round(spread?.mean ?? null, 3),
          note: "positive is towards the lifter's right (frontal) or front (sagittal)",
          reps: values.length,
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
          return { unavailable: "no angle matched that view" };
        const readings = reps.map((rep) => symmetry(rep, joint, phase));
        const spread = consistency(readings.map((r) => r.difference));
        return {
          joint,
          phase,
          left: round(consistency(readings.map((r) => r.left))?.mean ?? null),
          right: round(consistency(readings.map((r) => r.right))?.mean ?? null),
          rightMinusLeftDegrees: round(spread?.mean ?? null),
          reps: readings.length,
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
          return { unavailable: "no angle matched that view" };
        const extents = reps
          .map((rep) => rangeOfMotion(rep, joint, side))
          .filter(
            (extent): extent is NonNullable<typeof extent> => extent !== null,
          );
        if (extents.length === 0)
          return { unavailable: "joint was not tracked" };
        return {
          joint,
          side,
          minDegrees: round(Math.min(...extents.map((e) => e.min))),
          maxDegrees: round(Math.max(...extents.map((e) => e.max))),
          travelDegrees: round(
            extents.reduce((total, e) => total + e.travel, 0) / extents.length,
          ),
          reps: extents.length,
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
          return { unavailable: "no angle matched that view" };
        const readings = reps.map(tempo);
        return {
          reps: readings.length,
          totalMs: Math.round(
            readings.reduce((total, r) => total + r.totalMs, 0) /
              readings.length,
          ),
          towardsTurnaroundMs: Math.round(
            readings.reduce((total, r) => total + r.towardsTurnaroundMs, 0) /
              readings.length,
          ),
          returnMs: Math.round(
            readings.reduce((total, r) => total + r.returnMs, 0) /
              readings.length,
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
        })),
        totalReps: capture.repCount,
      }),
    }),
  };
}

/** The short brief the model gets before it decides what to measure. */
export function buildDigest(capture: FormCoachCapture) {
  const canonical = canonicalRep(capture);
  const at = (phase: Phase) => {
    const frame = canonical.frames[phaseIndex(canonical.frames, phase)];
    if (!frame) return {};
    return {
      kneeLeft: round(jointAngle(frame, "knee", "left")),
      kneeRight: round(jointAngle(frame, "knee", "right")),
      hipLeft: round(jointAngle(frame, "hip", "left")),
      hipRight: round(jointAngle(frame, "hip", "right")),
      torsoFromVertical: round(segmentFromVertical(frame, "torso", "left")),
    };
  };

  return {
    exercise: capture.exerciseName,
    slug: capture.slug,
    reps: capture.repCount,
    angles: capture.angles.map((angle) => ({
      index: angle.index,
      view: angle.view,
      trackingRate: round(angle.trackingRate, 2),
      reps: angle.repCount,
    })),
    tempo: tempo(canonical),
    // A coarse orientation so the model can tell at a glance what kind of
    // movement this was, without spending a tool call to find out.
    overview: { start: at("start"), turnaround: at("turnaround") },
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
  /**
   * Joint angles the lifter should have reached. The app rotates their own
   * skeleton to match, so the advice becomes something they can look at rather
   * than a sentence about degrees.
   */
  corrections: z.array(
    z.object({
      joint: z.enum(["knee", "hip", "ankle", "elbow", "shoulder"]),
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
  if (
    !capture ||
    !Array.isArray(capture.reps) ||
    capture.reps.length === 0 ||
    capture.reps.length > 200 ||
    !Number.isInteger(capture.repCount) ||
    capture.repCount < 1 ||
    capture.repCount > 200
  ) {
    throw new Error("Movement capture exceeds the 200-rep limit");
  }
  if (
    !Array.isArray(capture.angles) ||
    capture.angles.length > 8 ||
    angles.length > 8
  ) {
    throw new Error("Movement capture exceeds the 8-angle limit");
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
    /** The canonical rep, kept with the report so a pinned card can render it. */
    pose: v.optional(v.array(poseFrameValidator)),
  },
  handler: async (ctx, args): Promise<{ reportId: string; report: Report }> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (!hasOpenAiApiKey()) throw new Error("Form analysis is not configured");
    if (args.landmarksStorageId !== undefined || !args.landmarksUploadId) {
      throw new Error(APP_UPDATE_REQUIRED);
    }

    if (!matchFormCoachExercise(args.exerciseName)) {
      throw new Error(
        `${args.exerciseName} is not supported by the form coach`,
      );
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
    await consumeAiUsageOrThrow(ctx, user._id, "form_coach");

    const result = await runOpenAiAgent({
      system: renderSystemPrompt("form_coach"),
      user: JSON.stringify(buildDigest(capture)),
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
