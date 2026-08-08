import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import type { FormCoachFrame } from "@/lib/form-coach"
import { cn } from "@/lib/utils"
import {
  BONE_BUFFER_FLOATS,
  JOINT_BUFFER_FLOATS,
  NEUTRAL_ORIENTATION,
  POSE_LANDMARK_COUNT,
  boneVertices,
  groundTransform,
  toRawScenePoints,
  toScenePoints,
  type GroundTransform,
  type PoseOrientation,
  type PoseSpace,
  type ScenePoint,
} from "@/lib/pose-scene"
import {
  buildPoseTrack,
  samplePoseAt,
  type SampledPoint,
} from "@/lib/pose-interpolate"
import {
  POSE_CORRECTED_COLOR,
  POSE_GHOST_COLOR,
  POSE_PLAIN_COLOR,
} from "@/lib/pose-colors"

/** How often the scrubber label is told where playback got to. */
const PROGRESS_INTERVAL_MS = 80

/**
 * Interactive 3D view of a pose over time — drag to orbit, pinch to zoom.
 *
 * Playback runs on the render clock and samples an interpolated track, rather
 * than stepping through the measured frames. Stepping 10fps data straight out
 * of React state was both choppy to watch and a re-render per frame; this
 * animates at whatever the display runs at (60Hz+) with React uninvolved.
 */
