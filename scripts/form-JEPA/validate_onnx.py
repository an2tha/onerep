"""
Checks the exported ONNX models on real footage, outside the app.

Two things are being verified, and they are easy to confuse:

1. That int8 quantization did not wreck the lift. The fp32 export is the
   reference; int8 is what ships. The number that matters is the per-joint
   disagreement between them, in millimetres of a ~1.7 m body.
2. That the arithmetic in `apps/mobile/src/lib/motionbert.ts` is right. The
   letterbox, the COCO->H36M remap, `cropScale` and `metricScale` below are
   deliberate line-by-line mirrors of that TypeScript. If they were wrong there,
   they are wrong here too — but here the output can be inspected, which in the
   WebView it cannot.

Usage:
    uv run validate_onnx.py --video "dataset/squat/squat_10.mp4"
"""

import argparse
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

HERE = Path(__file__).parent

INPUT_SIZE = 640
ANCHORS = 8400
PERSON_SCORE_ROW = 4
FIRST_KEYPOINT_ROW = 5
MIN_PERSON_SCORE = 0.25
COCO_KEYPOINTS = 17
H36M_JOINTS = 17
MAX_CLIP_LEN = 243
SAMPLE_FPS = 10
ASSUMED_TORSO_M = 0.5

# Indices into the H36M skeleton, matching `H36M` in `pose-joints.ts`.
HIP, R_HIP, R_KNEE, R_ANKLE, L_HIP, L_KNEE, L_ANKLE = 0, 1, 2, 3, 4, 5, 6
SPINE, THORAX, NOSE, HEAD = 7, 8, 9, 10
L_SHOULDER, L_ELBOW, L_WRIST, R_SHOULDER, R_ELBOW, R_WRIST = 11, 12, 13, 14, 15, 16

# COCO order as YOLO emits it.
C_NOSE, C_L_EYE, C_R_EYE, C_L_EAR, C_R_EAR = 0, 1, 2, 3, 4
C_L_SHOULDER, C_R_SHOULDER, C_L_ELBOW, C_R_ELBOW, C_L_WRIST, C_R_WRIST = 5, 6, 7, 8, 9, 10
C_L_HIP, C_R_HIP, C_L_KNEE, C_R_KNEE, C_L_ANKLE, C_R_ANKLE = 11, 12, 13, 14, 15, 16


def letterbox(frame: np.ndarray, size: int) -> tuple[np.ndarray, float, int, int]:
    """Mirrors `letterbox` in yolo-pose.ts."""
    height, width = frame.shape[:2]
    scale = min(size / width, size / height)
    draw_w, draw_h = round(width * scale), round(height * scale)
    pad_x, pad_y = (size - draw_w) // 2, (size - draw_h) // 2

    canvas = np.full((size, size, 3), 114, dtype=np.uint8)
    resized = cv2.resize(frame, (draw_w, draw_h), interpolation=cv2.INTER_LINEAR)
    canvas[pad_y : pad_y + draw_h, pad_x : pad_x + draw_w] = resized

    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return rgb.transpose(2, 0, 1)[None], scale, pad_x, pad_y


def best_person(output: np.ndarray, scale: float, pad_x: int, pad_y: int):
    """Mirrors `bestPerson` in yolo-pose.ts."""
    flat = output.reshape(output.shape[1], -1)
    scores = flat[PERSON_SCORE_ROW]
    anchor = int(np.argmax(scores))
    if scores[anchor] < MIN_PERSON_SCORE:
        return None

    keypoints = np.zeros((COCO_KEYPOINTS, 3), dtype=np.float32)
    for joint in range(COCO_KEYPOINTS):
        row = FIRST_KEYPOINT_ROW + joint * 3
        keypoints[joint] = [
            (flat[row][anchor] - pad_x) / scale,
            (flat[row + 1][anchor] - pad_y) / scale,
            flat[row + 2][anchor],
        ]
    return keypoints


def coco_to_h36m(kp: np.ndarray) -> np.ndarray:
    """Mirrors `cocoToH36m` in pose-joints.ts."""

    def mid(a, b):
        return np.array(
            [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, min(a[2], b[2])], dtype=np.float32
        )

    hip = mid(kp[C_L_HIP], kp[C_R_HIP])
    thorax = mid(kp[C_L_SHOULDER], kp[C_R_SHOULDER])

    out = np.zeros((H36M_JOINTS, 3), dtype=np.float32)
    out[HIP] = hip
    out[R_HIP], out[R_KNEE], out[R_ANKLE] = kp[C_R_HIP], kp[C_R_KNEE], kp[C_R_ANKLE]
    out[L_HIP], out[L_KNEE], out[L_ANKLE] = kp[C_L_HIP], kp[C_L_KNEE], kp[C_L_ANKLE]
    out[SPINE] = mid(thorax, hip)
    out[THORAX] = thorax
    out[NOSE] = kp[C_NOSE]
    out[HEAD] = mid(kp[C_L_EAR], kp[C_R_EAR])
    out[L_SHOULDER], out[L_ELBOW], out[L_WRIST] = kp[C_L_SHOULDER], kp[C_L_ELBOW], kp[C_L_WRIST]
    out[R_SHOULDER], out[R_ELBOW], out[R_WRIST] = kp[C_R_SHOULDER], kp[C_R_ELBOW], kp[C_R_WRIST]
    return out


