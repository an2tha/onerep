/**
 * Pulls a single representative colour out of the hero photograph.
 *
 * The dashboard below the hero is flat page colour, which looks inert under a
 * photo that changes every twenty seconds. Tinting the page with a colour taken
 * from the picture ties the two together, and means the background moves when
 * the photograph does rather than being one more fixed value in the theme.
 */

/** Downscale target. Twelve squared is 144 samples: plenty for an average. */
const SAMPLE = 12

/**
 * A weighted average of `src`, as an `rgb()` string.
 *
 * Saturation is the weight, because a straight mean of a photograph is almost
 * always the same disappointing grey-brown — the road, the sky, and the wall
 * outvote the one red jersey that gives the image its character. The weight
 * never reaches zero, so a genuinely colourless photo still returns its grey
 * instead of dividing by nothing.
 *
 * Returns `undefined` on any failure, which the caller reads as "leave the
 * background alone": a decode error, a missing 2D context, or a cross-origin
 * image that tainted the canvas.
 */
export async function sampleAmbientColor(
  src: string
): Promise<string | undefined> {
  if (typeof document === "undefined") return undefined
  try {
    const image = new Image()
    // Cached photos are blob: URLs and same-origin. A network URL needs the
    // opt-in, or `getImageData` throws on a tainted canvas.
    if (!src.startsWith("blob:")) image.crossOrigin = "anonymous"
    image.src = src
    await image.decode()

    const canvas = document.createElement("canvas")
    canvas.width = SAMPLE
    canvas.height = SAMPLE
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return undefined

    context.drawImage(image, 0, 0, SAMPLE, SAMPLE)
    const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE)

    let red = 0
    let green = 0
    let blue = 0
    let total = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const saturation = max === 0 ? 0 : (max - min) / max
      const weight = 0.25 + saturation
      red += r * weight
      green += g * weight
      blue += b * weight
      total += weight
    }
    if (total === 0) return undefined

    return `rgb(${Math.round(red / total)} ${Math.round(green / total)} ${Math.round(blue / total)})`
  } catch {
    return undefined
  }
}
