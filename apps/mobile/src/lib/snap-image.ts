/** Bound uploads from native cameras and photo libraries to the snap API limit. */
export async function prepareSnapImage(blob: Blob): Promise<Blob> {
  const maxBytes = 4 * 1024 * 1024
  if (blob.size <= maxBytes) return blob
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    let edge = 1600
    while (edge >= 400) {
      const scale = Math.min(1, edge / Math.max(image.width, image.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Image processing unavailable")
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const resized = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8),
      )
      if (resized && resized.size <= maxBytes) return resized
      edge = Math.floor(edge * 0.7)
    }
    throw new Error("Image is too large")
  } finally {
    URL.revokeObjectURL(url)
  }
}
