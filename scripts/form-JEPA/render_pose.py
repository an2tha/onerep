"""Reconstruct and play back the 3D pose stored in a MotionBERT output JSON.

Opens an interactive matplotlib window: drag to rotate the skeleton, scrub the frame
slider, space to play/pause, arrow keys to step. Pass -o to write a file instead.

    uv run render_pose.py outputs/pose3d/squat/squat_1.json
    uv run render_pose.py outputs/pose3d/squat/squat_1.json --with-video
    uv run render_pose.py outputs/pose3d/squat/squat_1.json -o pose.mp4
    uv run render_pose.py outputs/pose3d/squat/squat_1.json --frame 40 -o pose.png
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import matplotlib
import numpy as np

# Only force the headless backend when writing a file; otherwise keep the GUI backend.
if any(a in ("-o", "--out") or a.startswith("--out=") for a in sys.argv[1:]):
    matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.animation import FuncAnimation  # noqa: E402
from matplotlib.widgets import Slider  # noqa: E402

BG = "#0f1115"
FG = "#e2e8f0"
RIGHT = "#38bdf8"
LEFT = "#fb7185"
SPINE = "#94a3b8"
GRID = "#242832"

# H36M edges, grouped so left/right read apart at a glance.
LIMBS = [
    ((0, 1), RIGHT), ((1, 2), RIGHT), ((2, 3), RIGHT),
    ((0, 4), LEFT), ((4, 5), LEFT), ((5, 6), LEFT),
    ((0, 7), SPINE), ((7, 8), SPINE), ((8, 9), SPINE), ((9, 10), SPINE),
    ((8, 11), LEFT), ((11, 12), LEFT), ((12, 13), LEFT),
    ((8, 14), RIGHT), ((14, 15), RIGHT), ((15, 16), RIGHT),
]

COCO_EDGES = [
    ((5, 7), LEFT), ((7, 9), LEFT), ((11, 13), LEFT), ((13, 15), LEFT),
    ((6, 8), RIGHT), ((8, 10), RIGHT), ((12, 14), RIGHT), ((14, 16), RIGHT),
    ((5, 6), SPINE), ((11, 12), SPINE), ((5, 11), SPINE), ((6, 12), SPINE),
    ((0, 1), SPINE), ((0, 2), SPINE), ((1, 3), SPINE), ((2, 4), SPINE),
]


def to_world(pose: np.ndarray) -> np.ndarray:
    """MotionBERT (x right, y down, z depth) -> plot axes (x right, y depth, z up)."""
    out = np.empty_like(pose)
    out[..., 0] = pose[..., 0]
    out[..., 1] = pose[..., 2]
    out[..., 2] = -pose[..., 1]
    return out


def axis_bounds(poses: np.ndarray, pad: float = 0.15):
    """One cubic box for the whole sequence, so the skeleton doesn't swim in the frame."""
    lo, hi = poses.reshape(-1, 3).min(0), poses.reshape(-1, 3).max(0)
    center = (lo + hi) / 2
    radius = float((hi - lo).max()) / 2 * (1 + pad)
    radius = max(radius, 1e-3)
    return center, radius


def style_axes(ax, center, radius, floor: float, zoom: float = 1.0):
    ax.set_xlim(center[0] - radius, center[0] + radius)
    ax.set_ylim(center[1] - radius, center[1] + radius)
    ax.set_zlim(floor, floor + 2 * radius)
    # Equal-sided box; zoom fills the panel, since a cube in 3D leaves big margins.
    ax.set_box_aspect((1, 1, 1), zoom=zoom)
    ax.set_facecolor(BG)
    for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
        axis.set_pane_color((0, 0, 0, 0))
        axis.line.set_color(GRID)
        axis._axinfo["grid"].update(color=GRID, linewidth=0.6)
        axis.set_ticklabels([])
        axis.set_ticks(np.linspace(-radius, radius, 5) + 0)
    ax.tick_params(colors=BG, length=0)
    ax.grid(True)


def draw_pose(ax, pose: np.ndarray, floor: float):
    """One frame: shadow on the floor, then bones, then joints."""
    ax.plot(
        pose[:, 0], pose[:, 1], np.full(len(pose), floor),
        ".", color="#1b1f2a", markersize=3, zorder=1,
    )
    for (a, b), color in LIMBS:
        ax.plot(
            [pose[a, 0], pose[b, 0]], [pose[a, 1], pose[b, 1]], [pose[a, 2], pose[b, 2]],
            color=color, linewidth=2.6, solid_capstyle="round", zorder=3,
        )
    ax.scatter(
        pose[:, 0], pose[:, 1], pose[:, 2],
        s=14, color=FG, edgecolors="none", depthshade=False, zorder=4,
    )


