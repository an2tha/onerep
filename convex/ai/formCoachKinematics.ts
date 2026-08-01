/**
 * Geometry over canonical reps. Deliberately knows nothing about any exercise.
 *
 * Everything here answers a question of the form "what is this angle" or "how far
 * is this joint off that line". Nothing names a correct value, a threshold, or a
 * movement, so the same functions serve a squat, a lunge and an overhead press.
 * Judging what the numbers mean is the model's job — see `formCoachAgent.ts`.
 *
 * Input is already body-framed (camera-independent) and phase-normalised by
 * `fuseReps` on the client, so no rep detection or basis-building happens here.
 */

export type Vec3 = { x: number; y: number; z: number; visibility?: number };

/** One phase-normalised frame: 0 = start of the rep, last = back to the start. */
export type KinematicFrame = { worldLandmarks: Vec3[] };

export type KinematicRep = {
  angleIndex: number;
  repIndex: number;
  frames: KinematicFrame[];
  timing: { totalMs: number; toTurnaroundMs: number };
};

export type CameraView = "front" | "back" | "side" | "oblique";

export type KinematicAngle = {
  index: number;
  view: CameraView;
  repCount: number;
  trackingRate: number;
  durationMs: number;
  /**
   * The body distance the client counted reps in — "hip_to_ankle",
   * "wrist_to_shoulder" or "wrist_to_hip". Absent from older captures.
   */
  repSignal?: string;
};

/** The whole capture, as it arrives from the client. */
export type FormCoachCapture = {
  slug: string;
  exerciseName: string;
  repCount: number;
  angles: KinematicAngle[];
  /** Every rep from every angle, each on the same phase grid. */
  reps: KinematicRep[];
  /** All reps averaged into one. */
  canonical: KinematicFrame[];
};

// ── Landmarks ────────────────────────────────────────────────────────────────

export const LANDMARK = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

export type LandmarkName = keyof typeof LANDMARK;

/** Landmarks below this are the model guessing, and are reported as unknown. */
const MIN_VISIBILITY = 0.5;

// ── Vector helpers ───────────────────────────────────────────────────────────

const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const scale = (a: Vec3, k: number): Vec3 => ({
  x: a.x * k,
  y: a.y * k,
  z: a.z * k,
});
const degrees = (radians: number) => (radians * 180) / Math.PI;

function point(frame: KinematicFrame, name: LandmarkName): Vec3 | null {
  const value = frame.worldLandmarks[LANDMARK[name]];
  if (!value) return null;
  if ((value.visibility ?? 1) < MIN_VISIBILITY) return null;
  return value;
}

// ── Phases ───────────────────────────────────────────────────────────────────

/**
 * Named moments in a rep.
 *
 * `turnaround` is the frame furthest from the starting pose, which is the bottom
 * of a squat, the lockout of a press, and the stretch of a curl — defined by
 * movement rather than by naming any particular exercise.
 */
export const PHASES = [
  "start",
  "mid_out",
  "turnaround",
  "mid_back",
  "end",
] as const;

export type Phase = (typeof PHASES)[number];

/** Mean distance every tracked landmark has travelled from the first frame. */
function displacementFromStart(frames: KinematicFrame[], index: number) {
  const first = frames[0];
  const current = frames[index];
  if (!first || !current) return 0;
  let total = 0;
  let counted = 0;
  for (let i = 0; i < current.worldLandmarks.length; i += 1) {
    const a = first.worldLandmarks[i];
    const b = current.worldLandmarks[i];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < MIN_VISIBILITY) continue;
    if ((b.visibility ?? 1) < MIN_VISIBILITY) continue;
    total += norm(sub(b, a));
    counted += 1;
  }
  return counted === 0 ? 0 : total / counted;
}

