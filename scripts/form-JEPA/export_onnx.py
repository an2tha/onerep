"""
Exports the two models the mobile app runs in the WebView.

The app has no Python and no PyTorch: `apps/mobile` is a Vite/Ionic web app in a
Capacitor shell, so pose estimation runs under onnxruntime-web. That makes this
script the only bridge between the research checkpoints in this directory and
what ships.

Two models, because MotionBERT cannot see. It is a 2D->3D *lifter* — its input
is [T, 17, 3] of (x, y, confidence) keypoints, never pixels (see
`MotionBERT/lib/data/dataset_wild.py`, which reads AlphaPose JSON). So the
pipeline is:

    frame pixels -> YOLO11-pose -> COCO-17 2D -> H36M-17 2D -> MotionBERT -> H36M-17 3D

Usage:
    uv run export_onnx.py --out ../../apps/mobile/public/models

Only the lifter is quantized, and the asymmetry is deliberate. int8 shrinks it
from 64 MB — unshippable under Cloudflare Pages' hard 25 MiB per-file cap — to
16 MB, and costs 11% of a sub-second, once-per-clip operation. Quantizing the
*detector* instead makes it ten times slower, because onnxruntime has no fast
int8 convolution kernel on wasm, and the detector runs once per frame. It ships
fp32 at 448.

Run `bench_onnx.py` for the speed side of that and `validate_onnx.py` for what
the precision and resolution choices cost in millimetres.
"""

import argparse
import shutil
import sys
from pathlib import Path

import torch
import torch.nn as nn

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE / "MotionBERT"))

from lib.utils.learning import load_backbone  # noqa: E402
from lib.utils.tools import get_config  # noqa: E402

# Frames per MotionBERT window. The checkpoint's temporal embedding is sized for
# this and cannot be exceeded; `DSTformer.forward` slices `temp_embed[:, :F]`,
# so anything shorter works and is exported as a dynamic axis.
MAX_CLIP_LEN = 243

# What the exported graph is traced at. Any T <= MAX_CLIP_LEN works at runtime.
TRACE_CLIP_LEN = 243

H36M_JOINTS = 17


def export_motionbert(config: Path, checkpoint: Path, out: Path) -> Path:
    """MotionBERT-lite as ONNX, taking [1, T, 17, 3] and returning [1, T, 17, 3]."""
    args = get_config(str(config))
    model = load_backbone(args)

    state = torch.load(checkpoint, map_location="cpu", weights_only=False)
    weights = state["model_pos"]
    # Saved from a DataParallel wrapper, so every key carries a `module.` prefix
    # that the bare module will reject.
    weights = {key.removeprefix("module."): value for key, value in weights.items()}
    model.load_state_dict(weights, strict=True)
    model.eval()

    dummy = torch.zeros(1, TRACE_CLIP_LEN, H36M_JOINTS, 3)
    path = out / "motionbert_lite_fp32.onnx"
    torch.onnx.export(
        model,
        (dummy,),
        str(path),
        input_names=["keypoints_2d"],
        output_names=["keypoints_3d"],
        # Only the time axis is dynamic. Batch stays 1 because the app lifts one
        # person from one clip, and joints are fixed by the checkpoint.
        dynamic_axes={"keypoints_2d": {1: "frames"}, "keypoints_3d": {1: "frames"}},
        opset_version=17,
        do_constant_folding=True,
    )
    return path


def export_yolo_pose(model_name: str, out: Path, imgsz: int) -> Path:
    """
    YOLO11n-pose as ONNX, taking [1, 3, imgsz, imgsz].

    Output is [1, 56, N] where N is 8400 at 640 and scales with the square of
    the input, since it is the three detection grids flattened.
    """
    from ultralytics import YOLO

    model = YOLO(model_name)
    # `simplify` folds the export down to ops onnxruntime-web's WASM backend has
    # kernels for; without it the graph carries training-shaped subgraphs that
    # the web build refuses to load.
    exported = model.export(
        format="onnx", opset=17, simplify=True, dynamic=False, imgsz=imgsz
    )

    path = out / f"yolo11n_pose_{imgsz}_fp32.onnx"
    shutil.move(str(exported), path)
    return path


def quantize(path: Path) -> Path:
    """Dynamic int8. Weights shrink 4x; activations stay float."""
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantized = path.with_name(path.name.replace("_fp32", "_int8"))
    quantize_dynamic(
        model_input=str(path),
        model_output=str(quantized),
        weight_type=QuantType.QInt8,
    )
    return quantized


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=HERE / "onnx",
        help="Staging directory for every artefact, fp32 included.",
    )
    parser.add_argument(
        "--ship",
        type=Path,
        default=None,
        help=(
            "Also copy the shipping pair here — the app's public/models: the "
            "int8 lifter and the fp32 detector at the first --detector-sizes "
            "entry. fp32 MotionBERT is never copied; it is 64 MB and spills "
            "into a sidecar .data file, neither of which can deploy."
        ),
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=HERE / "MotionBERT/configs/pose3d/MB_ft_h36m_global_lite.yaml",
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=HERE / "checkpoints/MB_ft_h36m_global_lite.bin",
    )
    parser.add_argument(
        "--detector",
        default="yolo11n-pose.pt",
        help="Ultralytics pose checkpoint. Downloaded on first run.",
    )
    parser.add_argument(
        "--detector-sizes",
        type=int,
        nargs="+",
        default=[448, 640],
        help="Square input sizes to export. The first is the one that ships.",
    )
    parser.add_argument(
        "--skip-quantize",
        action="store_true",
        help="Export fp32 only. The fp32 lifter is too big to deploy.",
    )
    opts = parser.parse_args()

    opts.out.mkdir(parents=True, exist_ok=True)

    lifter = export_motionbert(opts.config, opts.checkpoint, opts.out)
    detectors = [
        export_yolo_pose(opts.detector, opts.out, size) for size in opts.detector_sizes
    ]

    # Only the lifter is quantized. int8 is a 10x *slowdown* on the detector —
    # onnxruntime has no fast int8 convolution kernel on CPU or wasm, so it
    # dequantizes on every inference, and the detector runs once per frame. The
    # lifter is 11% slower in int8 and runs once per clip, which is a price
    # worth paying to get a 64 MB graph under Cloudflare Pages' 25 MiB cap.
    shipped = [] if opts.skip_quantize else [quantize(lifter)]
    shipped += [opts.out / f"yolo11n_pose_{opts.detector_sizes[0]}_fp32.onnx"]

    if opts.ship:
        opts.ship.mkdir(parents=True, exist_ok=True)
        for path in shipped:
            shutil.copy2(path, opts.ship / path.name)

    for path in [lifter, *detectors, *shipped]:
        print(f"{path.name:>34}  {path.stat().st_size / 1024 / 1024:6.1f} MiB")


if __name__ == "__main__":
    main()