def render_frame(fig, ax, pose, center, radius, floor, caption, elev, azim, zoom):
    ax.clear()
    style_axes(ax, center, radius, floor, zoom)
    ax.view_init(elev=elev, azim=azim)
    draw_pose(ax, pose, floor)
    ax.text2D(
        0.03, 0.03, caption, transform=ax.transAxes, color="#64748b",
        fontsize=9, family="monospace",
    )
    fig.canvas.draw()
    buf = np.asarray(fig.canvas.buffer_rgba())[..., :3]
    return cv2.cvtColor(buf, cv2.COLOR_RGB2BGR)


def draw_2d(frame: np.ndarray, kpts: np.ndarray, min_conf: float = 0.2) -> np.ndarray:
    out = frame.copy()
    for (a, b), color in COCO_EDGES:
        if kpts[a, 2] < min_conf or kpts[b, 2] < min_conf:
            continue
        rgb = tuple(int(color[i:i + 2], 16) for i in (5, 3, 1))  # hex -> BGR
        cv2.line(out, tuple(kpts[a, :2].astype(int)), tuple(kpts[b, :2].astype(int)), rgb, 2, cv2.LINE_AA)
    for j in range(len(kpts)):
        if kpts[j, 2] >= min_conf:
            cv2.circle(out, tuple(kpts[j, :2].astype(int)), 3, (226, 232, 240), -1, cv2.LINE_AA)
    return out


def read_video_frames(path: Path, count: int) -> list[np.ndarray] | None:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return None
    frames = []
    while len(frames) < count:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    return frames or None


def fit_height(frame: np.ndarray, height: int) -> np.ndarray:
    scale = height / frame.shape[0]
    return cv2.resize(frame, (int(round(frame.shape[1] * scale)), height), interpolation=cv2.INTER_AREA)


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("json", type=Path, help="pose JSON produced by run_motionbert.py")
    p.add_argument(
        "-o", "--out", type=Path, default=None,
        help="write to this .mp4 (or .png with --frame) instead of opening a window",
    )
    p.add_argument("--frame", type=int, default=None, help="start on / write out this frame")
    p.add_argument("--with-video", action="store_true", help="show the source clip beside the 3D pose")
    p.add_argument("--video-root", type=Path, default=Path(__file__).resolve().parent / "dataset")
    p.add_argument("--orbit", action="store_true", help="rotate the camera once through the clip")
    p.add_argument("--elev", type=float, default=12.0)
    p.add_argument("--azim", type=float, default=-70.0)
    p.add_argument("--size", type=int, default=720, help="3D panel size in pixels")
    p.add_argument("--zoom", type=float, default=1.45, help="how much the skeleton fills the panel")
    p.add_argument("--fps", type=float, default=None, help="override output fps")
    p.add_argument("--stride", type=int, default=1, help="render every Nth frame")
    return p.parse_args()