export function turnaroundIndex(frames: KinematicFrame[]) {
  let best = 0;
  let bestValue = -1;
  for (let i = 0; i < frames.length; i += 1) {
    const value = displacementFromStart(frames, i);
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

export function phaseIndex(frames: KinematicFrame[], phase: Phase) {
  if (frames.length === 0) return 0;
  const last = frames.length - 1;
  const turn = turnaroundIndex(frames);
  switch (phase) {
    case "start":
      return 0;
    case "end":
      return last;
    case "turnaround":
      return turn;
    case "mid_out":
      return Math.round(turn / 2);
    case "mid_back":
      return Math.round((turn + last) / 2);
  }
}

// ── Joints ───────────────────────────────────────────────────────────────────

/**
 * Joints as three landmarks, the middle one being the vertex. The angle is the
 * interior angle at that vertex: 180° is a straight limb.
 */
export const JOINTS = {
  knee: ["Hip", "Knee", "Ankle"],
  hip: ["Shoulder", "Hip", "Knee"],
  ankle: ["Knee", "Ankle", "Foot"],
  elbow: ["Shoulder", "Elbow", "Wrist"],
  shoulder: ["Hip", "Shoulder", "Elbow"],
} as const satisfies Record<string, readonly [string, string, string]>;

export type JointName = keyof typeof JOINTS;
export type Side = "left" | "right";

function sided(side: Side, suffix: string) {
  return (side + suffix) as LandmarkName;
}

/** Interior angle in degrees, or null when a landmark was not tracked. */
export function jointAngle(
  frame: KinematicFrame,
  joint: JointName,
  side: Side,
): number | null {
  const [a, b, c] = JOINTS[joint];
  const first = point(frame, sided(side, a));
  const vertex = point(frame, sided(side, b));
  const last = point(frame, sided(side, c));
  if (!first || !vertex || !last) return null;

  const u = sub(first, vertex);
  const v = sub(last, vertex);
  const lengths = norm(u) * norm(v);
  if (lengths < 1e-9) return null;
  // Clamped because floating point can push a straight limb just past 1.
  return degrees(Math.acos(Math.min(1, Math.max(-1, dot(u, v) / lengths))));
}

// ── Segments ─────────────────────────────────────────────────────────────────

/** Body segments as a landmark pair, ordered distal-to-proximal along the body. */
export const SEGMENTS = {
  torso: ["Hip", "Shoulder"],
  femur: ["Hip", "Knee"],
  shin: ["Knee", "Ankle"],
  upper_arm: ["Shoulder", "Elbow"],
  forearm: ["Elbow", "Wrist"],
  foot: ["Heel", "Foot"],
} as const satisfies Record<string, readonly [string, string]>;

export type SegmentName = keyof typeof SEGMENTS;

/**
 * Segments measured down the body's midline rather than one side.
 *
 * The trunk is the case that matters: shoulders are wider than hips, so a torso
 * taken from the left hip to the left shoulder is tilted by several degrees on a
 * perfectly upright lifter. Averaging both sides removes that bias, which would
 * otherwise contaminate every torso-lean reading.
 */
const MIDLINE_SEGMENTS = new Set<SegmentName>(["torso"]);

function segmentPoint(
  frame: KinematicFrame,
  segment: SegmentName,
  suffix: string,
  side: Side,
): Vec3 | null {
  if (!MIDLINE_SEGMENTS.has(segment)) return point(frame, sided(side, suffix));
  const left = point(frame, sided("left", suffix));
  const right = point(frame, sided("right", suffix));
  if (!left || !right) return left ?? right;
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: (left.z + right.z) / 2,
  };
}

/**
 * Angle between a segment and vertical, in degrees. 0 is upright.
 *
 * Vertical means the body frame's own +y, which `toBodyFrame` derived from the
 * lifter's torso — not gravity. On a level floor with a level camera these agree
 * closely enough for coaching, and it degrades gracefully when the camera is
 * tilted, which gravity-from-pixels would not.
 */
export function segmentFromVertical(
  frame: KinematicFrame,
  segment: SegmentName,
  side: Side,
): number | null {
  const [from, to] = SEGMENTS[segment];
  const start = segmentPoint(frame, segment, from, side);
  const end = segmentPoint(frame, segment, to, side);
  if (!start || !end) return null;

  const axis = sub(end, start);
  const length = norm(axis);
  if (length < 1e-9) return null;
  return degrees(
    Math.acos(Math.min(1, Math.max(-1, Math.abs(axis.y) / length))),
  );
}

// ── Alignment ────────────────────────────────────────────────────────────────

export const PLANES = ["frontal", "sagittal", "transverse"] as const;
export type Plane = (typeof PLANES)[number];

/**
 * Signed distance, in metres, from `subject` to the line `from`→`to`, measured
 * within one anatomical plane.
 *
 * One generic shape covering knee valgus (knee against the ankle-to-hip line in
 * the frontal plane), hip shift, and bar-path drift. Positive is towards the
 * lifter's right in the frontal plane, and towards their front in the sagittal.
 */
export function alignmentOffset(
  frame: KinematicFrame,
  subject: LandmarkName,
  from: LandmarkName,
  to: LandmarkName,
  plane: Plane,
): number | null {
  const p = point(frame, subject);
  const a = point(frame, from);
  const b = point(frame, to);
  if (!p || !a || !b) return null;

  // Body frame: x runs left-to-right, y up, z out of the chest.
  const flatten = (v: Vec3): Vec3 =>
    plane === "frontal"
      ? { x: v.x, y: v.y, z: 0 }
      : plane === "sagittal"
        ? { x: 0, y: v.y, z: v.z }
        : { x: v.x, y: 0, z: v.z };

  const axis = flatten(sub(b, a));
  const length = norm(axis);
  if (length < 1e-9) return null;

  const relative = flatten(sub(p, a));
  const along = dot(relative, axis) / (length * length);
  const perpendicular = sub(relative, scale(axis, along));
  const distance = norm(perpendicular);

  // Sign it along the plane's own lateral axis so the caller learns direction,
  // not just magnitude.
  const lateral = plane === "sagittal" ? perpendicular.z : perpendicular.x;
  return lateral < 0 ? -distance : distance;
}

// ── Aggregates over a rep ────────────────────────────────────────────────────

export type Extent = { min: number; max: number; travel: number };

export function rangeOfMotion(
  rep: KinematicRep,
  joint: JointName,
  side: Side,
): Extent | null {
  const values = rep.frames
    .map((frame) => jointAngle(frame, joint, side))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, travel: max - min };
}