def crop_scale(track: np.ndarray) -> np.ndarray | None:
    """Mirrors `cropScale` in motionbert.ts, itself a port of the reference."""
    valid = track[track[..., 2] > 0][:, :2]
    if len(valid) < 4:
        return None

    xmin, ymin = valid.min(axis=0)
    xmax, ymax = valid.max(axis=0)
    scale = max(xmax - xmin, ymax - ymin)
    if scale == 0:
        return None

    xs = (xmin + xmax - scale) / 2
    ys = (ymin + ymax - scale) / 2

    out = track.copy()
    out[..., 0] = ((track[..., 0] - xs) / scale - 0.5) * 2
    out[..., 1] = ((track[..., 1] - ys) / scale - 0.5) * 2
    return np.clip(out, -1, 1).astype(np.float32)


def lift(session: ort.InferenceSession, normalized: np.ndarray) -> np.ndarray:
    """Mirrors `lift` in motionbert.ts: consecutive non-overlapping windows."""
    name = session.get_inputs()[0].name
    chunks = []
    for start in range(0, len(normalized), MAX_CLIP_LEN):
        window = normalized[start : start + MAX_CLIP_LEN][None]
        chunks.append(session.run(None, {name: window})[0][0])
    return np.concatenate(chunks, axis=0)


def metric_scale(lifted: np.ndarray) -> float:
    """Mirrors `metricScale` in motionbert.ts."""
    lengths = np.linalg.norm(lifted[:, THORAX] - lifted[:, HIP], axis=-1)
    lengths = lengths[lengths > 0]
    if len(lengths) == 0:
        return 0.0
    return float(ASSUMED_TORSO_M / np.median(lengths))


def detect_track(video: Path, detector: ort.InferenceSession):
    """Every sampled frame's COCO keypoints, at the app's sample rate."""
    capture = cv2.VideoCapture(str(video))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(fps / SAMPLE_FPS))
    name = detector.get_inputs()[0].name

    track, index, missed = [], 0, 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if index % step == 0:
            size = detector.get_inputs()[0].shape[2]
            blob, scale, pad_x, pad_y = letterbox(frame, size)
            output = detector.run(None, {name: blob})[0]
            person = best_person(output, scale, pad_x, pad_y)
            if person is None:
                missed += 1
                person = np.zeros((COCO_KEYPOINTS, 3), dtype=np.float32)
            track.append(coco_to_h36m(person))
        index += 1
    capture.release()
    return np.array(track, dtype=np.float32), missed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--models", type=Path, default=HERE / "onnx")
    parser.add_argument(
        "--detector-sizes",
        type=int,
        nargs="+",
        default=[320, 448, 640],
        help="Compared against the last, which is treated as the reference.",
    )
    opts = parser.parse_args()

    lifter = ort.InferenceSession(str(opts.models / "motionbert_lite_int8.onnx"))

    poses = {}
    for size in opts.detector_sizes:
        detector = ort.InferenceSession(
            str(opts.models / f"yolo11n_pose_{size}_fp32.onnx")
        )
        track, missed = detect_track(opts.video, detector)
        normalized = crop_scale(track)
        if normalized is None:
            raise SystemExit(f"@{size}: nothing tracked well enough to lift")

        lifted = lift(lifter, normalized)
        scale = metric_scale(lifted)
        poses[size] = lifted * scale
        thigh = np.linalg.norm(
            poses[size][:, L_KNEE] - poses[size][:, L_HIP], axis=-1
        ).mean()
        hip_to_ankle = np.linalg.norm(
            poses[size][:, L_ANKLE] - poses[size][:, HIP], axis=-1
        )
        print(
            f"@{size:<4} {len(track):3d} frames, {missed} missed"
            f"  thigh {thigh:.3f} m"
            f"  hip->ankle swing {hip_to_ankle.max() - hip_to_ankle.min():.3f} m"
        )

    # The largest input is the reference: it is what the model was validated at,
    # and the question is only what dropping below it costs.
    reference_size = opts.detector_sizes[-1]
    reference = poses[reference_size] - poses[reference_size][:, HIP : HIP + 1]

    print(f"\nagainst @{reference_size}, per-joint 3D disagreement")
    for size in opts.detector_sizes[:-1]:
        if len(poses[size]) != len(reference):
            print(f"@{size:<4} frame counts differ, not comparable")
            continue
        error = np.linalg.norm(
            reference - (poses[size] - poses[size][:, HIP : HIP + 1]), axis=-1
        )
        print(
            f"@{size:<4} mean {error.mean() * 1000:5.1f} mm"
            f"   p95 {np.percentile(error, 95) * 1000:5.1f} mm"
            f"   max {error.max() * 1000:6.1f} mm"
        )


if __name__ == "__main__":
    main()
