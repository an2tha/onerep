import { useEffect, useRef, useState } from "react"
import { randomHeroPhoto } from "./hero-photo"
import { prefetchHeroPhotos, resolveHeroPhoto } from "./hero-photo-cache"
import { sampleAmbientColor } from "./hero-photo-color"

/** Matches the crossfade in `.dashboard-photo-hero-photo`. */
const CROSSFADE_MS = 900
const ROTATE_EVERY_MS = 20_000

/** Resolved and decoded, so swapping it in cannot flash an empty frame. */
async function decoded(src: string): Promise<string> {
  const image = new Image()
  image.src = src
  // `decode` rejects on a broken image, which is the signal we want: a photo
  // that will not paint should never become the visible layer.
  if (image.decode) await image.decode()
  return src
}

export type HeroPhoto = {
  /** A `blob:` or network URL, or `undefined` before the first photo lands. */
  src?: string
  /** A colour sampled from `src`, for tinting the page beneath the hero. */
  ambient?: string
}

/**
 * The hero photograph, swapped for another at random every twenty seconds.
 *
 * `src` is `undefined` until the first photo is on the device and decoded — the
 * hero renders its gradient in the meantime. Waiting is deliberate: pointing
 * the `<img>` at a network URL first flashes a broken image on every offline
 * start, and starting the crossfade before the incoming photo has decoded
 * fades to a blank rectangle and back.
 */
export function useHeroPhoto(): HeroPhoto {
  const [src, setSrc] = useState<string>()
  const [ambient, setAmbient] = useState<string>()
  // The original Unsplash URL of what is showing. `src` may be a blob: URL, so
  // it cannot be compared against the rotation list.
  const showingRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // Blob URLs handed to the DOM, revoked only once they have faded out.
    let displayed: string | undefined

    function retire(objectUrl: string | undefined) {
      if (!objectUrl?.startsWith("blob:")) return
      window.setTimeout(
        () => URL.revokeObjectURL(objectUrl),
        CROSSFADE_MS + 250
      )
    }

    async function show(photo: string) {
      let resolved: string | undefined
      try {
        resolved = await resolveHeroPhoto(photo)
        await decoded(resolved)
      } catch {
        // Offline with nothing cached, or a dead URL. Keep whatever is already
        // on screen and try a different photo at the next tick.
        if (resolved?.startsWith("blob:")) URL.revokeObjectURL(resolved)
        return
      }
      if (cancelled) {
        if (resolved.startsWith("blob:")) URL.revokeObjectURL(resolved)
        return
      }
      retire(displayed)
      displayed = resolved
      showingRef.current = photo
      setSrc(resolved)

      // Sampled after the photo is committed, never before: the picture is the
      // point, and the page tint is a courtesy that must not delay it.
      const tint = await sampleAmbientColor(resolved)
      if (!cancelled && tint) setAmbient(tint)
    }

    function scheduleNext() {
      timer = setTimeout(async () => {
        // A tab nobody is looking at does not need new scenery, and swapping
        // while hidden burns the crossfade with no one there to see it.
        if (!document.hidden) await show(randomHeroPhoto(showingRef.current))
        if (!cancelled) scheduleNext()
      }, ROTATE_EVERY_MS)
    }

    void show(randomHeroPhoto()).then(() => {
      if (!cancelled) scheduleNext()
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      retire(displayed)
    }
  }, [])

  // Deliberately after the visible photo is on its way: the rest of the set is
  // for the next rotation, not for this paint.
  useEffect(() => {
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => void prefetchHeroPhotos(), {
          timeout: 8000,
        })
      : window.setTimeout(() => void prefetchHeroPhotos(), 2500)

    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle as number)
      else window.clearTimeout(idle as number)
    }
  }, [])

  return { src, ambient }
}
