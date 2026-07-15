const CACHE_NAME = "onerep-app-v2"
const APP_SHELL = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/app-icon.svg",
  "/favicon.svg",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return
  if (url.pathname.startsWith("/_convex/")) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((response) => response ?? caches.match("/"))
      )
    )
    return
  }

  const cacheableDestination = ["font", "image", "script", "style"].includes(
    request.destination
  )
  if (!cacheableDestination) return

  const hasExpectedMimeType = (response) => {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
    if (request.destination === "script") {
      return (
        contentType.includes("javascript") ||
        contentType.includes("ecmascript") ||
        contentType.includes("application/wasm")
      )
    }
    if (request.destination === "style") return contentType.includes("text/css")
    if (request.destination === "image") return contentType.startsWith("image/")
    return true
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && hasExpectedMimeType(response)) {
            const copy = response.clone()
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
            )
          }
          return response
        })
        .catch(() => cached)

      return cached ?? network
    })
  )
})