def show_interactive(args, data, poses, kpts2d, source, center, radius, floor, label):
    """Live viewer: drag to rotate, scrub the slider, space to play/pause, arrows to step."""
    total = len(poses)
    fps = args.fps or data.get("fps", 30.0)

    fig = plt.figure(figsize=(13, 7) if source else (8, 8), facecolor=BG)
    fig.canvas.manager.set_window_title(f"{label} — {args.json.name}")
    if source:
        ax_vid = fig.add_axes([0.02, 0.12, 0.48, 0.84])
        ax_vid.set_facecolor(BG)
        ax_vid.axis("off")
        im = ax_vid.imshow(np.zeros_like(source[0][..., ::-1]))
        ax = fig.add_axes([0.52, 0.12, 0.46, 0.84], projection="3d")
    else:
        ax_vid = im = None
        ax = fig.add_axes([0.02, 0.12, 0.96, 0.86], projection="3d")

    ax_slider = fig.add_axes([0.08, 0.045, 0.84, 0.03], facecolor="#1b1f2a")
    slider = Slider(ax_slider, "", 1, total, valinit=1, valstep=1, color="#38bdf8")
    slider.valtext.set_color(FG)
    slider.valtext.set_fontfamily("monospace")

    start = args.frame % total if args.frame is not None else 0
    state = {"frame": start, "playing": args.frame is None, "syncing": False}

    def draw(i: int):
        # Keep whatever angle the user has dragged to, unless --orbit is driving it.
        azim = args.azim + 360.0 * i / total if args.orbit else ax.azim
        elev = args.elev if args.orbit else ax.elev
        caption = f"{label}   frame {i + 1}/{total}"
        ax.clear()
        style_axes(ax, center, radius, floor, args.zoom)
        ax.view_init(elev=elev, azim=azim)
        draw_pose(ax, poses[i], floor)
        ax.text2D(0.02, 0.02, caption, transform=ax.transAxes, color="#64748b",
                  fontsize=9, family="monospace")
        if im is not None and i < len(source):
            frame = source[i]
            if len(kpts2d):
                frame = draw_2d(frame, kpts2d[i])
            im.set_data(frame[..., ::-1])

    def goto(i: int):
        state["frame"] = i % total
        draw(state["frame"])
        state["syncing"] = True
        slider.set_val(state["frame"] + 1)
        state["syncing"] = False

    def on_slider(val):
        if state["syncing"]:
            return
        state["playing"] = False
        state["frame"] = int(val) - 1
        draw(state["frame"])

    def on_key(event):
        if event.key == " ":
            state["playing"] = not state["playing"]
        elif event.key in ("right", "left"):
            state["playing"] = False
            goto(state["frame"] + (1 if event.key == "right" else -1))
        elif event.key in ("q", "escape"):
            plt.close(fig)

    def tick(_):
        if state["playing"]:
            goto(state["frame"] + 1)
        return ()

    slider.on_changed(on_slider)
    fig.canvas.mpl_connect("key_press_event", on_key)
    ax.view_init(elev=args.elev, azim=args.azim)
    goto(start)

    # Held on the figure so the animation isn't garbage collected while the window lives.
    fig._pose_anim = FuncAnimation(
        fig, tick, interval=1000.0 / fps, blit=False, cache_frame_data=False
    )
    print(
        f"{label}: {total} frames @ {fps:.1f} fps\n"
        "  drag to rotate · slider to scrub · space play/pause · ←/→ step · q to close"
    )
    plt.show()
    return fig


def main():
    args = parse_args()
    data = json.loads(args.json.read_text())
    poses = to_world(np.array(data["pose_3d"], dtype=np.float32))
    kpts2d = np.array(data.get("keypoints_2d", []), dtype=np.float32)
    total = len(poses)
    center, radius = axis_bounds(poses)
    floor = float(poses[..., 2].min()) - 0.05 * radius

    source = None
    if args.with_video:
        source = read_video_frames(args.video_root / data["video"], total)
        if source is None:
            print(f"warning: could not read {args.video_root / data['video']}; rendering pose only")

    label = f"{data.get('label', args.json.stem)}"

    if args.out is None:
        show_interactive(args, data, poses, kpts2d, source, center, radius, floor, label)
        return

    dpi = 100
    fig = plt.figure(figsize=(args.size / dpi, args.size / dpi), dpi=dpi, facecolor=BG)
    ax = fig.add_subplot(111, projection="3d")
    fig.subplots_adjust(left=0, right=1, bottom=0, top=1)

    indices = [args.frame % total] if args.frame is not None else list(range(0, total, args.stride))

    def compose(i: int) -> np.ndarray:
        azim = args.azim + (360.0 * i / total if args.orbit else 0.0)
        caption = f"{label}   frame {i + 1}/{total}"
        panel = render_frame(
            fig, ax, poses[i], center, radius, floor, caption, args.elev, azim, args.zoom
        )
        if source and i < len(source):
            left = fit_height(source[i], panel.shape[0])
            if len(kpts2d):
                left = draw_2d(left, kpts2d[i] * (left.shape[0] / data["height"]))
            return np.hstack([left, panel])
        return panel

    out = args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    if args.frame is not None:
        cv2.imwrite(str(out), compose(indices[0]))
        print(f"wrote {out}")
        return

    fps = args.fps or (data.get("fps", 30.0) / args.stride)
    writer = None
    for n, i in enumerate(indices, 1):
        frame = compose(i)
        if writer is None:
            writer = cv2.VideoWriter(
                str(out), cv2.VideoWriter_fourcc(*"mp4v"), fps, (frame.shape[1], frame.shape[0])
            )
            if not writer.isOpened():
                raise SystemExit(f"could not open video writer for {out}")
        writer.write(frame)
        if n % 25 == 0 or n == len(indices):
            print(f"  {n}/{len(indices)} frames", flush=True)
    writer.release()
    plt.close(fig)
    print(f"wrote {out}  ({len(indices)} frames @ {fps:.2f} fps)")


if __name__ == "__main__":
    main()
