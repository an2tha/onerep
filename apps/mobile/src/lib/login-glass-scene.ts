import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"

/** A hand-shaped, closed glass contour, with asymmetric shoulders and depth. */
class FoldedContour extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super()
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2
    const shoulder = 1 + 0.13 * Math.sin(3 * a + 0.4)
    return target.set(
      Math.cos(a) * shoulder,
      Math.sin(a) * shoulder * 1.22,
      0.28 * Math.sin(2 * a) + 0.1 * Math.cos(3 * a)
    )
  }
}

export function mountLoginGlass(host: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.transmissionResolutionScale = 0.75
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = "login-glass-canvas"
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50)
  camera.position.set(0, 0.1, 8.5)
  camera.lookAt(0, 0, 0)
  const createEnvironment = () => {
    const environment = new RoomEnvironment()
    // Broad studio sources produce long highlights across clear glass.
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    )
    card.position.set(-3, 2, 3)
    card.lookAt(0, 0, 0)
    environment.add(card)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const map = pmrem.fromScene(environment, 0.025)
    environment.dispose()
    pmrem.dispose()
    return map
  }
  let environmentMap = createEnvironment()
  scene.environment = environmentMap.texture

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.09,
    transmission: 1,
    thickness: 0.85,
    ior: 1.46,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    attenuationDistance: 4,
    envMapIntensity: 1.8,
  })
  const satinGlass = glass.clone()
  satinGlass.roughness = 0.17
  satinGlass.thickness = 1.2
  const sculpture = new THREE.Group()
  scene.add(sculpture)

  const contour = new THREE.TubeGeometry(
    new FoldedContour(),
    160,
    0.3,
    28,
    true
  )
  const outer = new THREE.Mesh(contour, glass)
  outer.rotation.set(0.22, -0.3, -0.46)
  outer.position.set(-0.26, 0.35, 0)
  sculpture.add(outer)
  const inner = new THREE.Mesh(contour, satinGlass)
  inner.scale.setScalar(0.76)
  inner.rotation.set(-0.22, 1.12, 0.65)
  inner.position.set(0.42, -0.6, 0.32)
  sculpture.add(inner)

  const pebbleGeometry = new THREE.SphereGeometry(0.36, 40, 32)
  const pebble = new THREE.Mesh(pebbleGeometry, glass)
  pebble.scale.set(1.1, 0.76, 0.9)
  pebble.position.set(-1.45, -1.44, 0.3)
  pebble.rotation.z = -0.45
  sculpture.add(pebble)
  const bead = new THREE.Mesh(pebbleGeometry, satinGlass)
  bead.scale.setScalar(0.44)
  bead.position.set(1.43, 1.38, -0.15)
  sculpture.add(bead)

  const reduced = matchMedia("(prefers-reduced-motion: reduce)")
  let frame = 0
  let disposed = false
  let visible = true
  let contextLost = false
  let paused = false
  let elapsed = 0
  let lastTime = 0
  let targetX = 0
  let targetY = 0
  let rotationX = 0
  let rotationY = 0
  let velocityX = 0
  let velocityY = 0
  let impulse = 0
  const interactionRoot = host.closest<HTMLElement>(".login-welcome") ?? host

  // Visible-time clock and a 30fps budget keep the glass fluid without running
  // transmission passes at the screen's full refresh rate.
  const draw = (now: number) => {
    frame = 0
    if (disposed || !visible || document.hidden || contextLost) {
      lastTime = 0
      return
    }
    const moving = !paused && !reduced.matches
    if (moving && lastTime && now - lastTime < 1000 / 30) {
      frame = requestAnimationFrame(draw)
      return
    }
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 1 / 30
    lastTime = now
    if (moving) {
      elapsed += dt
      const damping = Math.exp(-7 * dt)
      velocityX = (velocityX + (targetX - rotationX) * 38 * dt) * damping
      velocityY = (velocityY + (targetY - rotationY) * 38 * dt) * damping
      rotationX += velocityX * dt
      rotationY += velocityY * dt
      impulse *= Math.exp(-3 * dt)
    }
    const t = reduced.matches ? 0 : elapsed
    const breath = Math.sin(t * 0.85)
    sculpture.rotation.set(
      rotationX + Math.sin(t * 0.42) * 0.12,
      rotationY + Math.sin(t * 0.31) * 0.22,
      Math.sin(t * 0.38) * 0.045
    )
    sculpture.position.y = Math.sin(t * 0.65) * 0.1
    outer.position.set(
      -0.26 + Math.sin(t * 0.51) * 0.09,
      0.35 + breath * 0.1,
      0
    )
    outer.rotation.set(
      0.22 + Math.sin(t * 0.58) * 0.18,
      -0.3 + Math.sin(t * 0.4) * 0.27,
      -0.46 + Math.sin(t * 0.48) * 0.08
    )
    outer.scale.set(
      1 + breath * 0.025 + impulse,
      1 - breath * 0.018 - impulse * 0.4,
      1
    )
    inner.position.set(
      0.42 + Math.sin(t * 0.6) * 0.13,
      -0.6 - Math.sin(t * 0.73) * 0.16,
      0.32 + Math.sin(t * 0.44) * 0.14
    )
    inner.rotation.set(
      -0.22 + Math.sin(t * 0.61) * 0.23,
      1.12 + t * 0.16,
      0.65 - Math.sin(t * 0.46) * 0.16
    )
    pebble.position.set(
      -1.45 + Math.sin(t * 0.57) * 0.15,
      -1.44 + Math.sin(t * 0.8) * 0.19,
      0.3 + Math.sin(t * 0.39) * 0.2
    )
    pebble.rotation.set(t * 0.17, t * 0.22, -0.45)
    bead.position.set(
      1.43 + Math.sin(t * 0.67) * 0.12,
      1.38 + Math.sin(t * 0.91) * 0.16,
      -0.15 + Math.sin(t * 0.52) * 0.16
    )
    scene.environmentRotation.y = Math.sin(t * 0.18) * 0.2
    renderer.render(scene, camera)
    host.dataset.state = "ready"
    host.dataset.motion = moving ? "running" : "paused"
    if (moving) frame = requestAnimationFrame(draw)
  }
  const requestDraw = () => {
    if (!disposed && !frame && !contextLost && visible && !document.hidden) {
      frame = requestAnimationFrame(draw)
    }
  }
  const setPaused = (next: boolean) => {
    paused = next
    lastTime = 0
    requestDraw()
  }
  const updateTheme = () => {
    const style = getComputedStyle(host)
    scene.background = new THREE.Color(
      style.getPropertyValue("--login-scene-background").trim()
    )
    const tint = new THREE.Color(
      style.getPropertyValue("--accent-training-hero").trim()
    )
    glass.attenuationColor.copy(new THREE.Color(0xffffff).lerp(tint, 0.12))
    satinGlass.attenuationColor.copy(new THREE.Color(0xffffff).lerp(tint, 0.22))
    requestDraw()
  }
  const resize = () => {
    const { width, height } = host.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.position.z = camera.aspect < 0.85 ? 9.6 : 8.5
    camera.updateProjectionMatrix()
    updateTheme()
    requestDraw()
  }
  const pointer = (event: PointerEvent) => {
    if (paused || reduced.matches || event.pointerType === "touch") return
    const bounds = interactionRoot.getBoundingClientRect()
    targetY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.65
    targetX = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.4
    requestDraw()
  }
  const resetPointer = () => {
    targetX = targetY = 0
    if (reduced.matches) {
      rotationX = rotationY = velocityX = velocityY = impulse = 0
    }
    lastTime = 0
    requestDraw()
  }
  const nudge = (event: PointerEvent) => {
    if (
      paused ||
      reduced.matches ||
      (event.target as Element).closest("button")
    )
      return
    impulse = 0.07
    velocityY += 0.8
    requestDraw()
  }
  const onVisibility = () => {
    lastTime = 0
    if (document.hidden) {
      cancelAnimationFrame(frame)
      frame = 0
    } else requestDraw()
  }
  const onContextLost = (event: Event) => {
    event.preventDefault()
    contextLost = true
    lastTime = 0
    cancelAnimationFrame(frame)
    frame = 0
    host.dataset.state = "unavailable"
  }
  const onContextRestored = () => {
    contextLost = false
    environmentMap.dispose()
    environmentMap = createEnvironment()
    scene.environment = environmentMap.texture
    updateTheme()
    resize()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  const themeObserver = new MutationObserver(updateTheme)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  })
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false
    lastTime = 0
    if (visible) requestDraw()
    else {
      cancelAnimationFrame(frame)
      frame = 0
    }
  })
  intersection.observe(host)
  interactionRoot.addEventListener("pointermove", pointer)
  interactionRoot.addEventListener("pointerleave", resetPointer)
  host.addEventListener("pointerdown", nudge)
  renderer.domElement.addEventListener("webglcontextlost", onContextLost)
  renderer.domElement.addEventListener(
    "webglcontextrestored",
    onContextRestored
  )
  document.addEventListener("visibilitychange", onVisibility)
  reduced.addEventListener("change", resetPointer)
  updateTheme()
  resize()

  const dispose = () => {
    disposed = true
    cancelAnimationFrame(frame)
    resizeObserver.disconnect()
    themeObserver.disconnect()
    intersection.disconnect()
    interactionRoot.removeEventListener("pointermove", pointer)
    interactionRoot.removeEventListener("pointerleave", resetPointer)
    host.removeEventListener("pointerdown", nudge)
    document.removeEventListener("visibilitychange", onVisibility)
    reduced.removeEventListener("change", resetPointer)
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost)
    renderer.domElement.removeEventListener(
      "webglcontextrestored",
      onContextRestored
    )
    contour.dispose()
    pebbleGeometry.dispose()
    glass.dispose()
    satinGlass.dispose()
    environmentMap.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }
  return { dispose, setPaused }
}
