const rawServerUrl =
  (import.meta.env.VITE_DATA_API_URL as string | undefined) ||
  (import.meta.env.VITE_SERVER_URL as string | undefined)

export const dataApiBaseUrl = rawServerUrl?.replace(/\/+$/, "") ?? null

export function dataApiUrl(path: string): string {
  if (!dataApiBaseUrl) {
    throw new Error("VITE_DATA_API_URL or VITE_SERVER_URL environment variable is required")
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const prefix =
    dataApiBaseUrl.endsWith("/api/v1") || normalizedPath.startsWith("/api/")
      ? ""
      : "/api/v1"

  return `${dataApiBaseUrl}${prefix}${normalizedPath}`
}

export async function dataApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(dataApiUrl(path), {
    credentials: "omit",
    ...init,
  })

  if (!response.ok) {
    throw new Error(`Data API request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}
