export const COACH_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const

const MAX_SOURCE_BYTES = 12 * 1024 * 1024
const MAX_EDGE = 1_600

export function coachImageValidationError(file: Pick<File, "type" | "size">) {
  if (
    !COACH_IMAGE_TYPES.includes(file.type as (typeof COACH_IMAGE_TYPES)[number])
  )
    return "Choose a JPEG, PNG, or WebP image."
  if (file.size <= 0) return "That image is empty."
  if (file.size > MAX_SOURCE_BYTES) return "Choose an image smaller than 12 MB."
  return null
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not prepare image")),
      "image/jpeg",
      0.84
    )
  })
}

async function loadImageSource(file: File): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  await image.decode()
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  }
}

export async function prepareCoachImage(file: File) {
  const error = coachImageValidationError(file)
  if (error) throw new Error(error)
  const image = await loadImageSource(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  let blob: Blob
  try {
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Image preparation is unavailable")
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height)
    blob = await canvasBlob(canvas)
  } finally {
    image.cleanup()
  }
  if (blob.size > 5 * 1024 * 1024) {
    throw new Error("The prepared image is still too large.")
  }
  const baseName =
    file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "coach-image"
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  })
}
