"""
Where the time actually goes.

Single-threaded on purpose: that is what onnxruntime-web gets in the Capacitor
WebView without cross-origin isolation, so absolute numbers here are optimistic
but the ratios between variants are what decisions get made on.
"""

import argparse
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

HERE = Path(__file__).parent


def session(path: Path, threads: int = 1) -> ort.InferenceSession:
    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])


def bench(name: str, run, warmup: int = 2, iterations: int = 10) -> float:
    for _ in range(warmup):
        run()
    start = time.perf_counter()
    for _ in range(iterations):
        run()
    each = (time.perf_counter() - start) / iterations * 1000
    print(f"{name:<38} {each:8.1f} ms")
    return each


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, default=HERE / "onnx")
    parser.add_argument("--frames", type=int, default=300, help="Frames in a typical clip.")
    opts = parser.parse_args()

    print(f"--- detector, one frame ---")
    detector_ms = {}
    for path in sorted(opts.models.glob("yolo11n_pose*.onnx")):
        name = path.stem
        model = session(path)
        shape = model.get_inputs()[0].shape
        size = shape[2] if isinstance(shape[2], int) else 640
        blob = np.random.rand(1, 3, size, size).astype(np.float32)
        key = model.get_inputs()[0].name
        detector_ms[name] = bench(
            f"{name} @{size}", lambda m=model, b=blob, k=key: m.run(None, {k: b})
        )

    print(f"\n--- lifter, one {opts.frames}-frame clip ---")
    for name in ("motionbert_lite_fp32", "motionbert_lite_int8"):
        path = opts.models / f"{name}.onnx"
        if not path.exists():
            continue
        model = session(path)
        key = model.get_inputs()[0].name
        # Two windows, as a 300-frame clip would need at 243 max.
        windows = [np.random.rand(1, n, 17, 3).astype(np.float32) for n in (243, 57)]
        bench(
            name,
            lambda m=model, w=windows, k=key: [m.run(None, {k: x}) for x in w],
            iterations=3,
        )

    print(f"\n--- whole clip of {opts.frames} frames ---")
    for name, each in detector_ms.items():
        print(f"{name:<38} {each * opts.frames / 1000:8.1f} s of detection")


if __name__ == "__main__":
    main()
