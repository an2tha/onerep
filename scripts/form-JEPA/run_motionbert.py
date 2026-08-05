"""Run MotionBERT-Lite 3D pose reconstruction over the workout video dataset.

Two stages per video:
  1. 2D keypoints  -- YOLO pose (COCO-17) with tracking, one subject per clip.
  2. 3D lifting    -- MotionBERT DSTformer (lite) + h36m 3D pose head, applied over
                      overlapping temporal windows so the output is a continuous
                      per-frame reconstruction of the whole clip.

Output: one JSON per video, mirroring the dataset's class directories.

    uv run run_motionbert.py --dataset dataset --out outputs/pose3d
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "MotionBERT"))

from lib.model.DSTformer import DSTformer  # noqa: E402
from lib.utils.utils_data import flip_data  # noqa: E402

# MB_ft_h36m_global_lite.yaml
LITE_ARCH = dict(
    dim_in=3,
    dim_out=3,
    dim_feat=256,
    dim_rep=512,
    depth=5,
    num_heads=8,
    mlp_ratio=4,
    num_joints=17,
    maxlen=243,
    att_fuse=True,
)

H36M_JOINTS = [
    "root", "rhip", "rknee", "rankle", "lhip", "lknee", "lankle", "belly",
    "neck", "nose", "head", "lshoulder", "lelbow", "lwrist", "rshoulder",
    "relbow", "rwrist",
]

H36M_SKELETON = [
    [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [0, 7], [7, 8], [8, 9],
    [9, 10], [8, 11], [11, 12], [12, 13], [8, 14], [14, 15], [15, 16],
]

COCO_JOINTS = [
    "nose", "leye", "reye", "lear", "rear", "lshoulder", "rshoulder", "lelbow",
    "relbow", "lwrist", "rwrist", "lhip", "rhip", "lknee", "rknee", "lankle",
    "rankle",
]

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def coco2h36m(x: np.ndarray) -> np.ndarray:
    """COCO-17 -> H36M-17 keypoints. x: (T, 17, C). Mirrors MotionBERT's mapping."""
    y = np.zeros_like(x)
    y[:, 0] = (x[:, 11] + x[:, 12]) * 0.5
    y[:, 1] = x[:, 12]
    y[:, 2] = x[:, 14]
    y[:, 3] = x[:, 16]
    y[:, 4] = x[:, 11]
    y[:, 5] = x[:, 13]
    y[:, 6] = x[:, 15]
    y[:, 8] = (x[:, 5] + x[:, 6]) * 0.5
    y[:, 7] = (y[:, 0] + y[:, 8]) * 0.5
    y[:, 9] = x[:, 0]
    y[:, 10] = (x[:, 1] + x[:, 2]) * 0.5
    y[:, 11] = x[:, 5]
    y[:, 12] = x[:, 7]
    y[:, 13] = x[:, 9]
    y[:, 14] = x[:, 6]
    y[:, 15] = x[:, 8]
    y[:, 16] = x[:, 10]
    # Confidence of a synthesized joint is the weakest of its parents.
    if x.shape[-1] == 3:
        y[:, 0, 2] = np.minimum(x[:, 11, 2], x[:, 12, 2])
        y[:, 8, 2] = np.minimum(x[:, 5, 2], x[:, 6, 2])
        y[:, 7, 2] = np.minimum(y[:, 0, 2], y[:, 8, 2])
        y[:, 10, 2] = np.minimum(x[:, 1, 2], x[:, 2, 2])
    return y


def video_meta(path: Path) -> dict:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {path}")
    meta = dict(
        width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        fps=float(cap.get(cv2.CAP_PROP_FPS)) or 30.0,
        num_frames_reported=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
    )
    cap.release()
    return meta


def detect_2d(model, path: Path, device: str, conf: float, imgsz: int):
    """Track people through the clip and return the dominant subject's COCO-17 track.

    Returns (kpts (T,17,3) in pixels, detected mask (T,), track_id or None).
    """
    per_frame: list[dict[int, tuple[np.ndarray, float]]] = []
    scores: dict[int, float] = {}

    results = model.track(
        source=str(path),
        stream=True,
        persist=True,
        classes=[0],
        conf=conf,
        imgsz=imgsz,
        device=device,
        verbose=False,
        tracker="bytetrack.yaml",
    )
    for res in results:
        frame: dict[int, tuple[np.ndarray, float]] = {}
        kp = res.keypoints
        boxes = res.boxes
        if kp is not None and kp.xy is not None and boxes is not None and len(boxes) > 0:
            xy = kp.xy.cpu().numpy()
            cf = (
                kp.conf.cpu().numpy()
                if kp.conf is not None
                else np.ones(xy.shape[:2], dtype=np.float32)
            )
            ids = (
                boxes.id.cpu().numpy().astype(int)
                if boxes.id is not None
                else np.arange(len(boxes)) * 0 - 1  # untracked -> shared bucket -1
            )
            xywh = boxes.xywh.cpu().numpy()
            for i in range(len(ids)):
                if xy[i].shape[0] != 17:
                    continue
                kpts = np.concatenate([xy[i], cf[i][:, None]], axis=-1).astype(np.float32)
                area = float(xywh[i][2] * xywh[i][3])
                tid = int(ids[i])
                # Prefer the subject that is both big in frame and confidently detected.
                scores[tid] = scores.get(tid, 0.0) + area * float(cf[i].mean())
                if tid not in frame or area > frame[tid][1]:
                    frame[tid] = (kpts, area)
        per_frame.append(frame)

    total = len(per_frame)
    if total == 0 or not scores:
        return np.zeros((total, 17, 3), np.float32), np.zeros(total, bool), None

    best = max(scores, key=scores.get)
    kpts = np.zeros((total, 17, 3), np.float32)
    mask = np.zeros(total, bool)
    for t, frame in enumerate(per_frame):
        if best in frame:
            kpts[t] = frame[best][0]
            mask[t] = True
    return kpts, mask, (best if best >= 0 else None)


