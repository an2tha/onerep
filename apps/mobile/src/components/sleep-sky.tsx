import { useEffect, useRef } from "react"
import "./sleep-sky.css"

export function SleepSky({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!active) return
    const canvas = ref.current
    const ctx = canvas?.getContext("2d", { alpha: false })
    if (!canvas || !ctx) return
    const reduced = matchMedia("(prefers-reduced-motion: reduce)")
    let width = 1,
      height = 1,
      frame = 0,
      last = 0,
      elapsed = 0,
      px = 0,
      py = 0,
      x = 0,
      y = 0,
      seed = 711
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const stars = Array.from({ length: 410 }, () => ({
      x: random(),
      y: random(),
      z: random(),
      phase: random() * 6.28,
      warm: random() > 0.84,
    }))
    const galaxy = document.createElement("canvas")
    galaxy.width = 600
    galaxy.height = 1200
    const dust = galaxy.getContext("2d")!
    for (let i = 0; i < 1100; i++) {
      const gy = random() * 1200
      const spread = (random() + random() + random() - 1.5) * 135
      const gx = 300 + Math.sin(gy / 280) * 45 + spread
      const radius = 7 + random() * 50
      const cloud = dust.createRadialGradient(gx, gy, 0, gx, gy, radius)
      cloud.addColorStop(
        0,
        i % 4 === 0 ? "rgba(178,159,205,.07)" : "rgba(146,178,208,.055)",
      )
      cloud.addColorStop(1, "rgba(125,153,190,0)")
      dust.fillStyle = cloud
      dust.fillRect(gx - radius, gy - radius, radius * 2, radius * 2)
    }
    for (let i = 0; i < 160; i++) {
      const gy = random() * 1200,
        gx = 302 + Math.sin(gy / 185) * 30 + (random() - 0.5) * 40,
        radius = 12 + random() * 28
      const lane = dust.createRadialGradient(gx, gy, 0, gx, gy, radius)
      lane.addColorStop(0, "rgba(3,8,23,.16)")
      lane.addColorStop(1, "rgba(3,8,23,0)")
      dust.fillStyle = lane
      dust.fillRect(gx - radius, gy - radius, radius * 2, radius * 2)
    }
    const draw = (time: number) => {
      if (time - last < 33 && !reduced.matches) {
        frame = requestAnimationFrame(draw)
        return
      }
      // Accumulate visible time so returning to the app never jumps the sky.
      elapsed += Number.isFinite(last) && last > 0
        ? Math.min((time - last) / 1000, 0.1)
        : 0
      last = time
      const t = reduced.matches ? 0 : elapsed
      x += (px - x) * 0.035
      y += (py - y) * 0.035
      ctx.fillStyle = "#040817"
      ctx.fillRect(0, 0, width, height)
      const glow = ctx.createRadialGradient(
        width * 0.65,
        height * 0.35,
        0,
        width * 0.65,
        height * 0.35,
        width * 0.9,
      )
      glow.addColorStop(0, "#172342")
      glow.addColorStop(0.45, "#0c1530")
      glow.addColorStop(1, "#040817")
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)
      ctx.save()
      ctx.translate(
        width * 0.57 + x * 4 + Math.sin(t * 0.09) * 24,
        height * 0.35 + y * 4 + Math.sin(t * 0.07) * 16,
      )
      ctx.rotate(0.62 + Math.sin(t * 0.04) * 0.025)
      ctx.globalAlpha = 0.52
      // Crossfade two travelling cloud layers. Each fades out before wrapping,
      // keeping the drift continuous without a visible reset or texture seam.
      for (let layer = 0; layer < 2; layer++) {
        const progress = (t / 48 + layer * 0.5) % 1
        ctx.globalAlpha = 0.52 * Math.sin(progress * Math.PI) ** 2
        ctx.drawImage(
          galaxy,
          -width * 0.42 + (progress - 0.5) * width * 0.28,
          -height * 0.85 + (progress - 0.5) * height * 0.3,
          width * 0.84,
          height * 1.8,
        )
      }
      ctx.restore()
      ctx.save()
      ctx.translate(
        width * 0.48 + x * 5 + Math.sin(t * 0.12) * 36,
        height * 0.3 + y * 5 + Math.sin(t * 0.08) * 24,
      )
      ctx.rotate(-0.55)
      for (let i = 0; i < 7; i++) {
        const haze = ctx.createRadialGradient(
          0,
          i * 21,
          0,
          0,
          i * 21,
          width * 0.75,
        )
        haze.addColorStop(
          0,
          `rgba(${i % 2 ? "130,135,184" : "101,133,164"},.035)`,
        )
        haze.addColorStop(1, "rgba(40,60,110,0)")
        ctx.save()
        ctx.scale(1.8, 0.16 + i * 0.015)
        ctx.fillStyle = haze
        ctx.fillRect(-width, -width, width * 2, width * 2)
        ctx.restore()
      }
      ctx.restore()
      for (const s of stars) {
        const sx =
            ((s.x * (width + 50) + t * (0.7 + s.z * 2.8)) % (width + 50)) -
            25 +
            x * s.z * 12,
          sy = ((s.y * (height + 30) + t * (0.15 + s.z * 0.5)) % (height + 30)) - 15 + y * s.z * 9
        const alpha = 0.3 + s.z * 0.45 + Math.sin(t * (0.65 + s.z * 0.45) + s.phase) * 0.2,
          r = 0.35 + s.z ** 4 * 1.35
        ctx.fillStyle = s.warm
          ? `rgba(255,224,189,${alpha})`
          : `rgba(215,230,255,${alpha})`
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
        if (s.z > 0.985) {
          ctx.strokeStyle = `rgba(211,226,255,${alpha * 0.22})`
          ctx.lineWidth = 0.6
          ctx.beginPath()
          ctx.moveTo(sx - 4, sy)
          ctx.lineTo(sx + 4, sy)
          ctx.moveTo(sx, sy - 4)
          ctx.lineTo(sx, sy + 4)
          ctx.stroke()
        }
      }
      if (!reduced.matches && !document.hidden)
        frame = requestAnimationFrame(draw)
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const scale = Math.min(devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      cancelAnimationFrame(frame)
      last = -Infinity
      draw(performance.now())
    }
    const move = (e: PointerEvent) => {
      if (!reduced.matches) {
        px = e.clientX / innerWidth - 0.5
        py = e.clientY / innerHeight - 0.5
      }
    }
    const visibility = () => {
      cancelAnimationFrame(frame)
      if (!document.hidden) {
        last = -Infinity
        draw(performance.now())
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener("pointermove", move, { passive: true })
    document.addEventListener("visibilitychange", visibility)
    reduced.addEventListener("change", visibility)
    resize()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("pointermove", move)
      document.removeEventListener("visibilitychange", visibility)
      reduced.removeEventListener("change", visibility)
    }
  }, [active])
  return (
    <div className="sleep-sky" aria-hidden="true">
      <canvas ref={ref} />
      <div className="sleep-sky-shade" />
    </div>
  )
}
