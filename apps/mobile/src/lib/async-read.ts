/** Bound read-only work when a native bridge or local resource never replies. */
export async function withReadTimeout<T>(
  read: Promise<T>,
  timeoutMs = 8000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Read timed out")), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