export type SymmetryReading = {
  left: number | null;
  right: number | null;
  /** Right minus left, in degrees. Positive means the right side is more open. */
  difference: number | null;
};

export function symmetry(
  rep: KinematicRep,
  joint: JointName,
  phase: Phase,
): SymmetryReading {
  const frame = rep.frames[phaseIndex(rep.frames, phase)];
  if (!frame) return { left: null, right: null, difference: null };
  const left = jointAngle(frame, joint, "left");
  const right = jointAngle(frame, joint, "right");
  return {
    left,
    right,
    difference: left === null || right === null ? null : right - left,
  };
}

export type Tempo = {
  totalMs: number;
  /** Start to the furthest point from the starting pose. */
  towardsTurnaroundMs: number;
  /** Turnaround back to the start. */
  returnMs: number;
};

export function tempo(rep: KinematicRep): Tempo {
  const total = Math.max(rep.timing.totalMs, 0);
  const out = Math.min(Math.max(rep.timing.toTurnaroundMs, 0), total);
  return {
    totalMs: total,
    towardsTurnaroundMs: out,
    returnMs: total - out,
  };
}

export type Spread = {
  mean: number;
  min: number;
  max: number;
  /** Population standard deviation, in the metric's own units. */
  standardDeviation: number;
  samples: number;
};

/** Spread of one scalar reading across reps — how repeatable the movement was. */
export function consistency(values: Array<number | null>): Spread | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  const mean =
    present.reduce((total, value) => total + value, 0) / present.length;
  const variance =
    present.reduce((total, value) => total + (value - mean) ** 2, 0) /
    present.length;
  return {
    mean,
    min: Math.min(...present),
    max: Math.max(...present),
    standardDeviation: Math.sqrt(variance),
    samples: present.length,
  };
}

// ── Capture-level helpers ────────────────────────────────────────────────────

/** Reps that came from angles the given views could actually see. */
export function repsFromViews(
  capture: FormCoachCapture,
  views: readonly CameraView[],
) {
  const indices = new Set(
    capture.angles
      .filter((angle) => views.includes(angle.view))
      .map((angle) => angle.index),
  );
  return capture.reps.filter((rep) => indices.has(rep.angleIndex));
}

/** The averaged rep, wrapped so it can be passed anywhere a rep is expected. */
export function canonicalRep(capture: FormCoachCapture): KinematicRep {
  const totals = capture.reps.map((rep) => rep.timing.totalMs);
  const outs = capture.reps.map((rep) => rep.timing.toTurnaroundMs);
  const mean = (values: number[]) =>
    values.length === 0
      ? 0
      : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return {
    angleIndex: 0,
    repIndex: 0,
    frames: capture.canonical,
    timing: { totalMs: mean(totals), toTurnaroundMs: mean(outs) },
  };
}
