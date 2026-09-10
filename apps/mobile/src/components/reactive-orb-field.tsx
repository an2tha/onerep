import { useEffect, useRef } from "react"

type ReactiveOrbFieldProps = {
  className?: string
}

type PermissionResult = "granted" | "denied"
type PermissionCapableConstructor = {
  requestPermission?: () => Promise<PermissionResult>
}

type PieceSpring = {
  element: HTMLSpanElement
  index: number
  dx: number
  dy: number
  vx: number
  vy: number
  stretch: number
  stretchVelocity: number
  rotation: number
  rotationVelocity: number
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))

const randomBetween = (minimum: number, maximum: number) =>
  minimum + Math.random() * (maximum - minimum)

/**
 * A soft, inertial background field derived from the supplied orb study.
 * It responds to pointer position, taps, scrolling, a weak pull toward the
 * live cursor, and supported device motion while remaining a static
 * illustration when reduced motion is requested. On scroll the orb trails
 * the viewport on a bouncy spring and drops below the hero — where the oil
 * takes over: a trampoline membrane plus buoyant drift slowly reject it
 * back upward while every mechanism damps down. Desktop parks the orb in
 * the hero instead.
 */
export function ReactiveOrbField({ className = "" }: ReactiveOrbFieldProps) {
  const fieldRef = useRef<HTMLSpanElement>(null)
  const stageRef = useRef<HTMLSpanElement>(null)
  const orbRef = useRef<HTMLSpanElement>(null)
  const deformerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const field = fieldRef.current
    const stage = stageRef.current
    const orb = orbRef.current
    const deformer = deformerRef.current
    const interactionRoot = field?.parentElement

    if (!field || !stage || !orb || !deformer || !interactionRoot) return

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    if (reducedMotion) return

    const pieces = Array.from(
      field.querySelectorAll<HTMLSpanElement>("[data-orb-piece]")
    ).map<PieceSpring>((element, index) => ({
      element,
      index,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      stretch: 0,
      stretchVelocity: 0,
      rotation: 0,
      rotationVelocity: 0,
    }))

    const motion = {
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      pointerX: 0,
      pointerY: 0,
      tiltX: 0,
      tiltY: 0,
      kickX: 0,
      kickY: 0,
      // Random diffusion: a slowly wandering offset driven as an
      // Ornstein-Uhlenbeck process toward a periodically retargeted point.
      diffusionX: 0,
      diffusionY: 0,
      diffusionVelocityX: 0,
      diffusionVelocityY: 0,
      diffusionTargetX: 0,
      diffusionTargetY: 0,
      // Scroll follow: a viewport-pinned offset that trails the page scroll
      // on an underdamped spring, so the orb bounces below the hero and
      // floats over page content instead of scrolling away with the hero.
      followY: 0,
      followVelocityY: 0,
      // Inertial kick from scroll velocity; boils the pieces outward.
      scrollKickX: 0,
      scrollKickY: 0,
      neutralGamma: null as number | null,
      neutralBeta: null as number | null,
      phaseX: randomBetween(0, Math.PI * 2),
      phaseY: randomBetween(0, Math.PI * 2),
      turbulencePhaseX: randomBetween(0, Math.PI * 2),
      turbulencePhaseY: randomBetween(0, Math.PI * 2),
    }
    const bodySpring = { value: 0, velocity: 0, angle: 0 }

    let fieldSize = {
      width: stage.clientWidth,
      height: stage.clientHeight,
    }
    let frame = 0
    let previousTime = performance.now()
    let visible = true
    let sensorPermissionRequested = false
    let disposed = false
    const startedSensors = new Set<string>()
    let gravityX: number | null = null
    let gravityY: number | null = null
    // Random-diffusion scheduling: retarget the wander point every few
    // seconds and fire an occasional stronger "gust" impulse.
    let nextDiffusionRetarget = performance.now() + randomBetween(1200, 2600)
    let nextGust = performance.now() + randomBetween(3500, 8000)
    // Scroll tracking is derived from the field's viewport position each
    // frame, so it works with window scrolling and any nested scroller
    // without extra listeners.
    let initialFieldTop: number | null = null
    let initialFieldLeft: number | null = null
    let previousScrolledOutY = 0
    let previousScrolledOutX = 0
    let scrollSpeedY = 0
    let needsScrollRebase = false

    const screenVector = (x: number, y: number) => {
      const angle = (window.screen.orientation?.angle ?? 0) * Math.PI / 180
      return {
        x: x * Math.cos(angle) + y * Math.sin(angle),
        y: -x * Math.sin(angle) + y * Math.cos(angle),
      }
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      fieldSize = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
    })
    resizeObserver.observe(stage)

    const updatePointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      const bounds = stage.getBoundingClientRect()
      const normalizedX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      const normalizedY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1
      motion.pointerX = normalizedX * bounds.width * 0.03
      motion.pointerY = normalizedY * bounds.height * 0.025
    }

    const clearPointer = () => {
      motion.pointerX = 0
      motion.pointerY = 0
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (!visible || document.hidden || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta) || event.gamma === null || event.beta === null)
        return

      motion.neutralGamma ??= event.gamma
      motion.neutralBeta ??= event.beta
      motion.neutralGamma += (event.gamma - motion.neutralGamma) * 0.002
      motion.neutralBeta += (event.beta - motion.neutralBeta) * 0.002

      const gamma = clamp(event.gamma - motion.neutralGamma, -30, 30) / 30
      const beta = clamp(event.beta - motion.neutralBeta, -30, 30) / 30
      const tilt = screenVector(gamma, beta)
      const targetX = tilt.x * fieldSize.width * 0.12
      const targetY = tilt.y * fieldSize.height * 0.11

      motion.tiltX += (targetX - motion.tiltX) * 0.1
      motion.tiltY += (targetY - motion.tiltY) * 0.1
    }

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      if (!visible || document.hidden) return
      const gravity = event.accelerationIncludingGravity
      if (gravity && Number.isFinite(gravity.x) && Number.isFinite(gravity.y)) {
        const vector = screenVector(gravity.x!, -gravity.y!)
        gravityX ??= vector.x
        gravityY ??= vector.y
        // Gravity supplies tilt on devices without orientation events.
        if (motion.neutralGamma === null) {
          const targetX = clamp((vector.x - gravityX) / 5, -1, 1) * fieldSize.width * 0.12
          const targetY = clamp((vector.y - gravityY) / 5, -1, 1) * fieldSize.height * 0.11
          motion.tiltX += (targetX - motion.tiltX) * 0.15
          motion.tiltY += (targetY - motion.tiltY) * 0.15
        }
      }
      const acceleration = event.acceleration
      if (!acceleration) return
      const vector = screenVector(
        Number.isFinite(acceleration.x) ? acceleration.x! : 0,
        Number.isFinite(acceleration.y) ? -acceleration.y! : 0
      )
      // A bounded force keeps the response consistent across sensor sample rates.
      motion.kickX = clamp(vector.x, -8, 8) * fieldSize.width * 0.045
      motion.kickY = clamp(vector.y, -8, 8) * fieldSize.height * 0.045
    }

    const sensorSources = [
      {
        constructor: window.DeviceMotionEvent as unknown as PermissionCapableConstructor | undefined,
        start: () => window.addEventListener("devicemotion", handleDeviceMotion, { passive: true }),
        name: "motion",
      },
      {
        constructor: window.DeviceOrientationEvent as unknown as PermissionCapableConstructor | undefined,
        start: () => {
          window.addEventListener("deviceorientation", handleOrientation, { passive: true })
          window.addEventListener("deviceorientationabsolute", handleOrientation, { passive: true })
        },
        name: "orientation",
      },
    ]
    const startSensor = (source: typeof sensorSources[number]) => {
      if (disposed || startedSensors.has(source.name)) return
      startedSensors.add(source.name)
      source.start()
    }
    const requestSensorPermission = () => {
      if (sensorPermissionRequested) return
      sensorPermissionRequested = true
      // Request from a click/tap gesture; each sensor can work independently.
      void Promise.allSettled(sensorSources.map(async (source) => {
        if (startedSensors.has(source.name) || !source.constructor) return
        const result = await (source.constructor.requestPermission?.() ?? "granted")
        if (result === "granted") startSensor(source)
      }))
    }
    sensorSources.forEach((source) => {
      if (source.constructor && !source.constructor.requestPermission) startSensor(source)
    })

    const resetTilt = () => {
      motion.neutralGamma = null
      motion.neutralBeta = null
      gravityX = null
      gravityY = null
      motion.tiltX = 0
      motion.tiltY = 0
      motion.kickX = 0
      motion.kickY = 0
    }
    window.screen.orientation?.addEventListener("change", resetTilt)
    interactionRoot.addEventListener("click", requestSensorPermission)

    const retargetDiffusion = (spanScale = 1) => {
      const span = Math.min(fieldSize.width, fieldSize.height)
      motion.diffusionTargetX = randomBetween(-0.07, 0.07) * fieldSize.width * spanScale +
        randomBetween(-0.015, 0.015) * span * spanScale
      motion.diffusionTargetY = randomBetween(-0.065, 0.065) * fieldSize.height * spanScale +
        randomBetween(-0.015, 0.015) * span * spanScale
    }

    // A spontaneous random impulse so the orb never sits perfectly still:
    // the core drifts while the pieces bloom outward in scattered directions.
    const applyGust = (strengthScale = 1) => {
      const angle = randomBetween(0, Math.PI * 2)
      const directionX = Math.cos(angle)
      const directionY = Math.sin(angle)
      const strength = Math.min(fieldSize.width, fieldSize.height) *
        0.016 *
        strengthScale
      motion.velocityX += directionX * strength * randomBetween(0.6, 1.4)
      motion.velocityY += directionY * strength * randomBetween(0.6, 1.4)
      motion.diffusionVelocityX += directionX * strength * 0.8
      motion.diffusionVelocityY += directionY * strength * 0.8
      pieces.forEach((piece) => {
        const spread = piece.index < 2 ? 0.35 : 0.7 + piece.index * 0.12
        const pieceAngle = angle +
          randomBetween(-0.9, 0.9) +
          (piece.index - pieces.length / 2) * 0.09
        piece.vx += Math.cos(pieceAngle) * strength * spread *
          randomBetween(0.5, 1.3)
        piece.vy += Math.sin(pieceAngle) * strength * spread *
          randomBetween(0.5, 1.3)
        piece.stretchVelocity += randomBetween(-0.06, 0.06)
        piece.rotationVelocity += randomBetween(-6, 6)
      })
    }

    // ——— Leaked paint ———
    // The orb is a lump of colour barely holding together in fluid: it sheds
    // droplets that drift into the background, then recollects them. Flakes
    // are denser than the fluid, so they sink freely below the hero while
    // the orb itself stays buoyed near the top. Shed mass visibly shrinks the orb through a soft spring, and absorption
    // swells it back with a slight overshoot — a gulp.
    type DropletState = "docked" | "leaking" | "drifting" | "recalled"
    type Droplet = {
      element: HTMLSpanElement
      state: DropletState
      x: number
      y: number
      vx: number
      vy: number
      size: number
      mass: number
      opacity: number
      seed: number
      timer: number
    }

    const MAX_ACTIVE_DROPLETS = 5

    const droplets = Array.from(
      field.querySelectorAll<HTMLSpanElement>("[data-orb-droplet]")
    ).map<Droplet>((element) => ({
      element,
      state: "docked",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      mass: 0,
      opacity: 0,
      seed: randomBetween(0, Math.PI * 2),
      timer: 0,
    }))

    const paintMass = { value: 0, velocity: 0 }
    let nextLeak = performance.now() + randomBetween(900, 1800)
    let previousOil = 0
    // Orb radius in px, refreshed from the once-per-frame rect read below.
    let orbRadius = 0

    // Orb center in stage coordinates: the stage box plus every offset the
    // render writes into --orb-x/--orb-y.
    const orbCenterInStage = () => ({
      x: fieldSize.width * 0.5 + motion.x,
      y: fieldSize.height * 0.46 + motion.y + motion.followY,
    })

    const shedDroplet = (time: number) => {
      const active = droplets.filter((droplet) => droplet.state !== "docked").length
      if (active >= MAX_ACTIVE_DROPLETS) return
      const droplet = droplets.find((candidate) => candidate.state === "docked")
      if (!droplet) return
      const span = Math.min(fieldSize.width, fieldSize.height)
      const center = orbCenterInStage()
      const angle = randomBetween(0, Math.PI * 2)
      const directionX = Math.cos(angle)
      const directionY = Math.sin(angle)
      const radius = orbRadius > 0 ? orbRadius : span * 0.22
      droplet.size = span * randomBetween(0.05, 0.1)
      droplet.mass = (droplet.size / span) * 1.6
      droplet.x = center.x + directionX * radius * 0.55
      droplet.y = center.y + directionY * radius * 0.55
      // Inherit a share of the orb's velocity so hard flicks fling paint.
      droplet.vx = directionX * randomBetween(20, 60) + motion.velocityX * 0.35
      droplet.vy = directionY * randomBetween(20, 60) +
        (motion.velocityY + motion.followVelocityY) * 0.35 +
        // Flakes are denser than the fluid: born already sinking.
        span * 0.08
      droplet.opacity = 0
      droplet.state = "leaking"
      droplet.timer = time + randomBetween(900, 1500)
      droplet.element.style.width = `${droplet.size.toFixed(1)}px`
      droplet.element.style.height = `${droplet.size.toFixed(1)}px`
      // Blur proportional to the blob: a fixed large blur would wash a small
      // droplet into invisibility, a tiny one leaves a hard bead.
      droplet.element.style.setProperty(
        "--droplet-blur",
        `${(droplet.size * 0.28).toFixed(1)}px`
      )
    }

    const recallDroplets = () => {
      droplets.forEach((droplet) => {
        if (droplet.state === "leaking" || droplet.state === "drifting") {
          droplet.state = "recalled"
        }
      })
    }

    const updateDroplets = (deltaTime: number, time: number) => {
      const center = orbCenterInStage()
      const span = Math.min(fieldSize.width, fieldSize.height)
      // Sinking: flakes are denser than the fluid the orb floats in, so they
      // fall freely below the hero while the orb stays buoyed near the top.
      const sink = span * 0.22
      const radius = orbRadius > 0 ? orbRadius : span * 0.22
      let activeMass = 0
      droplets.forEach((droplet) => {
        if (droplet.state === "docked") return
        activeMass += droplet.mass
        const dx = center.x - droplet.x
        const dy = center.y - droplet.y
        if (droplet.state === "leaking") {
          const drag = Math.exp(-1.2 * deltaTime)
          droplet.vx *= drag
          droplet.vy *= drag
          droplet.vy += sink * deltaTime
          droplet.x += droplet.vx * deltaTime
          droplet.y += droplet.vy * deltaTime
          droplet.opacity += (0.85 - droplet.opacity) * Math.min(1, deltaTime * 4)
          if (time >= droplet.timer) {
            droplet.state = "drifting"
            droplet.timer = time + randomBetween(6000, 11000)
          }
        } else if (droplet.state === "drifting") {
          const drag = Math.exp(-1.8 * deltaTime)
          droplet.vx *= drag
          droplet.vy *= drag
          // Loose leash sideways so they stay near the orb's column, barely
          // any leash vertically so they sink freely into the content.
          droplet.vx += Math.sin(time * 0.001 + droplet.seed) * 8 * deltaTime +
            dx * 0.25 * deltaTime
          droplet.vy += Math.cos(time * 0.0009 + droplet.seed * 1.7) * 8 * deltaTime +
            dy * 0.06 * deltaTime + sink * deltaTime
          droplet.x += droplet.vx * deltaTime
          droplet.y += droplet.vy * deltaTime
          droplet.opacity += (0.75 - droplet.opacity) * Math.min(1, deltaTime * 2)
          if (time >= droplet.timer) droplet.state = "recalled"
        } else {
          // Recalled: home in hot, shrink and fade into the surface, and
          // count the mass back the moment it touches.
          droplet.vx += (dx * 34 - droplet.vx * 9) * deltaTime
          droplet.vy += (dy * 34 - droplet.vy * 9) * deltaTime
          droplet.x += droplet.vx * deltaTime
          droplet.y += droplet.vy * deltaTime
          const dist = Math.hypot(center.x - droplet.x, center.y - droplet.y)
          if (dist < radius * 0.45) {
            activeMass -= droplet.mass
            droplet.mass = 0
            droplet.state = "docked"
            droplet.opacity = 0
            droplet.element.style.opacity = "0"
            return
          }
          droplet.opacity = 0.75 * clamp(dist / (radius * 1.2), 0, 1)
        }
        const closeness = droplet.state === "recalled"
          ? clamp(
            Math.hypot(center.x - droplet.x, center.y - droplet.y) /
              Math.max(radius, 1),
            0.25,
            1
          )
          : 1
        droplet.element.style.transform =
          `translate3d(${droplet.x.toFixed(1)}px, ${droplet.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${closeness.toFixed(3)})`
        droplet.element.style.opacity = droplet.opacity.toFixed(3)
      })
      // Fluid mass: shrink as paint leaves, swell as it returns, with a soft
      // overshoot so each absorption lands with a gulp.
      paintMass.velocity +=
        ((activeMass - paintMass.value) * 22 - paintMass.velocity * 7) * deltaTime
      paintMass.value += paintMass.velocity * deltaTime
    }

    const impact = (clientX: number, clientY: number) => {
      const orbBounds = orb.getBoundingClientRect()
      const centerX = orbBounds.left + orbBounds.width / 2
      const centerY = orbBounds.top + orbBounds.height / 2
      let deltaX = clientX - centerX
      let deltaY = clientY - centerY
      let length = Math.hypot(deltaX, deltaY)

      if (length < 8) {
        const angle = randomBetween(0, Math.PI * 2)
        deltaX = Math.cos(angle)
        deltaY = Math.sin(angle)
        length = 1
      }

      const directionX = deltaX / length
      const directionY = deltaY / length
      bodySpring.angle = (Math.atan2(directionY, directionX) * 180) / Math.PI
      bodySpring.velocity += 3

      const strength = Math.min(fieldSize.width, fieldSize.height) * 0.02
      pieces.forEach((piece) => {
        const spread = piece.index < 2 ? 0.45 : 0.8 + piece.index * 0.1
        const angle =
          Math.atan2(directionY, directionX) +
          randomBetween(-0.34, 0.34) +
          (piece.index - pieces.length / 2) * 0.06
        piece.vx += Math.cos(angle) * strength * spread
        piece.vy += Math.sin(angle) * strength * spread
        piece.stretchVelocity += randomBetween(0.055, 0.115) *
          (piece.index % 2 === 0 ? 1 : -1)
        piece.rotationVelocity += randomBetween(-8, 8)
      })

      motion.velocityX -= directionX * strength * 1.1
      motion.velocityY -= directionY * strength * 1.1

      // A tap shakes loose paint and calls the old leaks home.
      recallDroplets()
      shedDroplet(performance.now())
    }

    const handlePointerDown = (event: PointerEvent) => {
      impact(event.clientX, event.clientY)
    }

    // Live cursor for the gravity pull: window-wide (the orb roams past the
    // hero, so hero-only listeners would lose the hand), touch ignored.
    const cursor = { x: 0, y: 0, updatedAt: -Infinity }
    const trackCursor = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      cursor.x = event.clientX
      cursor.y = event.clientY
      cursor.updatedAt = performance.now()
    }
    window.addEventListener("pointermove", trackCursor, { passive: true })

    // Desktop keeps the orb inside the hero band (see the follow target and
    // the stylesheet backstop); the roam-below behavior is a mobile canvas.
    const desktopLayout = window.matchMedia("(min-width: 1024px)")

    // Appetite: the app announces logged and deleted items on a window
    // event, and the orb plumps or thins through a slow spring — shedding a
    // droplet on every log, calling leaks home on every delete. Never
    // attached under reduced motion (the effect returns early above), so
    // the orb stays a static illustration there.
    const fullness = { value: 0, velocity: 0, target: 0 }
    // Hard cap on plumpness, plus a fresh slim orb every calendar day.
    const FULLNESS_MIN = -0.25
    const FULLNESS_MAX = 0.32
    let fullnessDay = new Date().toLocaleDateString("en-CA")
    let lastDayCheck = 0
    const handleOrbActivity = (event: Event) => {
      const detail = (
        event as CustomEvent<{ kind: string; magnitude?: number }>
      ).detail
      if (!detail) return
      const magnitude = clamp(detail.magnitude ?? 1, 0.25, 3)
      if (detail.kind === "log") {
        fullness.target = clamp(
          fullness.target + 0.08 * magnitude,
          FULLNESS_MIN,
          FULLNESS_MAX
        )
        shedDroplet(performance.now())
      } else if (detail.kind === "delete") {
        fullness.target = clamp(
          fullness.target - 0.1 * magnitude,
          FULLNESS_MIN,
          FULLNESS_MAX
        )
        recallDroplets()
      }
    }
    window.addEventListener("orb-activity", handleOrbActivity)

    interactionRoot.addEventListener("pointermove", updatePointer, {
      passive: true,
    })
    interactionRoot.addEventListener("pointerleave", clearPointer, {
      passive: true,
    })
    interactionRoot.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    })

    // Nested scrollers (e.g. the dashboard timeline strip): scrolling them
    // never moves the field's viewport rect, so the per-frame rect sampling
    // below would see nothing. Catch their deltas here instead — scroll
    // events don't bubble, but a capture-phase listener on document sees
    // every scroller on the page.
    const pendingNested = { x: 0, y: 0 }
    const nestedBaselines = new WeakMap<Element, { top: number; left: number }>()
    const handleNestedScrollCapture = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      // Ancestor scroll moves the field itself, which the rect sampling
      // already measures — counting it here would double the reaction.
      if (target === field || target.contains(field)) return
      // Only scrollers in our own page root (the timeline strip, carousels,
      // inner lists). Portaled sheets and modals scroll above us; ignore them.
      if (!interactionRoot.contains(target)) return
      const top = target.scrollTop
      const left = target.scrollLeft
      const baseline = nestedBaselines.get(target)
      if (!baseline) {
        nestedBaselines.set(target, { top, left })
        return
      }
      // Dead entries are collected with their elements; only live deltas
      // between consecutive events accumulate, so nothing can go stale.
      pendingNested.y += top - baseline.top
      pendingNested.x += left - baseline.left
      baseline.top = top
      baseline.left = left
    }
    document.addEventListener("scroll", handleNestedScrollCapture, {
      capture: true,
      passive: true,
    })

    const integratePieces = (deltaTime: number, ambient: number, oil: number) => {
      // In oil the piece springs run through molasses: heavier damping on
      // every channel so the bloom turns into a slow ooze.
      const pieceDamping = 9.5 + oil * 16
      const stretchDamping = 10.5 + oil * 14
      const rotationDamping = 10 + oil * 14
      pieces.forEach((piece) => {
        // Ambient Brownian diffusion keeps the pieces softly boiling instead
        // of settling perfectly still between interactions.
        piece.vx += randomBetween(-1, 1) * ambient * deltaTime
        piece.vy += randomBetween(-1, 1) * ambient * deltaTime
        piece.vx += (-piece.dx * 36 - piece.vx * pieceDamping) * deltaTime
        piece.vy += (-piece.dy * 36 - piece.vy * pieceDamping) * deltaTime
        piece.dx += piece.vx * deltaTime
        piece.dy += piece.vy * deltaTime

        piece.stretchVelocity += randomBetween(-1, 1) * ambient * 0.0006 * deltaTime * 60 +
          (-piece.stretch * 44 - piece.stretchVelocity * stretchDamping) * deltaTime
        piece.stretch += piece.stretchVelocity * deltaTime
        piece.rotationVelocity += randomBetween(-1, 1) * ambient * 0.02 * deltaTime * 60 +
          (-piece.rotation * 38 - piece.rotationVelocity * rotationDamping) * deltaTime
        piece.rotation += piece.rotationVelocity * deltaTime

        const displacement = piece.index < 2 ? 0.55 : 1
        piece.element.style.setProperty(
          "--orb-piece-x",
          `${(piece.dx * displacement).toFixed(2)}px`
        )
        piece.element.style.setProperty(
          "--orb-piece-y",
          `${(piece.dy * displacement).toFixed(2)}px`
        )
        piece.element.style.setProperty(
          "--orb-piece-scale-x",
          (1 + piece.stretch).toFixed(4)
        )
        piece.element.style.setProperty(
          "--orb-piece-scale-y",
          (1 - piece.stretch * 0.68).toFixed(4)
        )
        piece.element.style.setProperty(
          "--orb-piece-rotation",
          `${piece.rotation.toFixed(2)}deg`
        )
      })

      bodySpring.velocity +=
        (-bodySpring.value * 34 - bodySpring.velocity * 8.8) * deltaTime
      bodySpring.value += bodySpring.velocity * deltaTime
      const squash = clamp(bodySpring.value, -0.2, 0.2)
      deformer.style.setProperty(
        "--orb-impact-angle",
        `${bodySpring.angle.toFixed(2)}deg`
      )
      deformer.style.setProperty(
        "--orb-squash-x",
        (1 + squash * 0.62).toFixed(4)
      )
      deformer.style.setProperty(
        "--orb-squash-y",
        (1 - squash * 0.42).toFixed(4)
      )
    }

    const animate = (time: number) => {
      frame = 0
      if (!visible || document.hidden) return

      const deltaTime = clamp((time - previousTime) / 1000, 0.001, 0.033)
      previousTime = time
      const seconds = time * 0.001
      const minSpan = Math.min(fieldSize.width, fieldSize.height)

      // Water vs oil: inside the hero the orb bounces lively, but once the
      // scroll drags it out over the main section every mechanism is
      // drastically dampened — the hero is water, the content is oil.
      // (Read from last frame's follow depth; updated again below.)
      const oil = clamp(
        (motion.followY - fieldSize.height * 0.25) / (fieldSize.height * 0.55),
        0,
        1
      )
      const liveliness = 1 - 0.93 * oil
      const kickScale = Math.max(0.06, liveliness)

      // Random diffusion: periodically pick a new wander target and ease an
      // Ornstein-Uhlenbeck offset toward it, with a touch of per-frame
      // Brownian jitter so the path never exactly repeats. Both shrink into
      // the oil.
      if (time >= nextDiffusionRetarget) {
        retargetDiffusion(0.3 + 0.7 * liveliness)
        nextDiffusionRetarget = time + randomBetween(1800, 4200)
      }
      if (time >= nextGust) {
        applyGust(randomBetween(0.7, 1.6) * (0.15 + 0.85 * liveliness))
        shedDroplet(time)
        nextGust = time + randomBetween(3500, 8000) / Math.max(0.25, liveliness)
      }
      // Ambient shedding: agitated water throws paint faster. Surfacing back
      // into the hero calls every loose droplet home.
      if (time >= nextLeak) {
        shedDroplet(time)
        const agitation = clamp(Math.abs(scrollSpeedY) / 1200, 0, 2)
        nextLeak = time + randomBetween(1100, 2800) / (1 + agitation)
      }
      if (previousOil > 0.4 && oil <= 0.15) recallDroplets()
      const jitter = minSpan * 0.05 * liveliness
      motion.diffusionVelocityX +=
        ((motion.diffusionTargetX - motion.diffusionX) * 1.6 +
          randomBetween(-1, 1) * jitter) * deltaTime
      motion.diffusionVelocityY +=
        ((motion.diffusionTargetY - motion.diffusionY) * 1.6 +
          randomBetween(-1, 1) * jitter) * deltaTime
      const diffusionDamping = Math.exp(-1.4 * deltaTime)
      motion.diffusionVelocityX *= diffusionDamping
      motion.diffusionVelocityY *= diffusionDamping
      motion.diffusionX += motion.diffusionVelocityX * deltaTime
      motion.diffusionY += motion.diffusionVelocityY * deltaTime
      motion.diffusionX = clamp(
        motion.diffusionX,
        -fieldSize.width * 0.09,
        fieldSize.width * 0.09
      )
      motion.diffusionY = clamp(
        motion.diffusionY,
        -fieldSize.height * 0.09,
        fieldSize.height * 0.09
      )
      // Slow random walk of the turbulence phases keeps the layered sines
      // from looping predictably.
      motion.turbulencePhaseX += deltaTime * 0.05 + randomBetween(-1, 1) * 0.02 * deltaTime
      motion.turbulencePhaseY += deltaTime * 0.043 + randomBetween(-1, 1) * 0.02 * deltaTime

      // Scroll reaction, derived from the field's viewport position so it
      // follows window scrolling and any nested scroller alike. The orb is
      // pinned to the viewport (see the follow spring below) and takes an
      // inertial kick proportional to scroll velocity, which also boils the
      // pieces outward.
      const fieldRect = field.getBoundingClientRect()
      if (initialFieldTop === null || initialFieldLeft === null) {
        initialFieldTop = fieldRect.top
        initialFieldLeft = fieldRect.left
        previousScrolledOutY = 0
        previousScrolledOutX = 0
      }
      const scrolledOutY = initialFieldTop - fieldRect.top
      const scrolledOutX = initialFieldLeft - fieldRect.left
      // Rect deltas cover window/ancestor scrolling; nested deltas cover
      // inner scrollers that leave the field in place. Both shake the orb,
      // but only the rect distance pins it (see the follow spring): for a
      // nested scroller the field never moved, so the orb is already where
      // it belongs.
      let scrollDeltaY = clamp(
        scrolledOutY - previousScrolledOutY + pendingNested.y,
        -160,
        160
      )
      let scrollDeltaX = clamp(
        scrolledOutX - previousScrolledOutX + pendingNested.x,
        -160,
        160
      )
      pendingNested.x = 0
      pendingNested.y = 0
      if (needsScrollRebase) {
        needsScrollRebase = false
        scrollDeltaY = 0
        scrollDeltaX = 0
      }
      previousScrolledOutY = scrolledOutY
      previousScrolledOutX = scrolledOutX
      const instantScrollVelocityY = scrollDeltaY / Math.max(deltaTime, 0.001)
      scrollSpeedY += (instantScrollVelocityY - scrollSpeedY) *
        Math.min(1, deltaTime * 6)

      // Viewport follow (mobile only — desktop parks the orb in the hero,
      // see the stylesheet clip): the orb only ever leans a fraction of the
      // scroll distance, so travelling never reads as force. Past the
      // trampoline membrane the oil pushes back: a rejection force growing
      // with penetration plus a constant buoyant drift, so the orb may poke
      // through a little on a hard flick but is slowly floated back up to
      // hover just under the hero instead of sinking with the page.
      const followTarget = desktopLayout.matches
        ? 0
        : clamp(scrolledOutY * 0.22, -80, fieldSize.height * 0.3)
      const followStiffness = 26 - 10 * oil
      const followDamping = 5.2 + 8 * oil
      const membrane = fieldSize.height * 0.15
      const penetration = motion.followY - membrane
      const rejection = penetration > 0 && !desktopLayout.matches
        ? penetration * (10 + 50 * oil)
        : 0
      const buoyancy = desktopLayout.matches ? 0 : oil * minSpan * 0.6
      motion.followVelocityY +=
        ((followTarget - motion.followY) * followStiffness -
          motion.followVelocityY * followDamping -
          rejection -
          buoyancy) * deltaTime
      motion.followY += motion.followVelocityY * deltaTime
      motion.scrollKickX = clamp(
        motion.scrollKickX + scrollDeltaX * 1.6 * kickScale,
        -fieldSize.width * 0.5,
        fieldSize.width * 0.5
      )
      motion.scrollKickY = clamp(
        motion.scrollKickY + scrollDeltaY * 1.6 * kickScale,
        -fieldSize.height * 0.5,
        fieldSize.height * 0.5
      )
      const scrollKickDamping = Math.pow(0.02, deltaTime)
      motion.scrollKickX *= scrollKickDamping
      motion.scrollKickY *= scrollKickDamping
      if (Math.abs(scrollDeltaY) > 0.5 || Math.abs(scrollDeltaX) > 0.5) {
        const scrollStrength = Math.min(
          Math.hypot(scrollDeltaX, scrollDeltaY),
          80
        )
        pieces.forEach((piece) => {
          const spread = 0.3 + piece.index * 0.055
          piece.vx += (scrollDeltaX * spread * randomBetween(0.5, 1.1) * 0.06 +
            randomBetween(-1, 1) * scrollStrength * 0.02) * kickScale
          piece.vy += (scrollDeltaY * spread * randomBetween(0.5, 1.1) * 0.06 +
            randomBetween(-1, 1) * scrollStrength * 0.02) * kickScale
          piece.stretchVelocity += randomBetween(-0.012, 0.012) * scrollStrength * 0.05 * kickScale
          piece.rotationVelocity += randomBetween(-0.35, 0.35) * scrollStrength * 0.05 * kickScale
        })
        if (Math.abs(scrollDeltaY) > Math.abs(scrollDeltaX)) {
          bodySpring.angle = scrollDeltaY > 0 ? 90 : -90
          bodySpring.velocity += clamp(scrollStrength * 0.006, 0, 0.5) * kickScale
        }
      }

      // Weak cursor gravity: a gentle tug toward the live cursor, strongest
      // up close and fading with distance — enough that the orb notices the
      // hand, never enough to drag it off its moorings. The rect is read
      // once, before this frame's style writes, so no synchronous layout is
      // forced — and it doubles as the droplet system's ruler.
      const orbRectNow = orb.getBoundingClientRect()
      orbRadius = orbRectNow.width / 2
      if (time - cursor.updatedAt < 4000) {
        const gravityDX = cursor.x - (orbRectNow.left + orbRectNow.width / 2)
        const gravityDY = cursor.y - (orbRectNow.top + orbRectNow.height / 2)
        const gravityDistance = Math.hypot(gravityDX, gravityDY)
        if (gravityDistance > 4) {
          const gravityFalloff = minSpan * 0.5
          const gravityPull = ((minSpan * 0.25) / (1 + gravityDistance / gravityFalloff)) *
            Math.max(0.3, liveliness)
          motion.velocityX += (gravityDX / gravityDistance) * gravityPull * deltaTime
          motion.velocityY += (gravityDY / gravityDistance) * gravityPull * deltaTime
        }
      }

      // Leaked paint drifts in stage space behind the orb; the orb's own
      // scale below pays for every gram still out there.
      updateDroplets(deltaTime, time)

      // Appetite spring: plumpness from logged items lingers about a minute
      // before settling back to baseline — and a new calendar day starts
      // slim again, checked every couple of seconds.
      if (time - lastDayCheck > 2000) {
        lastDayCheck = time
        const today = new Date().toLocaleDateString("en-CA")
        if (today !== fullnessDay) {
          fullnessDay = today
          fullness.value = 0
          fullness.velocity = 0
          fullness.target = 0
        }
      }
      fullness.target *= Math.exp(-0.015 * deltaTime)
      fullness.velocity +=
        ((fullness.target - fullness.value) * 18 - fullness.velocity * 7) *
        deltaTime
      fullness.value += fullness.velocity * deltaTime

      const wanderSpan = 0.15 + 0.85 * liveliness
      const wanderX =
        (Math.sin(seconds * 0.115 + motion.phaseX) * 0.055 +
          Math.sin(seconds * 0.047 + 2.1) * 0.034 +
          Math.sin(seconds * 0.19 + motion.turbulencePhaseX) * 0.014) *
        fieldSize.width * wanderSpan
      const wanderY =
        (Math.cos(seconds * 0.101 + motion.phaseY) * 0.055 +
          Math.sin(seconds * 0.041 + 1.4) * 0.032 +
          Math.cos(seconds * 0.173 + motion.turbulencePhaseY) * 0.014) *
        fieldSize.height * wanderSpan
      const steerSpan = 0.3 + 0.7 * liveliness
      const targetX = wanderX + motion.diffusionX +
        (motion.tiltX + motion.pointerX) * steerSpan
      const targetY = wanderY + motion.diffusionY +
        (motion.tiltY + motion.pointerY) * steerSpan

      motion.velocityX +=
        ((targetX - motion.x) * 2.65 + motion.kickX + motion.scrollKickX) *
        deltaTime
      motion.velocityY +=
        ((targetY - motion.y) * 2.7 + motion.kickY + motion.scrollKickY) *
        deltaTime
      const damping = Math.exp(-(2.25 + oil * 7) * deltaTime)
      motion.velocityX *= damping
      motion.velocityY *= damping
      motion.x += motion.velocityX * deltaTime
      motion.y += motion.velocityY * deltaTime
      motion.kickX *= Math.pow(0.08, deltaTime)
      motion.kickY *= Math.pow(0.08, deltaTime)

      motion.x = clamp(
        motion.x,
        -fieldSize.width * 0.17,
        fieldSize.width * 0.17
      )
      motion.y = clamp(
        motion.y,
        -fieldSize.height * 0.16,
        fieldSize.height * 0.16
      )

      const scrollSwell = clamp(Math.abs(scrollSpeedY) * 0.000004, 0, 0.005) * liveliness
      const breathe =
        Math.sin(time * 0.00048) * 0.0045 +
        Math.sin(time * 0.00019 + 1.3) * 0.003 +
        (Math.sin(time * 0.0011 + motion.turbulencePhaseX) * 0.002 +
          scrollSwell) * liveliness
      const rotation =
        Math.sin(time * 0.00013 + 0.7) * 1.1 +
        (clamp(motion.velocityX * 0.018, -1.6, 1.6) +
          clamp(scrollSpeedY * 0.00015, -1.2, 1.2)) * liveliness

      orb.style.setProperty("--orb-x", `${motion.x.toFixed(2)}px`)
      orb.style.setProperty(
        "--orb-y",
        `${(motion.y + motion.followY).toFixed(2)}px`
      )
      // Settle the orb slightly as it travels deep into the content so it
      // reads as ambient background rather than competing with text.
      orb.style.setProperty(
        "opacity",
        (1 - clamp(motion.followY / (fieldSize.height * 4), 0, 0.2)).toFixed(3)
      )
      orb.style.setProperty(
        "--orb-scale",
        (
          (1 + breathe) *
          (1 - clamp(paintMass.value, 0, 0.6) * 0.3) *
          (1 + clamp(fullness.value, FULLNESS_MIN, FULLNESS_MAX) * 0.45)
        ).toFixed(4)
      )
      orb.style.setProperty("--orb-rotation", `${rotation.toFixed(2)}deg`)
      const ambient = (minSpan * 0.09 +
        Math.min(Math.abs(scrollSpeedY) * 0.006, minSpan * 0.08)) *
        Math.max(0.05, liveliness)
      integratePieces(deltaTime, ambient, oil)
      previousOil = oil
      frame = requestAnimationFrame(animate)
    }

    const startAnimation = () => {
      if (frame || !visible || document.hidden) return
      previousTime = performance.now()
      // Re-baselining avoids a jump kick from scroll distance covered while
      // the animation was paused.
      needsScrollRebase = true
      frame = requestAnimationFrame(animate)
    }

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
      if (visible) startAnimation()
      else if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    })
    // Watch the orb itself: it follows the scroll past the hero, so gating
    // on the hero-sized field would freeze it just as it enters the content.
    intersectionObserver.observe(orb)

    const handleVisibilityChange = () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      } else {
        startAnimation()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    startAnimation()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      disposed = true
      interactionRoot.removeEventListener("click", requestSensorPermission)
      window.screen.orientation?.removeEventListener("change", resetTilt)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      interactionRoot.removeEventListener("pointermove", updatePointer)
      interactionRoot.removeEventListener("pointerleave", clearPointer)
      interactionRoot.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("pointermove", trackCursor)
      window.removeEventListener("orb-activity", handleOrbActivity)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      document.removeEventListener("scroll", handleNestedScrollCapture, {
        capture: true,
      })
      window.removeEventListener("deviceorientation", handleOrientation)
      window.removeEventListener("deviceorientationabsolute", handleOrientation)
      window.removeEventListener("devicemotion", handleDeviceMotion)
    }
  }, [])

  return (
    <span
      ref={fieldRef}
      className={`reactive-orb-field app-hero-wash ${className}`.trim()}
      aria-hidden="true"
    >
      <span ref={stageRef} className="reactive-orb-field__stage">
        <span className="reactive-orb-field__droplets" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, index) => (
            <span key={index} className="reactive-orb-field__droplet" data-orb-droplet />
          ))}
        </span>
        <span ref={orbRef} className="reactive-orb-field__orb">
          <span className="reactive-orb-field__theme-shaper">
            <span ref={deformerRef} className="reactive-orb-field__deformer">
              <span className="reactive-orb-field__piece reactive-orb-field__core" data-orb-piece />
              <span className="reactive-orb-field__piece reactive-orb-field__halo" data-orb-piece />
              <span className="reactive-orb-field__piece reactive-orb-field__rose" data-orb-piece />
              <span className="reactive-orb-field__piece reactive-orb-field__yellow" data-orb-piece />
              <span className="reactive-orb-field__piece reactive-orb-field__orange" data-orb-piece />
              <span className="reactive-orb-field__piece reactive-orb-field__peach" data-orb-piece />
              <span className="reactive-orb-field__piece reactive-orb-field__satellite reactive-orb-field__satellite-a" data-orb-piece />
              <span className="reactive-orb-field__piece reactive-orb-field__satellite reactive-orb-field__satellite-b" data-orb-piece />
              <span className="reactive-orb-field__piece reactive-orb-field__satellite reactive-orb-field__satellite-c" data-orb-piece />
            </span>
          </span>
        </span>
      </span>
      <span className="reactive-orb-field__veil" />
    </span>
  )
}