def fill_gaps(kpts: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Linearly interpolate missing frames; hold the nearest pose at the edges.

    Interpolated frames keep confidence 0 so MotionBERT treats them as unobserved.
    """
    out = kpts.copy()
    idx = np.flatnonzero(mask)
    if len(idx) == 0:
        return out
    missing = np.flatnonzero(~mask)
    if len(missing) == 0:
        return out
    for c in range(2):
        for j in range(17):
            out[missing, j, c] = np.interp(missing, idx, kpts[idx, j, c])
    out[missing, :, 2] = 0.0
    return out


def load_model(checkpoint: Path, device: str) -> torch.nn.Module:
    model = DSTformer(**LITE_ARCH)
    ckpt = torch.load(checkpoint, map_location="cpu", weights_only=False)
    state = ckpt["model_pos"]
    state = {k.replace("module.", "", 1): v for k, v in state.items()}
    model.load_state_dict(state, strict=True)
    return model.to(device).eval()


def window_starts(total: int, clip_len: int, stride: int) -> list[int]:
    if total <= clip_len:
        return [0]
    starts = list(range(0, total - clip_len + 1, stride))
    if starts[-1] != total - clip_len:
        starts.append(total - clip_len)
    return starts


@torch.no_grad()
def lift_to_3d(
    model: torch.nn.Module,
    kpts_px: np.ndarray,
    width: int,
    height: int,
    device: str,
    clip_len: int,
    stride: int,
    flip_tta: bool,
) -> np.ndarray:
    """Lift a full-length 2D track to per-frame 3D poses (T, 17, 3), normalized units.

    Windows overlap and are cross-faded, and each window's root depth is re-anchored
    to the running result, so the reconstruction stays temporally continuous.
    """
    total = len(kpts_px)
    motion = coco2h36m(kpts_px).astype(np.float32)
    # MotionBERT wild-inference normalization: center on the frame, scale by min side.
    scale = min(width, height) / 2.0
    motion[..., :2] = (motion[..., :2] - np.array([width, height], np.float32) / 2.0) / scale

    acc = np.zeros((total, 17, 3), np.float64)
    wsum = np.zeros((total, 1, 1), np.float64)

    for start in window_starts(total, clip_len, stride):
        end = min(start + clip_len, total)
        chunk = motion[start:end]
        x = torch.from_numpy(chunk).unsqueeze(0).to(device)
        pred = model(x)
        if flip_tta:
            pred = (pred + flip_data(model(flip_data(x)))) / 2.0
        pred = pred[0].float().cpu().numpy().astype(np.float64)
        # Global (non-root-relative) head: depth is defined up to a per-window offset.
        pred[..., 2] -= pred[0, 0, 2]

        n = end - start
        w = np.ones(n, np.float64)
        ramp = min(max((clip_len - stride) // 2, 1), n // 2)
        if start > 0 and ramp > 1:
            w[:ramp] = np.linspace(0.0, 1.0, ramp, endpoint=False)
        if end < total and ramp > 1:
            w[-ramp:] = np.linspace(1.0, 0.0, ramp, endpoint=False)
        w = np.maximum(w, 1e-6)

        overlap = wsum[start:end, 0, 0] > 0
        if overlap.any():
            prev = acc[start:end][overlap] / wsum[start:end][overlap]
            pred[..., 2] += float(np.mean(prev[..., 2] - pred[overlap][..., 2]))

        acc[start:end] += pred * w[:, None, None]
        wsum[start:end] += w[:, None, None]

    return (acc / np.maximum(wsum, 1e-9)).astype(np.float32)


def process_video(model_det, model_pos, path: Path, root: Path, out_dir: Path, args) -> dict:
    rel = path.relative_to(root)
    out_path = out_dir / rel.with_suffix(".json")
    if out_path.exists() and not args.overwrite:
        return {"video": str(rel), "status": "skipped", "output": str(out_path)}

    meta = video_meta(path)
    kpts, mask, track_id = detect_2d(
        model_det, path, args.device, args.det_conf, args.imgsz
    )
    total = len(kpts)
    if total == 0:
        return {"video": str(rel), "status": "failed", "reason": "no frames decoded"}
    detected = int(mask.sum())
    if detected < args.min_frames:
        return {
            "video": str(rel),
            "status": "failed",
            "reason": f"only {detected}/{total} frames with a person",
        }

    kpts = fill_gaps(kpts, mask)
    pose_3d = lift_to_3d(
        model_pos, kpts, meta["width"], meta["height"], args.device,
        args.clip_len, args.stride, not args.no_flip,
    )

    payload = {
        "video": str(rel),
        "label": rel.parts[0],
        "fps": round(meta["fps"], 4),
        "width": meta["width"],
        "height": meta["height"],
        "num_frames": total,
        "model": {
            "pose_3d": "MotionBERT DSTformer-lite (MB_ft_h36m_global_lite), 3D pose head",
            "detector_2d": args.det_model,
            "clip_len": args.clip_len,
            "window_stride": args.stride,
            "flip_tta": not args.no_flip,
            "root_relative": False,
        },
        "coordinate_space": {
            "keypoints_2d": "pixels (x, y, confidence), origin top-left",
            "pose_3d": (
                "H36M metric-like units, x right / y down / z depth (larger = farther); "
                "normalized by min(width,height)/2 as in MotionBERT wild inference; "
                "root depth anchored to 0 at frame 0"
            ),
        },
        "joint_names_2d": COCO_JOINTS,
        "joint_names_3d": H36M_JOINTS,
        "skeleton_3d": H36M_SKELETON,
        "detection": {
            "track_id": track_id,
            "frames_detected": detected,
            "frames_interpolated": total - detected,
        },
        "keypoints_2d": np.round(kpts, 3).tolist(),
        "pose_3d": np.round(pose_3d, 5).tolist(),
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload))
    os.replace(tmp, out_path)
    return {
        "video": str(rel),
        "status": "ok",
        "output": str(out_path.relative_to(out_dir)),
        "num_frames": total,
        "frames_detected": detected,
    }


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dataset", type=Path, default=HERE / "dataset")
    p.add_argument("--out", type=Path, default=HERE / "outputs" / "pose3d")
    p.add_argument(
        "--checkpoint", type=Path, default=HERE / "checkpoints" / "MB_ft_h36m_global_lite.bin"
    )
    p.add_argument("--det-model", default="yolo11x-pose.pt", help="ultralytics pose model")
    p.add_argument("--det-conf", type=float, default=0.35)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--clip-len", type=int, default=243)
    p.add_argument("--stride", type=int, default=81, help="temporal window stride")
    p.add_argument("--min-frames", type=int, default=8, help="min frames with a person")
    p.add_argument("--no-flip", action="store_true", help="disable flip test-time augmentation")
    p.add_argument("--device", default=None)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--overwrite", action="store_true")
    args = p.parse_args()
    if args.device is None:
        args.device = (
            "cuda" if torch.cuda.is_available()
            else "mps" if torch.backends.mps.is_available()
            else "cpu"
        )
    args.stride = min(args.stride, args.clip_len)
    return args


def main():
    args = parse_args()
    from ultralytics import YOLO

    videos = sorted(
        p for p in args.dataset.rglob("*") if p.suffix.lower() in VIDEO_EXTS
    )
    if args.limit:
        videos = videos[: args.limit]
    if not videos:
        raise SystemExit(f"no videos found under {args.dataset}")

    print(f"device={args.device}  videos={len(videos)}  out={args.out}")
    model_det = YOLO(args.det_model)
    model_pos = load_model(args.checkpoint, args.device)
    args.out.mkdir(parents=True, exist_ok=True)

    records, t0 = [], time.time()
    for i, path in enumerate(videos, 1):
        try:
            rec = process_video(model_det, model_pos, path, args.dataset, args.out, args)
        except Exception as exc:  # keep the batch going; report at the end
            rec = {"video": str(path.relative_to(args.dataset)), "status": "failed",
                   "reason": f"{type(exc).__name__}: {exc}"}
        records.append(rec)
        elapsed = time.time() - t0
        print(
            f"[{i}/{len(videos)}] {rec['status']:>7}  {rec['video']}"
            + (f"  ({rec.get('reason')})" if rec["status"] == "failed" else "")
            + f"  {elapsed / i:.1f}s/vid",
            flush=True,
        )

    ok = sum(r["status"] == "ok" for r in records)
    failed = [r for r in records if r["status"] == "failed"]
    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "dataset": str(args.dataset),
        "counts": {"total": len(records), "ok": ok,
                   "skipped": len(records) - ok - len(failed), "failed": len(failed)},
        "config": {k: str(v) for k, v in vars(args).items()},
        "videos": records,
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\ndone: {ok} ok, {len(failed)} failed, {time.time() - t0:.0f}s total")
    for r in failed[:20]:
        print(f"  FAILED {r['video']}: {r.get('reason')}")


if __name__ == "__main__":
    main()
