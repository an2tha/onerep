/**
 * Keeps the hero photographs on the device.
 *
 * The app's service worker deliberately ignores cross-origin requests, so it
 * will never cache these on its own. That left the hero as the one part of an
 * otherwise offline-capable app that went blank on a train — so this stores the
 * bytes in Cache Storage on first run and serves them from there afterwards.
 *
 * Every path through here degrades to the plain network URL. Cache Storage is
 * missing in insecure contexts and unreliable in some embedded web views, and
 * a photograph is not worth a crash: if any of it fails, the hero simply
 * behaves the way it did before, and falls back to its gradient when offline.
 */

import { HERO_PHOTOS } from "./hero-photo"

const CACHE_NAME = "onerep-hero-photos-v1"
/** Older revisions of this cache, deleted on the first successful open. */
const CACHE_PREFIX = "onerep-hero-photos-"

function cacheStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof caches !== "undefined" &&
    window.isSecureContext !== false
  )
}

/** Drop superseded cache versions and any photo no longer in the rotation. */
async function evictStale(cache: Cache) {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key))
  )

  const current = new Set(HERO_PHOTOS)
  const cached = await cache.keys()
  await Promise.all(
    cached
      .filter((request) => !current.has(request.url))
      .map((request) => cache.delete(request))
  )
}

/**
 * Pull every photo in the rotation into Cache Storage.
 *
 * Called once per launch during idle time. Requests run sequentially: this is
 * background work for a photograph, and firing a dozen parallel image
 * downloads would compete with the queries that actually populate the screen.
 */
export async function prefetchHeroPhotos(): Promise<void> {
  if (!cacheStorageAvailable()) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await evictStale(cache)
    for (const url of HERO_PHOTOS) {
      if (await cache.match(url)) continue
      try {
        const response = await fetch(url, { mode: "cors", cache: "default" })
        // An error response cached here would be served as a broken image for
        // as long as the cache lives.
        if (response.ok) await cache.put(url, response)
      } catch {
        // Offline, or this one photo is gone. The rest still deserve a try.
      }
    }
  } catch {
    // No Cache Storage; the hero falls back to loading over the network.
  }
}

/**
 * A usable `src` for `url`, preferring the stored copy.
 *
 * Returns a `blob:` URL when the photo is cached — the caller owns it and must
 * revoke it — and the original URL otherwise.
 */
export async function resolveHeroPhoto(url: string): Promise<string> {
  if (!cacheStorageAvailable()) return url
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    if (hit) return URL.createObjectURL(await hit.blob())

    const response = await fetch(url, { mode: "cors", cache: "default" })
    if (!response.ok) return url
    await cache.put(url, response.clone())
    return URL.createObjectURL(await response.blob())
  } catch {
    return url
  }
}
