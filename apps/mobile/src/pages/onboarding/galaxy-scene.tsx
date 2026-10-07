import { useEffect, useRef, useState } from "react"

export const GALAXY_TEXTURE = "/onboarding-galaxy/deep-space.webp"

/** Photographic galactic dust behind a perspective star field and arrival trails. */
type GalaxyView = {
  still: boolean
  speed: number
  zoom: number
  look: { x: number; y: number }
}

export function GalaxyScene(view: GalaxyView) {
  const { still, speed, zoom: targetZoom, look } = view
  const host = useRef<HTMLDivElement>(null)
  const motion = useRef(view)
  const wake = useRef(() => {})
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    motion.current = { still, speed, zoom: targetZoom, look }
    wake.current()
  }, [still, speed, targetZoom, look])

  useEffect(() => {
    let disposed = false
    let stopped = false
    let cleanup = () => {}
    void import("three")
      .then(async (T) => {
        if (disposed || !host.current) return
        const el = host.current
        const renderer = new T.WebGLRenderer({
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
        renderer.outputColorSpace = T.SRGBColorSpace
        el.appendChild(renderer.domElement)
        cleanup = () => {
          renderer.dispose()
          renderer.domElement.remove()
        }
        const scene = new T.Scene()
        const camera = new T.PerspectiveCamera(58, 1, 0.1, 600)
        const geometry = new T.BufferGeometry()
        const count = 2400
        const positions = new Float32Array(count * 3)
        const colors = new Float32Array(count * 3)
        const sizes = new Float32Array(count)
        // Seeded coordinates keep the composition stable on remount.
        let seed = 72
        const random = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0
          return seed / 4294967296
        }
        for (let i = 0; i < count; i++) {
          positions.set(
            [
              (random() - 0.5) * 330,
              (random() - 0.5) * 330,
              random() * 220 - 150,
            ],
            i * 3
          )
          const warm = random() > 0.7
          colors.set(
            warm
              ? [1, 0.83, 0.63]
              : [0.7 + random() * 0.3, 0.83 + random() * 0.17, 1],
            i * 3
          )
          sizes[i] = 0.35 + Math.pow(random(), 5) * 1.8
        }
        geometry.setAttribute("position", new T.BufferAttribute(positions, 3))
        geometry.setAttribute("color", new T.BufferAttribute(colors, 3))
        geometry.setAttribute("size", new T.BufferAttribute(sizes, 1))
        const material = new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          vertexColors: true,
          blending: T.AdditiveBlending,
          uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
          vertexShader: `attribute float size; varying vec3 tint; uniform float pixelRatio;
          void main() { tint = color; vec4 p = modelViewMatrix * vec4(position, 1.);
          gl_Position = projectionMatrix * p; gl_PointSize = clamp(size * 110. / max(8., -p.z), 0.8, 6.) * pixelRatio; }`,
          fragmentShader: `varying vec3 tint;
          void main() { float d = length(gl_PointCoord - .5) * 2.;
          float core = exp(-d * d * 13.); float glow = exp(-d * d * 4.) * .16;
          gl_FragColor = vec4(tint, (core + glow) * smoothstep(1., .65, d)); }`,
        })
        scene.add(new T.Points(geometry, material))
        const trails = new Float32Array(420 * 6)
        for (let i = 0; i < 420; i++) {
          const j = i * 3
          trails.set(
            [
              positions[j]!,
              positions[j + 1]!,
              positions[j + 2]!,
              positions[j]!,
              positions[j + 1]!,
              positions[j + 2]! - 9,
            ],
            i * 6
          )
        }
        const trailGeometry = new T.BufferGeometry()
        trailGeometry.setAttribute("position", new T.BufferAttribute(trails, 3))
        const trailMaterial = new T.LineBasicMaterial({
          color: 0xbfdcff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: T.AdditiveBlending,
        })
        scene.add(new T.LineSegments(trailGeometry, trailMaterial))
        const backdropGeometry = new T.PlaneGeometry(1, 1)
        const backdropMaterial = new T.MeshBasicMaterial({ depthWrite: false })
        const backdrop = new T.Mesh(backdropGeometry, backdropMaterial)
        backdrop.position.z = -190
        scene.add(backdrop)
        const assets: { texture?: InstanceType<typeof T.Texture> } = {}
        let frame = 0,
          last = 0,
          elapsed = 0,
          velocity = 0,
          zoom = 1
        const aim = new T.Vector3(0, 0, -190)
        const targetAim = new T.Vector3()
        let loaded = false
        const draw = (now: number) => {
          frame = 0
          if (disposed || stopped || document.hidden || !loaded) return
          if (last && now - last < 1000 / 30) {
            frame = requestAnimationFrame(draw)
            return
          }
          const dt = last ? Math.min((now - last) / 1000, 0.06) : 0
          last = now
          const current = motion.current
          if (!current.still) elapsed += dt
          else elapsed = Math.max(elapsed, 3.2)
          const easing = current.still ? 1 : 1 - Math.exp(-3 * dt)
          velocity = T.MathUtils.lerp(
            velocity,
            current.still ? 0 : current.speed * 14,
            easing
          )
          zoom = T.MathUtils.lerp(zoom, current.zoom, easing)
          camera.fov = 58 / zoom
          camera.updateProjectionMatrix()
          // A fast entrance eases into a very slow orbital drift.
          const travel = current.still
            ? 1
            : 1 - Math.pow(1 - Math.min(elapsed / 3.2, 1), 4)
          camera.position.set(
            Math.sin(elapsed * 0.07) * 1.8,
            Math.sin(elapsed * 0.05) * 0.9,
            76 * (1 - travel) + 8
          )
          targetAim.set(current.look.x * 22, current.look.y * 22, -190)
          aim.lerp(targetAim, easing)
          camera.lookAt(aim)
          const extent =
            (2 *
              Math.tan(T.MathUtils.degToRad(29)) *
              (camera.position.z + 190) *
              1.16) /
            Math.min(zoom, 1)
          backdrop.scale.setScalar(extent * Math.max(1, camera.aspect))
          for (let i = 0; i < count; i++) {
            const j = i * 3
            positions[j + 2] += velocity * dt
            if (positions[j + 2]! > camera.position.z + 5)
              positions[j + 2] = -150
            if (i < 420) {
              const k = i * 6
              trails[k] = trails[k + 3] = positions[j]!
              trails[k + 1] = trails[k + 4] = positions[j + 1]!
              trails[k + 2] = positions[j + 2]!
              trails[k + 5] =
                positions[j + 2]! - 2 - velocity * 0.25 - (1 - travel) * 9
            }
          }
          geometry.attributes.position!.needsUpdate = true
          trailGeometry.attributes.position!.needsUpdate = true
          trailMaterial.opacity = current.still
            ? 0
            : Math.pow(1 - travel, 1.5) * 0.42 + (velocity / 42) * 0.18
          renderer.render(scene, camera)
          el.dataset.ready = "true"
          el.dataset.speed = velocity.toFixed(2)
          el.dataset.zoom = zoom.toFixed(2)
          el.dataset.look = `${aim.x.toFixed(2)},${aim.y.toFixed(2)}`
          const settling =
            Math.abs(zoom - current.zoom) > 0.001 ||
            aim.distanceTo(targetAim) > 0.01
          if (
            !current.still &&
            (current.speed > 0 || velocity > 0.01 || elapsed < 3.2 || settling)
          )
            frame = requestAnimationFrame(draw)
        }
        const schedule = () => {
          if (!frame && !disposed && !stopped && !document.hidden) {
            last = 0
            frame = requestAnimationFrame(draw)
          }
        }
        wake.current = schedule
        const resize = new ResizeObserver(() => {
          const width = el.clientWidth,
            height = Math.max(el.clientHeight, 1)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height)
          schedule()
        })
        resize.observe(el)
        const visibility = () => {
          cancelAnimationFrame(frame)
          frame = 0
          last = 0
          if (!document.hidden) schedule()
        }
        const lost = (event: Event) => {
          event.preventDefault()
          setFailed(true)
          cleanup()
        }
        renderer.domElement.addEventListener("webglcontextlost", lost)
        document.addEventListener("visibilitychange", visibility)
        cleanup = () => {
          stopped = true
          cancelAnimationFrame(frame)
          wake.current = () => {}
          resize.disconnect()
          document.removeEventListener("visibilitychange", visibility)
          renderer.domElement.removeEventListener("webglcontextlost", lost)
          geometry.dispose()
          material.dispose()
          trailGeometry.dispose()
          trailMaterial.dispose()
          backdropGeometry.dispose()
          backdropMaterial.dispose()
          assets.texture?.dispose()
          renderer.dispose()
          renderer.domElement.remove()
        }
        const texture = await new T.TextureLoader().loadAsync(GALAXY_TEXTURE)
        assets.texture = texture
        if (disposed || stopped) {
          texture.dispose()
          return
        }
        texture.colorSpace = T.SRGBColorSpace
        backdropMaterial.map = texture
        backdropMaterial.needsUpdate = true
        loaded = true
        schedule()
      })
      .catch(() => {
        cleanup()
        if (!disposed) setFailed(true)
      })
    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  return (
    <div className="galaxy-scene" aria-hidden="true" data-failed={failed}>
      <div className="galaxy-canvas" ref={host} />
    </div>
  )
}
