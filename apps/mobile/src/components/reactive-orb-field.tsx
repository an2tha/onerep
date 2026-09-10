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
 * It responds to pointer position, taps and supported device motion while
 * remaining a static illustration when reduced motion is requested.
 */
export function ReactiveOrbField({ className = "" }: ReactiveOrbFieldProps) {
  const fieldRef = useRef<HTMLSpanElement>(null)
  const orbRef = useRef<HTMLSpanElement>(null)
  const deformerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const field = fieldRef.current
    const orb = orbRef.current
    const deformer = deformerRef.current
    const interactionRoot = field?.parentElement

    if (!field || !orb || !deformer || !interactionRoot) return

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
      neutralGamma: null as number | null,
      neutralBeta: null as number | null,
      phaseX: randomBetween(0, Math.PI * 2),
      phaseY: randomBetween(0, Math.PI * 2),
    }
    const bodySpring = { value: 0, velocity: 0, angle: 0 }

    let fieldSize = {
      width: field.clientWidth,
      height: field.clientHeight,
    }
    let frame = 0
    let previousTime = performance.now()
    let visible = true
    let sensorPermissionRequested = false
    let sensorsStarted = false

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      fieldSize = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
    })
    resizeObserver.observe(field)

    const updatePointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      const bounds = field.getBoundingClientRect()
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
      if (typeof event.gamma !== "number" || typeof event.beta !== "number")
        return

      motion.neutralGamma ??= event.gamma
      motion.neutralBeta ??= event.beta
      motion.neutralGamma += (event.gamma - motion.neutralGamma) * 0.002
      motion.neutralBeta += (event.beta - motion.neutralBeta) * 0.002

      const gamma = clamp(event.gamma - motion.neutralGamma, -30, 30) / 30
      const beta = clamp(event.beta - motion.neutralBeta, -30, 30) / 30
      const targetX = gamma * fieldSize.width * 0.105
      const targetY = beta * fieldSize.height * 0.09

      motion.tiltX += (targetX - motion.tiltX) * 0.1
      motion.tiltY += (targetY - motion.tiltY) * 0.1
    }

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.acceleration
      if (!acceleration) return
      motion.kickX += clamp(acceleration.x ?? 0, -8, 8) * 0.18
      motion.kickY -= clamp(acceleration.y ?? 0, -8, 8) * 0.18
    }

    const startSensors = () => {
      if (sensorsStarted) return
      sensorsStarted = true
      window.addEventListener("deviceorientation", handleOrientation, {
        passive: true,
      })
      // Some Android builds only fire the absolute variant; it carries the
      // same gamma/beta payload, so one handler serves both.
      window.addEventListener("deviceorientationabsolute", handleOrientation, {
        passive: true,
      })
      window.addEventListener("devicemotion", handleDeviceMotion, {
        passive: true,
      })
    }

    const requestSensorPermission = async () => {
      if (sensorPermissionRequested) return
      sensorPermissionRequested = true

      const motionConstructor = window.DeviceMotionEvent as unknown as
        | PermissionCapableConstructor
        | undefined
      const orientationConstructor =
        window.DeviceOrientationEvent as unknown as
          | PermissionCapableConstructor
          | undefined

      try {
        const results = await Promise.all([
          motionConstructor?.requestPermission?.() ?? "granted",
          orientationConstructor?.requestPermission?.() ?? "granted",
        ])
        if (results.every((result) => result === "granted")) {
          startSensors()
        } else {
          // A dismissed prompt latches nothing: the next tap retries, so one
          // accidental dismissal does not silence tilt forever.
          sensorPermissionRequested = false
        }
      } catch {
        // Permission denial leaves autonomous and pointer motion intact, and
        // the next tap may retry.
        sensorPermissionRequested = false
      }
    }

    const motionConstructor = window.DeviceMotionEvent as unknown as
      | PermissionCapableConstructor
      | undefined
    if (!motionConstructor?.requestPermission) startSensors()

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
    }

    const handlePointerDown = (event: PointerEvent) => {
      impact(event.clientX, event.clientY)
      void requestSensorPermission()
    }

    interactionRoot.addEventListener("pointermove", updatePointer, {
      passive: true,
    })
    interactionRoot.addEventListener("pointerleave", clearPointer, {
      passive: true,
    })
    interactionRoot.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    })

    const integratePieces = (deltaTime: number) => {
      pieces.forEach((piece) => {
        piece.vx += (-piece.dx * 36 - piece.vx * 9.5) * deltaTime
        piece.vy += (-piece.dy * 36 - piece.vy * 9.5) * deltaTime
        piece.dx += piece.vx * deltaTime
        piece.dy += piece.vy * deltaTime

        piece.stretchVelocity +=
          (-piece.stretch * 44 - piece.stretchVelocity * 10.5) * deltaTime
        piece.stretch += piece.stretchVelocity * deltaTime
        piece.rotationVelocity +=
          (-piece.rotation * 38 - piece.rotationVelocity * 10) * deltaTime
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
      const wanderX =
        (Math.sin(seconds * 0.115 + motion.phaseX) * 0.05 +
          Math.sin(seconds * 0.047 + 2.1) * 0.032) *
        fieldSize.width
      const wanderY =
        (Math.cos(seconds * 0.101 + motion.phaseY) * 0.05 +
          Math.sin(seconds * 0.041 + 1.4) * 0.03) *
        fieldSize.height
      const targetX = wanderX + motion.tiltX + motion.pointerX
      const targetY = wanderY + motion.tiltY + motion.pointerY

      motion.velocityX +=
        ((targetX - motion.x) * 2.65 + motion.kickX) * deltaTime
      motion.velocityY +=
        ((targetY - motion.y) * 2.7 + motion.kickY) * deltaTime
      const damping = Math.exp(-2.25 * deltaTime)
      motion.velocityX *= damping
      motion.velocityY *= damping
      motion.x += motion.velocityX * deltaTime
      motion.y += motion.velocityY * deltaTime
      motion.kickX *= Math.pow(0.08, deltaTime)
      motion.kickY *= Math.pow(0.08, deltaTime)

      motion.x = clamp(
        motion.x,
        -fieldSize.width * 0.145,
        fieldSize.width * 0.145
      )
      motion.y = clamp(
        motion.y,
        -fieldSize.height * 0.135,
        fieldSize.height * 0.135
      )

      const breathe =
        Math.sin(time * 0.00048) * 0.0045 +
        Math.sin(time * 0.00019 + 1.3) * 0.003
      const rotation =
        Math.sin(time * 0.00013 + 0.7) * 1.1 +
        clamp(motion.velocityX * 0.018, -1.6, 1.6)

      orb.style.setProperty("--orb-x", `${motion.x.toFixed(2)}px`)
      orb.style.setProperty("--orb-y", `${motion.y.toFixed(2)}px`)
      orb.style.setProperty("--orb-scale", (1 + breathe).toFixed(4))
      orb.style.setProperty("--orb-rotation", `${rotation.toFixed(2)}deg`)
      integratePieces(deltaTime)
      frame = requestAnimationFrame(animate)
    }

    const startAnimation = () => {
      if (frame || !visible || document.hidden) return
      previousTime = performance.now()
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
    intersectionObserver.observe(field)

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
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      interactionRoot.removeEventListener("pointermove", updatePointer)
      interactionRoot.removeEventListener("pointerleave", clearPointer)
      interactionRoot.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
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
      <span className="reactive-orb-field__veil" />
    </span>
  )
}