export function PoseViewer({
  frames,
  ghostFrames,
  playing,
  seekTimeMs,
  loop = true,
  orientation = NEUTRAL_ORIENTATION,
  space = "camera",
  boneColor,
  boneOpacity = 1,
  ghostOpacity = 0.22,
  onProgress,
  className,
}: {
  frames: readonly FormCoachFrame[]
  /**
   * Drawn behind `frames`, dimmed. Used to hold the lifter's actual rep behind
   * the corrected one so the difference is visible in a single view rather than
   * remembered across a toggle.
   */
  ghostFrames?: readonly FormCoachFrame[]
  /** Defaults to the corrected green when there is a ghost to contrast with. */
  boneColor?: number
  /** Both are live: a correction is read by fading one against the other. */
  boneOpacity?: number
  ghostOpacity?: number
  playing: boolean
  /** Set to jump the playhead; changing this value seeks. */
  seekTimeMs?: number
  loop?: boolean
  /** Hand-applied tilt, so the lifter can straighten a crooked camera. */
  orientation?: PoseOrientation
  /** Which frame the landmarks are already in. A fused rep is "body". */
  space?: PoseSpace
  onProgress?: (timeMs: number) => void
  className?: string
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const jointsRef = useRef<THREE.Points | null>(null)
  const bonesRef = useRef<THREE.LineSegments | null>(null)
  const ghostBonesRef = useRef<THREE.LineSegments | null>(null)

  const track = useMemo(() => buildPoseTrack(frames, { loop }), [frames, loop])
  const ghostTrack = useMemo(
    () => (ghostFrames ? buildPoseTrack(ghostFrames, { loop }) : null),
    [ghostFrames, loop]
  )

  // Read inside the animation loop so changing them never rebuilds the scene.
  const trackRef = useRef(track)
  trackRef.current = track
  const ghostTrackRef = useRef(ghostTrack)
  ghostTrackRef.current = ghostTrack
  const playingRef = useRef(playing)
  playingRef.current = playing
  const orientationRef = useRef(orientation)
  orientationRef.current = orientation
  const spaceRef = useRef(space)
  spaceRef.current = space
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  const clockRef = useRef(0)
  const scratchRef = useRef<SampledPoint[] | undefined>(undefined)
  const ghostScratchRef = useRef<SampledPoint[] | undefined>(undefined)

  // Seeking is a prop change rather than continuous state, so the playhead can
  // move without the animation loop restarting.
  useEffect(() => {
    if (seekTimeMs !== undefined) clockRef.current = seekTimeMs
  }, [seekTimeMs])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    // Framed for a body standing on the floor at the origin: roughly 1.6m of
    // lifter, viewed from chest height.
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    camera.position.set(0, 0.9, 3)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // Pin the canvas to the container. Left to its own devices it lays out at
    // its backing-store size — devicePixelRatio times larger than intended —
    // and stretches whatever contains it.
    renderer.domElement.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none"
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 1
    controls.maxDistance = 6
    // Orbit around the middle of the body, not its feet.
    controls.target.set(0, 0.8, 0)

    // The floor the lifter is standing on, at the same height as their feet.
    const grid = new THREE.GridHelper(4, 12, 0x666666, 0x333333)
    grid.position.y = 0
    const gridMaterial = grid.material as THREE.Material
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.35
    scene.add(grid)

    const jointGeometry = new THREE.BufferGeometry()
    jointGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(JOINT_BUFFER_FLOATS), 3)
    )
    const joints = new THREE.Points(
      jointGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.05,
        transparent: true,
      })
    )
    scene.add(joints)
    jointsRef.current = joints

    const boneGeometry = new THREE.BufferGeometry()
    boneGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(BONE_BUFFER_FLOATS), 3)
    )
    const bones = new THREE.LineSegments(
      boneGeometry,
      new THREE.LineBasicMaterial({
        color: POSE_PLAIN_COLOR,
        transparent: true,
      })
    )
    scene.add(bones)
    bonesRef.current = bones

    // Behind the main skeleton and deliberately washed out — it is context, not
    // the thing being read.
    const ghostGeometry = new THREE.BufferGeometry()
    ghostGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(BONE_BUFFER_FLOATS), 3)
    )
    const ghostBones = new THREE.LineSegments(
      ghostGeometry,
      new THREE.LineBasicMaterial({
        color: POSE_GHOST_COLOR,
        transparent: true,
        opacity: 0.22,
      })
    )
    scene.add(ghostBones)
    ghostBonesRef.current = ghostBones

    const resize = () => {
      const { clientWidth, clientHeight } = mount
      if (clientWidth === 0 || clientHeight === 0) return
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    let raf = 0
    let lastTime = performance.now()
    let lastProgress = 0

    const tick = (now: number) => {
      // Clamped so a backgrounded tab does not resume with a huge jump.
      const delta = Math.min(now - lastTime, 100)
      lastTime = now

      const current = trackRef.current
      if (current) {
        if (playingRef.current && current.durationMs > 0) {
          clockRef.current =
            (clockRef.current + delta) % (current.durationMs || 1)
        }
        const ghost = ghostTrackRef.current
        ghostBones.visible =
          Boolean(ghost) && ghostBones.material.opacity > 0.02

        // Both skeletons stand on the floor the *original* defines. Letting the
        // corrected pose derive its own would rotate it away from the ghost —
        // a knee correction moves the ankles, which moves the feet the
        // transform is built from.
        let shared: GroundTransform | null = null
        if (ghost) {
          ghostScratchRef.current = samplePoseAt(
            ghost,
            clockRef.current,
            ghostScratchRef.current
          )
          shared = groundTransform(
            toRawScenePoints(
              {
                timeMs: clockRef.current,
                landmarks: [],
                worldLandmarks: ghostScratchRef.current,
              },
              spaceRef.current
            )
          )
        }

        drawPose(
          current,
          clockRef.current,
          joints,
          bones,
          scratchRef,
          orientationRef.current,
          spaceRef.current,
          shared
        )
        if (ghost && ghostScratchRef.current) {
          drawBones(
            toScenePoints(
              {
                timeMs: clockRef.current,
                landmarks: [],
                worldLandmarks: ghostScratchRef.current,
              },
              orientationRef.current,
              spaceRef.current,
              shared
            ),
            ghostBones
          )
        }

        if (now - lastProgress > PROGRESS_INTERVAL_MS) {
          lastProgress = now
          onProgressRef.current?.(clockRef.current)
        }
      }

      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      jointGeometry.dispose()
      joints.material.dispose()
      boneGeometry.dispose()
      bones.material.dispose()
      ghostGeometry.dispose()
      ghostBones.material.dispose()
      grid.geometry.dispose()
      gridMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      jointsRef.current = null
      bonesRef.current = null
      ghostBonesRef.current = null
    }
  }, [])

  // Materials are mutated in place rather than rebuilt: the scene is created
  // once, and dragging a slider must not tear down the WebGL context.
  const hasGhost = ghostTrack !== null
  useEffect(() => {
    const bones = bonesRef.current
    const ghost = ghostBonesRef.current
    const joints = jointsRef.current
    if (!bones || !ghost || !joints) return

    const boneMaterial = bones.material as THREE.LineBasicMaterial
    boneMaterial.color.setHex(
      boneColor ?? (hasGhost ? POSE_CORRECTED_COLOR : POSE_PLAIN_COLOR)
    )
    boneMaterial.opacity = boneOpacity
    // Below this the skeleton is not dim, it is absent, and leaving an
    // invisible mesh in the scene costs a draw call for nothing.
    bones.visible = boneOpacity > 0.02
    ;(joints.material as THREE.PointsMaterial).opacity = boneOpacity
    joints.visible = bones.visible

    const ghostMaterial = ghost.material as THREE.LineBasicMaterial
    ghostMaterial.opacity = ghostOpacity
  }, [boneColor, boneOpacity, ghostOpacity, hasGhost])

  // A different clip means starting over rather than resuming mid-way.
  useEffect(() => {
    clockRef.current = 0
  }, [track])

  // `relative` anchors the absolutely positioned canvas; `overflow-hidden`
  // means a mid-resize frame can never spill into the sheet's layout.
  return (
    <div ref={mountRef} className={cn("relative overflow-hidden", className)} />
  )
}

