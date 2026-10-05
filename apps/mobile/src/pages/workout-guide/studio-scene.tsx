import { useEffect, useRef, useState } from "react"
import type {
  GuideAnswers,
  GuideQuestionId,
} from "../../../../../convex/lib/workoutGuide"

type Station = "overview" | "rack" | "bench" | "dumbbells" | "floor" | "clock"
type Props = {
  question?: GuideQuestionId
  answers: GuideAnswers
  busy: boolean
  review: boolean
  progress: number
}
// Blender is Z-up, glTF is Y-up. Stations are measured in the exported room.
const SHOTS: Record<Station, { eye: number[]; look: number[] }> = {
  overview: { eye: [-0.65, 2.05, 3.7], look: [-2.25, 0.75, -3.4] },
  rack: { eye: [-0.8, 1.9, 1.65], look: [-2.25, 1.32, -3.5] },
  bench: { eye: [2.1, 1.05, 1.7], look: [0.45, 0.7, -2.15] },
  dumbbells: { eye: [1.55, 1.9, 0.7], look: [3.95, 1.4, -4.75] },
  floor: { eye: [-2.45, 0.85, 2.15], look: [-4.65, 0.5, -1.0] },
  clock: { eye: [0.1, 2.4, -0.2], look: [0.5, 1.72, -6.7] },
}
export function studioStation({
  question,
  answers,
  review,
}: Omit<Props, "busy" | "progress">): Station {
  if (review) return "overview"
  if (question === "duration" || question === "pace") return "clock"
  if (
    question === "constraints" ||
    question === "effort" ||
    question === "finish"
  )
    return "floor"
  if (question === "equipment")
    return answers.equipment === "Bodyweight only"
      ? "floor"
      : answers.equipment === "Full gym"
        ? "overview"
        : "dumbbells"
  if (
    question === "upper" ||
    answers.focus === "Upper body" ||
    /Chest|Lats|Shoulders|Biceps|Triceps|Upper back/.test(answers.focus ?? "")
  )
    return "bench"
  if (
    question === "lower" ||
    answers.focus === "Lower body" ||
    /Quads|Glutes|Hamstrings|Calves/.test(answers.focus ?? "") ||
    answers.goal === "Build strength"
  )
    return "rack"
  if (answers.goal === "Build muscle") return "dumbbells"
  return "overview"
}
export function StudioScene(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const current = useRef(props)
  current.current = props
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let dead = false
    let cleanup = () => {}
    void Promise.all([
      import("three"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/RGBELoader.js"),
    ])
      .then(async ([T, { GLTFLoader }, { RGBELoader }]) => {
        if (dead || !host.current) return
        const element = host.current
        const renderer = new T.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "low-power",
        })
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25))
        renderer.outputColorSpace = T.SRGBColorSpace
        renderer.toneMapping = T.ACESFilmicToneMapping
        renderer.toneMappingExposure = 0.95
        // Cache the static key-light shadow once. Camera travel and LED updates
        // reuse it, so the room is not redrawn into shadow maps every frame.
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = T.PCFShadowMap
        renderer.shadowMap.autoUpdate = false
        renderer.shadowMap.needsUpdate = true
        element.appendChild(renderer.domElement)
        cleanup = () => {
          renderer.dispose()
          renderer.domElement.remove()
        }
        const scene = new T.Scene()
        scene.background = new T.Color(0x0c0e10)
        scene.fog = new T.FogExp2(0x101315, 0.022)
        const camera = new T.PerspectiveCamera(48, 1, 0.12, 40)
        const initialStation = studioStation(current.current)
        const start = SHOTS[initialStation]
        camera.position.fromArray(start.eye)
        const aim = new T.Vector3().fromArray(start.look)
        if (element.clientWidth < element.clientHeight && initialStation === "overview")
          aim.y -= 0.35
        const desiredEye = new T.Vector3().copy(camera.position)
        const desiredAim = aim.clone()
        camera.layers.enable(1)
        // Reflections are rendered from this gym, rather than a generic studio.
        const pmrem = new T.PMREMGenerator(renderer)
        const environment = await new RGBELoader().loadAsync(
          "/workout-studio/studio-reflections.hdr"
        )
        if (dead) {
          environment.dispose()
          pmrem.dispose()
          renderer.dispose()
          renderer.domElement.remove()
          return
        }
        const envMap = pmrem.fromEquirectangular(environment)
        scene.environment = envMap.texture
        scene.environmentIntensity = 0.65
        environment.dispose()
        pmrem.dispose()
        function spot(x: number, z: number, color: number, power: number) {
          const lamp = new T.SpotLight(color, power, 15, Math.PI / 3.1, 0.72, 2)
          lamp.position.set(x, 4.3, z)
          lamp.target.position.set(x, 0.35, z - 1)
          lamp.layers.set(1)
          lamp.castShadow = false
          scene.add(lamp, lamp.target)
          return lamp
        }
        const key = spot(-2, -2.4, 0xd4e2ff, 170)
        key.castShadow = true
        key.shadow.mapSize.set(2048, 2048)
        key.shadow.camera.near = 0.2
        key.shadow.camera.far = 15
        key.shadow.bias = -0.00015
        key.shadow.normalBias = 0.012
        key.shadow.radius = 3
        spot(4, -3.7, 0xffd4a5, 65)
        const fill = new T.PointLight(0xd7e6ff, 12, 12, 2)
        fill.position.set(-0.8, 3, 2)
        fill.layers.set(1)
        scene.add(fill)
        const rim = new T.PointLight(0x176aff, 85, 10, 2)
        rim.position.set(0, 4.2, -6.1)
        rim.layers.set(1)
        scene.add(rim)
        // This practical light travels along the real ceiling track while Jev
        // works. There is no HUD spinner or floating equipment.
        const working = new T.PointLight(0xeac795, 0, 7, 2)
        working.position.set(-3, 3.9, -3)
        scene.add(working)
        let room: InstanceType<typeof T.Group> | undefined
        let disposed = false
        let clockHand: InstanceType<typeof T.Object3D> | undefined
        let frame = 0
        let isVisible = true
        const motion = matchMedia("(prefers-reduced-motion: reduce)")
        let last = performance.now()
        let lastRender = 0
        let busyBlend = 0
        let movement = 0
        let previousStation = ""
        let previousDuration: string | undefined
        let previousProgress = -1
        let ledProgress = 0
        const leds: InstanceType<typeof T.MeshStandardMaterial>[] = []
        const ledHalos: InstanceType<typeof T.MeshBasicMaterial>[] = []
        // A small additive glow attached to each diffuser, with depth testing.
        // It costs ten quads instead of a full-screen bloom pass.
        const glowCanvas = document.createElement("canvas")
        glowCanvas.width = 128
        glowCanvas.height = 64
        const glowContext = glowCanvas.getContext("2d")!
        glowContext.scale(1, 0.5)
        const glow = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64)
        glow.addColorStop(0, "rgba(35,125,255,0.9)")
        glow.addColorStop(0.25, "rgba(12,85,255,0.55)")
        glow.addColorStop(1, "rgba(0,50,255,0)")
        glowContext.fillStyle = glow
        glowContext.fillRect(0, 0, 128, 128)
        const glowMap = new T.CanvasTexture(glowCanvas)
        glowMap.colorSpace = T.SRGBColorSpace
        let settled = false
        const resize = new ResizeObserver(() => {
          camera.aspect =
            element.clientWidth / Math.max(1, element.clientHeight)
          // Maintain the room's human scale across portrait and landscape.
          camera.fov = 54
          camera.updateProjectionMatrix()
          renderer.setSize(element.clientWidth, element.clientHeight)
          settled = false
        })
        resize.observe(element)
        const visibility = new IntersectionObserver((entries) => {
          isVisible = entries[0].isIntersecting
          settled = false
        })
        visibility.observe(element)
        const invalidate = () => {
          settled = false
        }
        document.addEventListener("visibilitychange", invalidate)
        motion.addEventListener("change", invalidate)
        const disposeRoom = (object: InstanceType<typeof T.Group>) => {
          const materials = new Set<InstanceType<typeof T.Material>>()
          const textures = new Set<InstanceType<typeof T.Texture>>()
          object.traverse((child) => {
            if (!(child instanceof T.Mesh)) return
            child.geometry.dispose()
            for (const material of Array.isArray(child.material)
              ? child.material
              : [child.material]) {
              materials.add(material)
              Object.values(material).forEach((value) => {
                if (value instanceof T.Texture) textures.add(value)
              })
            }
          })
          materials.forEach((value) => value.dispose())
          textures.forEach((value) => value.dispose())
        }
        cleanup = () => {
          disposed = true
          cancelAnimationFrame(frame)
          resize.disconnect()
          visibility.disconnect()
          document.removeEventListener("visibilitychange", invalidate)
          motion.removeEventListener("change", invalidate)
          if (room) disposeRoom(room)
          scene.traverse((object) => {
            if (object instanceof T.Light) object.dispose()
          })
          envMap.dispose()
          glowMap.dispose()
          renderer.dispose()
          renderer.domElement.remove()
        }
        const contextLost = (event: Event) => {
          event.preventDefault()
          if (!dead) {
            setReady(false)
            setFailed(true)
          }
          cleanup()
        }
        renderer.domElement.addEventListener("webglcontextlost", contextLost, {
          once: true,
        })
        try {
          const gltf = await new GLTFLoader().loadAsync(
            "/workout-studio/studio.glb"
          )
          if (dead || disposed) {
            disposeRoom(gltf.scene)
            return
          }
          room = gltf.scene
          for (let i = 0; i < 10; i++) {
            const led = room.getObjectByName(`ProgressLED_${i}`)
            if (
              led instanceof T.Mesh &&
              led.material instanceof T.MeshStandardMaterial
            ) {
              led.material.toneMapped = false
              led.material.emissive.setRGB(0.008, 0.18, 1)
              leds.push(led.material)
              const haloMaterial = new T.MeshBasicMaterial({
                map: glowMap,
                transparent: true,
                opacity: 0.12,
                blending: T.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
              })
              const halo = new T.Mesh(new T.PlaneGeometry(1.55, 0.58), haloMaterial)
              room.updateMatrixWorld(true)
              const bounds = new T.Box3().setFromObject(led)
              bounds.getCenter(halo.position)
              halo.position.z = bounds.max.z + 0.012
              halo.name = `LEDGlow_${i}`
              room.add(halo)
              ledHalos.push(haloMaterial)
            }
          }
          room.traverse((child) => {
            if (child instanceof T.Mesh) {
              child.layers.enable(1)
              child.castShadow = !/^(ProgressLED_|LEDGlow_|ClockMinute)/.test(child.name)
              child.receiveShadow = true
              const materials = Array.isArray(child.material)
                ? child.material
                : [child.material]
              for (const material of materials) {
                if (material instanceof T.MeshStandardMaterial) {
                  for (const texture of [
                    material.map,
                    material.normalMap,
                    material.roughnessMap,
                  ]) {
                    if (texture)
                      texture.anisotropy = Math.min(
                        4,
                        renderer.capabilities.getMaxAnisotropy()
                      )
                  }
                }
                if (
                  material instanceof T.MeshStandardMaterial &&
                  material.userData.studioLightmap &&
                  material.emissiveMap
                ) {
                  material.lightMap = material.emissiveMap
                  material.lightMapIntensity = material.userData.studioLightmap
                  material.emissiveMap = null
                  material.emissive.set(0)
                  material.envMapIntensity = 0.04
                } else child.layers.set(1)
              }
            }
          })
          clockHand = room.getObjectByName("ClockMinute")
          if (clockHand) {
            const pivot = new T.Group()
            pivot.position.set(0.5, 2.65, -6.637)
            room.add(pivot)
            room.updateMatrixWorld(true)
            pivot.attach(clockHand)
            clockHand = pivot
          }
          scene.add(room)
          camera.lookAt(aim)
          renderer.render(scene, camera)
          setReady(true)
          element.dataset.ready = "true"
        } catch {
          if (!dead) setFailed(true)
          cleanup()
          return
        }
        function draw(now: number) {
          frame = requestAnimationFrame(draw)
          if (!isVisible || document.hidden) {
            last = now
            return
          }
          // Follow display refresh, up to 60fps, without a 30fps quantization stall.
          if (now - lastRender < 1000 / 60 - 1) return
          const dt = Math.min((now - last) / 1000, 0.06)
          last = now
          const state = current.current
          const station = studioStation(state)
          const shot = SHOTS[station]
          const busyGoal = state.busy ? 1 : 0
          const changed =
            station !== previousStation ||
            state.answers.duration !== previousDuration ||
            state.progress !== previousProgress
          if (changed) {
            previousStation = station
            previousDuration = state.answers.duration
            previousProgress = state.progress
            settled = false
          }
          desiredEye.fromArray(shot.eye)
          desiredAim.fromArray(shot.look)
          // Keep the bright ceiling strip above the first portrait heading.
          if (camera.aspect < 1 && station === "overview") desiredAim.y -= 0.35
          busyBlend = T.MathUtils.damp(busyBlend, busyGoal, 3.5, dt)
          if (state.busy || busyBlend > 0.002) {
            movement += dt * 0.36
            if (!motion.matches) {
              desiredEye.x += Math.sin(movement) * 0.32 * busyBlend
              desiredEye.z += Math.cos(movement) * 0.16 * busyBlend
              working.position.x = Math.sin(movement * 1.4) * 3.5
            }
            working.intensity = 55 * busyBlend
            if (!motion.matches || Math.abs(busyBlend - busyGoal) > 0.003)
              settled = false
          }
          const alpha = motion.matches ? 1 : 1 - Math.exp(-6 * dt)
          ledProgress = motion.matches
            ? state.progress
            : T.MathUtils.damp(
                ledProgress,
                Math.max(0, Math.min(1, state.progress)),
                4,
                dt
              )
          const ledMoving = Math.abs(ledProgress - state.progress) > 0.001
          if (ledMoving) settled = false
          leds.forEach((material, index) => {
            const filled = T.MathUtils.clamp(ledProgress * 10 - index, 0, 1)
            const pulse =
              state.busy && !motion.matches
                ? (Math.sin(movement * 9 - index * 0.55) + 1) * 0.35
                : 0
            material.emissiveIntensity = 0.9 + filled * 2.2 + pulse
            ledHalos[index].opacity = 0.5 + filled * 0.5 + pulse * 0.2
          })
          const distance =
            camera.position.distanceTo(desiredEye) + aim.distanceTo(desiredAim)
          if (!settled || distance > 0.001) {
            camera.position.lerp(desiredEye, alpha)
            aim.lerp(desiredAim, alpha)
            camera.lookAt(aim)
            let handDistance = 0
            if (clockHand) {
              const parsedMinutes = Number.parseInt(
                (state.answers.duration ?? "45").replace(/^Custom: /, "")
              )
              const minutes = Number.isFinite(parsedMinutes)
                ? parsedMinutes
                : 45
              const delta = -(minutes / 60) * Math.PI * 2 - clockHand.rotation.z
              const shortest = Math.atan2(Math.sin(delta), Math.cos(delta))
              handDistance = Math.abs(shortest)
              clockHand.rotation.z += shortest * alpha
            }
            renderer.render(scene, camera)
            lastRender = now
            settled =
              !ledMoving &&
              distance < 0.001 &&
              handDistance < 0.002 &&
              (motion.matches
                ? Math.abs(busyBlend - busyGoal) < 0.003
                : !state.busy && busyBlend < 0.002)
            element.dataset.station = station
            element.dataset.busy = String(state.busy)
            element.dataset.progress = String(state.progress)
            element.dataset.leds = String(leds.length)
          }
        }
        frame = requestAnimationFrame(draw)
      })
      .catch(() => {
        if (!dead) setFailed(true)
        cleanup()
      })
    return () => {
      dead = true
      cleanup()
    }
  }, [])
  return (
    <div className="studio-background" aria-hidden="true" data-failed={failed}>
      <img
        className="studio-poster"
        src="/workout-studio/studio-poster.webp"
        alt=""
      />
      <div className={`studio-canvas ${ready ? "is-ready" : ""}`} ref={host} />
    </div>
  )
}
