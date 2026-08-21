import type { ClipStill, FormCoachAngle } from "@/lib/form-coach"

/**
 * Turning a recorded angle into frames a pose model can look at.
 *
 * None of this is specific to a pose backend — it is browser video decoding and
 * the several WebKit workarounds that decoding a clip on an iPhone turned out to
 * need. It lived inside the MediaPipe provider until the backend was swapped;
 * the fixes below were expensive enough to learn that they are kept in one place
 * rather than reimplemented per provider.
 */

/**
 * How densely clips are sampled.
 *
 * 12fps rather than 10 buys resolution where it is scarcest — the turnaround at
 * the bottom of a rep, which is both the fastest part of the movement and the
 * part being judged. It costs 20% more detector passes, which stopped mattering
 * once the detector went to fp32 at 320: a frame is 5.8 ms, not 206 ms.
 *
 * It also sets how much clip fits in one lifter window. MotionBERT reads at most
 * 243 frames, so a single window now spans 20s rather than 24s — still longer
 * than almost every set, and clips past it are lifted in consecutive windows
 * that share one coordinate frame anyway.
 */
export const SAMPLE_FPS = 12

/**
 * Stills grabbed per clip while it is being decoded, before rep detection has
 * run. Sampled generously here because the decode is already paid for; the
 * expensive step is shipping them, and only five ever leave the device.
 */
const STILL_POOL_PER_ANGLE = 10

/** Longest edge of a still, in pixels. Enough to see a knee, small enough to send. */
const STILL_MAX_EDGE = 448

/** A decode or seek that has not answered in this long is not going to. */
const DECODE_TIMEOUT_MS = 15_000

/** Below this, two times are the same frame as far as any decoder cares. */
const SEEK_EPSILON_S = 0.001

export function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/**
 * A video element decoding the clip. It has to be in the document for browsers
 * to decode frames, but is kept off-screen rather than hidden — `display: none`
 * stops decoding on some engines.
 */
function createDecoder(url: string) {
  const video = document.createElement("video")
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.crossOrigin = "anonymous"
  video.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none"
  document.body.appendChild(video)
  // WebKit treats `preload` as a hint and will happily fetch nothing at all
  // until something asks; setting src is not enough on iOS.
  video.load()
  return video
}

function onceReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve()
      return
    }
    let timer = 0
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      video.onloadeddata = null
      video.onerror = null
      if (error) reject(error)
      else resolve()
    }
    timer = window.setTimeout(
      () => finish(new Error("The video took too long to decode")),
      DECODE_TIMEOUT_MS
    )
    video.onloadeddata = () => finish()
    video.onerror = () => finish(new Error("Could not decode the video"))
  })
}

function seekTo(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve, reject) => {
    // Assigning the time the video is *already* at performs no seek, so no
    // `seeked` event is ever fired and the wait never ends. Sampling starts at
    // t=0 on a video whose currentTime is 0, which is why this hung on the
    // very first frame — at exactly 0%, forever — on WebKit. Chrome fires the
    // event anyway, which is why it only ever showed up on the phone.
    if (Math.abs(video.currentTime - seconds) < SEEK_EPSILON_S) {
      resolve()
      return
    }

    // A watchdog as well, because a decoder that drops a `seeked` for any other
    // reason should surface as an error the user can retry, never as a
    // progress bar that sits still.
    let timer = 0
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      video.onseeked = null
      video.onerror = null
      if (error) reject(error)
      else resolve()
    }
    timer = window.setTimeout(
      () => finish(new Error("The video stopped responding while being read")),
      DECODE_TIMEOUT_MS
    )

    video.onseeked = () => finish()
    video.onerror = () => finish(new Error("Could not seek the video"))
    video.currentTime = seconds
  })
}

/**
 * The current video frame as a small JPEG, or null if it cannot be drawn.
 *
 * Cross-origin frames taint the canvas and throw on export; the clips here are
 * always same-origin blobs, but a still is a nice-to-have and never worth
 * failing an analysis over.
 */
function grabStill(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null

  const scale = Math.min(1, STILL_MAX_EDGE / Math.max(width, height))
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext("2d")
  if (!context) return null

  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.6)
  } catch {
    return null
  }
}

/** A photo scaled down to the size a still is sent at. */
export function shrinkToStill(bitmap: ImageBitmap): ClipStill[] {
  const scale = Math.min(
    1,
    STILL_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) return []
  try {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return [{ timeMs: 0, dataUrl: canvas.toDataURL("image/jpeg", 0.6) }]
  } catch {
    return []
  }
}

/** One decoded frame handed to whatever is reading the clip. */
export type SampledFrame = {
  timeMs: number
  /** The decoder itself, positioned at `timeMs`, ready to be drawn from. */
  video: HTMLVideoElement
  width: number
  height: number
}

export type SampledClip<T> = {
  frames: T[]
  stills: ClipStill[]
}

/**
 * Walks a clip frame by frame, handing each to `read`.
 *
 * Seeking rather than playing keeps sampling deterministic and independent of
 * playback speed, which matters because these clips are analysed, not watched.
 *
 * Stills are grabbed on the same pass. Landmarks say where the joints were;
 * they cannot say that a second lifter walked into shot, that the camera was
 * hand-held, or what the bar was doing — and those are the things that decide
 * whether the numbers mean anything.
 */
export async function sampleClip<T>(
  angle: FormCoachAngle,
  read: (frame: SampledFrame) => T | Promise<T>,
  onFraction?: (fraction: number) => void
): Promise<SampledClip<T>> {
  const blob = base64ToBlob(angle.base64, angle.mimeType)
  const url = URL.createObjectURL(blob)
  const video = createDecoder(url)
  const canvas = document.createElement("canvas")

  try {
    await onceReady(video)
    // Uploads sometimes report no duration until decoded; fall back to the
    // duration measured at capture time.
    const durationMs = Number.isFinite(video.duration)
      ? video.duration * 1000
      : angle.durationMs

    const frames: T[] = []
    const stills: ClipStill[] = []
    const step = 1000 / SAMPLE_FPS
    const sampleCount = Math.max(1, Math.ceil(durationMs / step))
    const stillEvery = Math.max(
      1,
      Math.ceil(sampleCount / STILL_POOL_PER_ANGLE)
    )

    let sample = 0
    for (let timeMs = 0; timeMs < durationMs; timeMs += step) {
      await seekTo(video, timeMs / 1000)
      frames.push(
        await read({
          timeMs: Math.round(timeMs),
          video,
          width: video.videoWidth,
          height: video.videoHeight,
        })
      )
      if (sample % stillEvery === 0) {
        const dataUrl = grabStill(video, canvas)
        if (dataUrl) stills.push({ timeMs: Math.round(timeMs), dataUrl })
      }
      sample += 1
      onFraction?.(Math.min((timeMs + step) / durationMs, 1))
    }
    return { frames, stills }
  } finally {
    video.onloadeddata = null
    video.onseeked = null
    video.onerror = null
    video.removeAttribute("src")
    video.load()
    video.remove()
    URL.revokeObjectURL(url)
  }
}