function drawPose(
  track: NonNullable<ReturnType<typeof buildPoseTrack>>,
  timeMs: number,
  joints: THREE.Points,
  bones: THREE.LineSegments,
  scratchRef: { current: SampledPoint[] | undefined },
  orientation: PoseOrientation,
  space: PoseSpace,
  transform?: GroundTransform | null
) {
  scratchRef.current = samplePoseAt(track, timeMs, scratchRef.current)
  const points = toScenePoints(
    { timeMs, landmarks: [], worldLandmarks: scratchRef.current },
    orientation,
    space,
    transform
  )

  const jointAttr = joints.geometry.getAttribute(
    "position"
  ) as THREE.BufferAttribute
  const jointArray = jointAttr.array as Float32Array
  // Packed, not indexed by landmark: an untracked joint left at its slot
  // would still be drawn, planting a stray dot at the origin.
  let jointCount = 0
  for (const point of points) {
    if (!point.visible || jointCount >= POSE_LANDMARK_COUNT) continue
    jointArray[jointCount * 3] = point.x
    jointArray[jointCount * 3 + 1] = point.y
    jointArray[jointCount * 3 + 2] = point.z
    jointCount += 1
  }
  jointAttr.needsUpdate = true
  joints.geometry.setDrawRange(0, jointCount)

  const vertices = boneVertices(points)
  const boneAttr = bones.geometry.getAttribute(
    "position"
  ) as THREE.BufferAttribute
  const boneArray = boneAttr.array as Float32Array
  boneArray.set(vertices)
  boneArray.fill(0, vertices.length)
  boneAttr.needsUpdate = true
  bones.geometry.setDrawRange(0, vertices.length / 3)
}

/** Bones only: a ghost with joints drawn too reads as a second lifter. */
function drawBones(points: ScenePoint[], bones: THREE.LineSegments) {
  const vertices = boneVertices(points)
  const attribute = bones.geometry.getAttribute(
    "position"
  ) as THREE.BufferAttribute
  const array = attribute.array as Float32Array
  array.set(vertices)
  array.fill(0, vertices.length)
  attribute.needsUpdate = true
  bones.geometry.setDrawRange(0, vertices.length / 3)
}
