import { useEffect, useRef, useState } from "react"

export type OnboardingRoom = "overview" | "nutrition" | "recovery" | "planning"
type Props = { room: OnboardingRoom; progress: number; busy: boolean }
const centers: Record<OnboardingRoom, number> = {
  overview: 0,
  nutrition: 13,
  recovery: 26,
  planning: 39,
}

/** A separate onboarding pavilion. No workout-room models or textures. */
export function OnboardingScene(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const state = useRef(props)
  state.current = props
  const wake = useRef(() => {})
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    wake.current()
  }, [props.room, props.progress, props.busy])
  useEffect(() => {
    let dead = false
    let dispose = () => {}
    void Promise.all([
      import("three"),
      import("three/addons/loaders/RGBELoader.js"),
      import("three/addons/loaders/GLTFLoader.js"),
    ])
      .then(async ([T, { RGBELoader }, { GLTFLoader }]) => {
        if (dead || !host.current) return
        const el = host.current
        const renderer = new T.WebGLRenderer({
          antialias: true,
          powerPreference: "low-power",
        })
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25))
        renderer.outputColorSpace = T.SRGBColorSpace
        renderer.toneMapping = T.ACESFilmicToneMapping
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = T.PCFSoftShadowMap
        renderer.shadowMap.autoUpdate = false
        el.appendChild(renderer.domElement)
        dispose = () => {
          renderer.dispose()
          renderer.domElement.remove()
        }
        const scene = new T.Scene()
        const camera = new T.PerspectiveCamera(49, 1, 0.1, 100)
        const pmrem = new T.PMREMGenerator(renderer)
        const environment = await new RGBELoader().loadAsync(
          "/onboarding-pavilion/forest.hdr"
        )
        if (dead) {
          environment.dispose()
          pmrem.dispose()
          dispose()
          return
        }
        const env = pmrem.fromEquirectangular(environment)
        dispose = () => {
          environment.dispose()
          env.dispose()
          renderer.dispose()
          renderer.domElement.remove()
        }
        scene.environment = env.texture
        scene.background = environment
        scene.backgroundRotation.y = 0.75
        scene.environmentRotation.y = 0.75
        pmrem.dispose()
        const materials = new Set<InstanceType<typeof T.MeshStandardMaterial>>()
        const textures = new Set<InstanceType<typeof T.Texture>>()
        const gltf = await new GLTFLoader().loadAsync(
          "/onboarding-pavilion/pavilion.glb"
        )
        const model = gltf.scene
        const byName = new Map<
          string,
          InstanceType<typeof T.MeshStandardMaterial>
        >()
        model.traverse((object) => {
          if (!(object instanceof T.Mesh)) return
          object.castShadow = !object.name.startsWith("PavilionLED_")
          object.receiveShadow = true
          for (const m of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            if (!(m instanceof T.MeshStandardMaterial)) continue
            if (m.name === "Pavilion architectural glass") object.castShadow = false
            materials.add(m)
            byName.set(m.name, m)
            if (m.userData.pavilionContactAO && m.aoMap) {
              m.aoMapIntensity = 1.2
            }
            for (const value of Object.values(m))
              if (value instanceof T.Texture) {
                value.anisotropy = Math.min(
                  4,
                  renderer.capabilities.getMaxAnisotropy()
                )
                textures.add(value)
              }
          }
        })
        if (dead) {
          model.traverse((o) => {
            if (o instanceof T.Mesh) o.geometry.dispose()
          })
          materials.forEach((m) => m.dispose())
          textures.forEach((t) => t.dispose())
          environment.dispose()
          env.dispose()
          renderer.dispose()
          renderer.domElement.remove()
          return
        }
        scene.add(model)
        const find = (name: string) => byName.get(`Pavilion ${name}`)!
        const limestone = find("limestone"),
          plaster = find("plaster"),
          linen = find("linen"),
          accent = find("accent"),
          glow = find("screen glow")
        const leds = Array.from({ length: 40 }, (_, i) => find(`LED ${i}`))
        leds.forEach((m) => {
          m.toneMapped = false
        })
        const sky = new T.HemisphereLight(0xddeaff, 0x77715d, 2)
        scene.add(sky)
        const sun = new T.DirectionalLight(0xffedcd, 3)
        sun.castShadow = true
        sun.shadow.mapSize.set(2048, 2048)
        sun.shadow.camera.left = -9
        sun.shadow.camera.right = 9
        sun.shadow.camera.top = 9
        sun.shadow.camera.bottom = -9
        sun.shadow.camera.near = 0.1
        sun.shadow.camera.far = 40
        sun.shadow.normalBias = 0.006
        sun.shadow.bias = -0.0001
        scene.add(sun, sun.target)
        const practical = new T.PointLight(0x90bda4, 20, 12, 2)
        scene.add(practical)
        const key = new T.SpotLight(0xffd5a6, 85, 13, Math.PI / 3, 0.6, 2)
        key.castShadow = true
        key.shadow.mapSize.set(1024, 1024)
        key.shadow.normalBias = 0.004
        key.shadow.bias = -0.0001
        key.shadow.camera.near = 0.1
        key.shadow.camera.far = 15
        scene.add(key, key.target)
        let frame = 0,
          last = 0,
          dirty = true,
          visible = true,
          currentRoom = "",
          renderedTheme = ""
        let day = document.documentElement.classList.contains("dark") ? 0 : 1,
          dayTarget = day,
          progress = state.current.progress
        const tint = new T.Color(0x90bda4),
          tintTarget = tint.clone()
        const aim = new T.Vector3(),
          desiredAim = new T.Vector3(),
          desiredEye = new T.Vector3()
        const reduced = matchMedia("(prefers-reduced-motion: reduce)")
        function target() {
          const x = centers[state.current.room],
            portrait = el.clientWidth <= 700
          desiredEye.set(
            x - (portrait ? 0.5 : 2.2),
            portrait ? 2.65 : 2.3,
            portrait ? 5.8 : 5
          )
          desiredAim.set(x + 1.8, portrait ? 0.72 : 1.2, -2.1)
        }
        function schedule() {
          dirty = true
          if (!frame && !dead) {
            last = 0
            frame = requestAnimationFrame(draw)
          }
        }
        wake.current = schedule
        function readTheme() {
          dayTarget = document.documentElement.classList.contains("dark")
            ? 0
            : 1
          // Canvas resolves the app's CSS color syntax, including OKLCH tokens.
          const probe = document.createElement("span")
          probe.style.color = "var(--accent-workout, #659485)"
          document.body.appendChild(probe)
          const css = getComputedStyle(probe).color
          probe.remove()
          const c = document.createElement("canvas").getContext("2d")!
          c.fillStyle = css
          c.fillRect(0, 0, 1, 1)
          const pixel = c.getImageData(0, 0, 1, 1).data
          tintTarget.setRGB(
            pixel[0]! / 255,
            pixel[1]! / 255,
            pixel[2]! / 255,
            T.SRGBColorSpace
          )
          schedule()
        }
        const themeObserver = new MutationObserver(readTheme)
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class", "style", "data-visual-identity"],
        })
        const resize = new ResizeObserver(() => {
          camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1)
          camera.updateProjectionMatrix()
          renderer.setSize(el.clientWidth, el.clientHeight)
          target()
          schedule()
        })
        resize.observe(el)
        const intersection = new IntersectionObserver((entries) => {
          visible = entries[0]!.isIntersecting
          if (visible) schedule()
        })
        intersection.observe(el)
        const visibility = () => {
          if (!document.hidden) schedule()
        }
        document.addEventListener("visibilitychange", visibility)
        reduced.addEventListener("change", schedule)
        camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1)
        target()
        camera.position.copy(desiredEye)
        aim.copy(desiredAim)
        function draw(now: number) {
          frame = 0
          if (dead || !visible || document.hidden) return
          if (last && now - last < 1000 / 60 - 1) {
            frame = requestAnimationFrame(draw)
            return
          }
          const dt = Math.min((now - (last || now - 16)) / 1000, 0.25)
          last = now
          target()
          if (currentRoom !== state.current.room) {
            currentRoom = state.current.room
            const x = centers[state.current.room]
            sun.position.set(x - 3, 10, 4)
            sun.target.position.set(x + 1, 0, -2)
            practical.position.set(x + 1, 4.6, -2)
            key.position.set(x + 2, 4.3, 0.2)
            key.target.position.set(x + 1.8, 0, -2)
            renderer.shadowMap.needsUpdate = true
          }
          const a = reduced.matches ? 1 : 1 - Math.exp(-3 * dt)
          camera.position.lerp(desiredEye, a)
          aim.lerp(desiredAim, a)
          camera.lookAt(aim)
          day = T.MathUtils.lerp(day, dayTarget, a)
          tint.lerp(tintTarget, a)
          progress = T.MathUtils.lerp(progress, state.current.progress, a)
          scene.backgroundIntensity = 0.035 + day * 0.715
          scene.environmentIntensity = 0.18 + day * 0.42
          sky.intensity = 0.08 + day * 0.12
          sun.intensity = 0.75 + day * 1.6
          sun.color.set(0xa9bedb).lerp(new T.Color(0xffddae), day)
          key.intensity = 55 - day * 20
          renderer.toneMappingExposure = 0.9
          // Scan albedo carries actual grain and variation; do not replace it
          // with flat day/night paint. Light sources determine the appearance.
          limestone.color.set(0xffffff)
          plaster.color.set(0xffffff)
          linen.color.set(0xffffff)
          accent.color.copy(tint)
          glow.emissive.copy(tint)
          glow.emissiveIntensity = 0.5
          practical.color.copy(tint)
          practical.intensity = 25 - day * 15
          leds.forEach((m, i) => {
            m.color.copy(tint)
            m.emissive.copy(tint)
            m.emissiveIntensity =
              0.25 +
              Math.max(0, Math.min(1, progress * 10 - (i % 10))) * (2.2 - day) +
              (state.current.busy && !reduced.matches
                ? (Math.sin(now / 250 - (i % 10)) + 1) * 0.4
                : 0)
          })
          renderer.render(scene, camera)
          el.dataset.ready = "true"
          el.dataset.station = state.current.room
          el.dataset.leds = "40"
          el.dataset.appearance = dayTarget ? "light" : "dark"
          el.dataset.identity =
            document.documentElement.dataset.visualIdentity ?? "onerep"
          el.dataset.progress = String(state.current.progress)
          el.dataset.accent = tintTarget.getHexString()
          const moving =
            camera.position.distanceTo(desiredEye) +
              aim.distanceTo(desiredAim) >
              0.002 ||
            Math.abs(day - dayTarget) > 0.001 ||
            Math.abs(tint.r - tintTarget.r) +
              Math.abs(tint.g - tintTarget.g) +
              Math.abs(tint.b - tintTarget.b) >
              0.003 ||
            Math.abs(progress - state.current.progress) > 0.001
          const themeKey = `${dayTarget}:${el.dataset.identity}`
          if (renderedTheme !== themeKey) {
            renderedTheme = themeKey
            dirty = true
          }
          if (moving || (state.current.busy && !reduced.matches) || dirty) {
            dirty = false
            frame = requestAnimationFrame(draw)
          }
        }
        const lose = (event: Event) => {
          event.preventDefault()
          setFailed(true)
          dispose()
        }
        renderer.domElement.addEventListener("webglcontextlost", lose, {
          once: true,
        })
        dispose = () => {
          cancelAnimationFrame(frame)
          wake.current = () => {}
          resize.disconnect()
          intersection.disconnect()
          themeObserver.disconnect()
          document.removeEventListener("visibilitychange", visibility)
          reduced.removeEventListener("change", schedule)
          scene.traverse((o) => {
            if (o instanceof T.Mesh) o.geometry.dispose()
          })
          materials.forEach((m) => m.dispose())
          textures.forEach((t) => t.dispose())
          sun.dispose()
          key.dispose()
          environment.dispose()
          environment.dispose()
          env.dispose()
          renderer.dispose()
          renderer.domElement.remove()
        }
        readTheme()
        schedule()
      })
      .catch(() => {
        if (!dead) setFailed(true)
        dispose()
      })
    return () => {
      dead = true
      dispose()
    }
  }, [])
  return (
    <div
      className="onboarding-pavilion"
      aria-hidden="true"
      data-failed={failed}
    >
      <div className="studio-canvas" ref={host} />
    </div>
  )
}
