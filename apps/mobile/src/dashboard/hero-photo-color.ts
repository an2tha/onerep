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

    return vivid(red / total, green / total, blue / total)
  } catch {
    return undefined
  }
}

/**
 * The average of a photograph, made fit to tint a page with.
 *
 * The weighted mean above is honest and almost always useless: shoot a runner
 * on wet asphalt at dusk and it hands back a grey the colour of the asphalt,
 * which mixed into a near-black page is nothing at all, and mixed into a paper
 * one is a smudge. So the hue survives the trip and the saturation and
 * lightness do not — both are forced into a band where the colour still reads
 * as the photograph's own but is strong enough to see.
 *
 * A genuinely colourless frame keeps its greyness, only lifted: there is no hue
 * to invent, and inventing one would make the page lie about the picture.
 */
function vivid(r: number, g: number, b: number): string {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const span = max - min
  const lightness = (max + min) / 2

  let hue = 0
  if (span !== 0) {
    if (max === red) hue = ((green - blue) / span) % 6
    else if (max === green) hue = (blue - red) / span + 2
    else hue = (red - green) / span + 4
    hue *= 60
    if (hue < 0) hue += 360
  }

  const saturation =
    span === 0 ? 0 : span / (1 - Math.abs(2 * lightness - 1) || 1)

  // Floors, not fixed values: a vivid photograph keeps its own intensity.
  const s = span === 0 ? 0 : Math.min(0.82, Math.max(0.5, saturation * 1.6))
  const l = Math.min(0.68, Math.max(0.52, lightness * 0.6 + 0.34))

  return `hsl(${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
}
