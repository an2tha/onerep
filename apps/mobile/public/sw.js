const CACHE_PREFIX = "onerep-app-"
const CACHE_NAME = "onerep-app-v3"
const APP_SHELL = ["/", "/index.html"]
const INSTALL_ASSETS = [
  "/site.webmanifest",
  "/app-icon.svg",
  "/favicon.svg",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // The HTML shell is required for offline navigation. Install assets are
      // best-effort so one optional icon cannot prevent service-worker install.
      await cache.addAll(APP_SHELL)
      await Promise.allSettled(
        INSTALL_ASSETS.map((asset) => cache.add(asset))
      )
    })
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
            )
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

async function offlineShell() {
  return (
    (await caches.match("/index.html")) ||
    (await caches.match("/")) ||
    new Response("OneRep is offline. Reconnect once to finish setup.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  )
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request)
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
    if (response.ok && contentType.includes("text/html")) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put("/index.html", response.clone())
    }
    return response
  } catch {
    return offlineShell()
  }
}

function hasExpectedMimeType(request, response) {
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
  if (request.destination === "font") {
    return contentType.includes("font") || contentType.includes("application/octet-stream")
  }
  return true
}

async function handleStaticAsset(event, request) {
  const cached = await caches.match(request)
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && hasExpectedMimeType(request, response)) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached || Response.error())

  // Hashed Vite assets are immutable. Return cached bytes immediately and
  // refresh in the background; first-time requests wait for the network.
  if (cached) {
    event.waitUntil(network)
    return cached
  }
  return network
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return
  if (url.pathname.startsWith("/_convex/")) return

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request))
    return
  }

  const cacheableDestination = ["font", "image", "script", "style"].includes(
    request.destination
  )
  if (!cacheableDestination) return

  event.respondWith(handleStaticAsset(event, request))
})
