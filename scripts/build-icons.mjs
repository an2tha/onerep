#!/usr/bin/env node
/**
 * The app icon, everywhere it has to exist.
 *
 * One mark, defined once, below. Everything else — the favicons, the PWA set,
 * the 1024 iOS raster, five densities of Android launcher, the notification
 * silhouette, the splash screens, the marketing mirrors — is generated from
 * it, because the last icon was maintained by hand across four directories
 * and the copies had already drifted apart.
 *
 * Run it after changing the mark:
 *
 *     bun run icons:build
 *
 * Needs `rsvg-convert` and `magick` on PATH (`brew install librsvg
 * imagemagick`). Deliberately not part of the build: the outputs are
 * committed, so CI never needs either tool.
 */

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const work = mkdtempSync(join(tmpdir(), "onerep-icons-"))

// ── The mark ───────────────────────────────────────────────────────────────
// A kettlebell whose bell is a heart, with the arrow that lifts out of it —
// drawn as one line where it can be: the heart's lower-right edge does not
// close, it leaves as the arrow. Monoline at 25 units on a 512 grid, so it
// still holds together at 32px in a browser tab.
const STROKES = [
  // handle
  "M152 204 C 146 144 179 120 230 120 C 281 120 313 144 307 204",
  // the bell: heart's left half, its floor, and out into the arrow
  "M224 242 C 208 200 173 180 143 186 C 111 192 89 218 91 256 C 93 296 125 336 179 362 C 203 372 231 360 253 342",
  // right half, stopping where the arrow crosses it
  "M224 242 C 241 202 275 184 305 192 C 329 200 341 220 335 240",
  // the arrow, carrying on out of the heart
  "M253 342 C 293 320 333 280 393 200",
  // and its tail, sweeping back under
  "M359 280 C 359 324 343 370 303 404 C 271 430 243 436 227 418 C 213 402 219 382 235 378",
]
const ARROWHEAD = "M426 158 L 409 231 L 356 191 Z"

/** Warm off-white and warm near-black: the app's own surfaces, not a generic grey. */
const LIGHT_BG = "#f4f3ef"
const LIGHT_MARK = "#1f2321"
const DARK_BG = "#0d0d0c"
const DARK_MARK = "#e8e6df"
/** iOS masks its own corners; everything that keeps its own tile uses this. */
const RADIUS = 0.215

function markGroup(color, scale = 1, dy = 4) {
  const inner = [
    `<g fill="none" stroke="${color}" stroke-width="25" stroke-linecap="round" stroke-linejoin="round">`,
    ...STROKES.map((d) => `<path d="${d}"/>`),
    `</g>`,
    `<path d="${ARROWHEAD}" fill="${color}" stroke="${color}" stroke-width="11" stroke-linejoin="round"/>`,
  ].join("")
  return `<g transform="translate(256 ${256 + dy}) scale(${scale}) translate(-256 -256)">${inner}</g>`
}

/**
 * `mode: "tile"` keeps its own rounded corners (favicons, the in-app mark),
 * `"bleed"` fills the square and lets the platform mask it, `"safe"` is the
 * maskable/adaptive variant with the mark pulled into the safe circle.
 */
function tile({ mode = "tile", dark = false, size = 512 } = {}) {
  const bg = dark ? DARK_BG : LIGHT_BG
  const fg = dark ? DARK_MARK : LIGHT_MARK
  const shape =
    mode === "tile"
      ? `<rect width="512" height="512" rx="${Math.round(512 * RADIUS)}" fill="${bg}"/>`
      : `<rect width="512" height="512" fill="${bg}"/>`
  const scale = mode === "safe" ? 0.72 : 0.99
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" role="img" aria-label="OneRep">${shape}${markGroup(fg, scale)}</svg>`
}

/** The mark alone, for the Android adaptive foreground. */
function foreground(scale = 0.62) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${markGroup(LIGHT_MARK, scale)}</svg>`
}

/**
 * The one file a human should ever open: it carries both modes itself, so the
 * in-app mark and the browser tab follow the theme without a second asset.
 */
function themedSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512" role="img" aria-label="OneRep">
  <style>
    .bg { fill: ${LIGHT_BG} }
    .fg { stroke: ${LIGHT_MARK} }
    .fill { fill: ${LIGHT_MARK}; stroke: ${LIGHT_MARK} }
    @media (prefers-color-scheme: dark) {
      .bg { fill: ${DARK_BG} }
      .fg { stroke: ${DARK_MARK} }
      .fill { fill: ${DARK_MARK}; stroke: ${DARK_MARK} }
    }
  </style>
  <rect class="bg" width="512" height="512" rx="${Math.round(512 * RADIUS)}"/>
  <g transform="translate(256 260) scale(0.99) translate(-256 -256)">
    <g class="fg" fill="none" stroke-width="25" stroke-linecap="round" stroke-linejoin="round">
${STROKES.map((d) => `      <path d="${d}"/>`).join("\n")}
    </g>
    <path class="fill" d="${ARROWHEAD}" stroke-width="11" stroke-linejoin="round"/>
  </g>
</svg>
`
}

// ── Plumbing ───────────────────────────────────────────────────────────────

let written = 0

function svgToFile(svg, name) {
  const path = join(work, name)
  writeFileSync(path, svg)
  return path
}

function png(svg, out, { width, height = width, flatten = null }) {
  const src = svgToFile(svg, `${Math.random().toString(36).slice(2)}.svg`)
  mkdirSync(dirname(out), { recursive: true })
  execFileSync("rsvg-convert", ["-w", String(width), "-h", String(height), src, "-o", out])
  if (flatten) {
    execFileSync("magick", [out, "-background", flatten, "-alpha", "remove", "-alpha", "off", out])
  }
  written++
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
  written++
}

const P = (...parts) => join(ROOT, ...parts)

// ── The canonical source ───────────────────────────────────────────────────
write(P("assets", "app-icon.svg"), themedSvg())

// ── Web: the app's own public dir, and the marketing mirror ────────────────
const mobilePublic = P("apps", "mobile", "public")
const webSrc = P("apps", "web", "src")

for (const dir of [mobilePublic, webSrc]) {
  write(join(dir, "app-icon.svg"), themedSvg())
}
write(join(mobilePublic, "favicon.svg"), themedSvg())

for (const dir of [mobilePublic, webSrc]) {
  png(tile(), join(dir, "favicon-16x16.png"), { width: 16 })
  png(tile(), join(dir, "favicon-32x32.png"), { width: 32 })
  // iOS rounds the touch icon itself, and a rounded PNG under that mask
  // leaves grey corners.
  png(tile({ mode: "bleed" }), join(dir, "apple-touch-icon.png"), {
    width: 180,
    flatten: LIGHT_BG,
  })
  execFileSync("magick", [
    join(dir, "favicon-32x32.png"),
    join(dir, "favicon-16x16.png"),
    join(dir, "favicon.ico"),
  ])
  written++
}

png(tile(), join(mobilePublic, "icon-192.png"), { width: 192 })
png(tile(), join(mobilePublic, "icon-512.png"), { width: 512 })
png(tile({ mode: "safe" }), join(mobilePublic, "icon-maskable-192.png"), { width: 192 })
png(tile({ mode: "safe" }), join(mobilePublic, "icon-maskable-512.png"), { width: 512 })

// The organisation logo in the marketing page's JSON-LD, which used to point
// at a photograph of somebody holding a battle rope.
png(tile(), P("apps", "web", "static", "logo-512.png"), { width: 512 })

// ── iOS ────────────────────────────────────────────────────────────────────
const iosIcons = P("apps", "mobile", "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset")
png(tile({ mode: "bleed" }), join(iosIcons, "AppIcon-512@2x.png"), {
  width: 1024,
  flatten: LIGHT_BG,
})

// The widget/Live Activity target declares light, dark and tinted slots and
// has shipped with all three empty since the day it was added.
const widgetIcons = P("apps", "mobile", "ios", "App", "OneRep", "Assets.xcassets", "AppIcon.appiconset")
png(tile({ mode: "bleed" }), join(widgetIcons, "AppIcon-widget.png"), {
  width: 1024,
  flatten: LIGHT_BG,
})
png(tile({ mode: "bleed", dark: true }), join(widgetIcons, "AppIcon-widget-dark.png"), {
  width: 1024,
  flatten: DARK_BG,
})
// Tinted is composited by the system against its own colour, so it wants the
// mark as luminance on black rather than a second colour scheme.
png(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512"><rect width="512" height="512" fill="#000"/>${markGroup("#ffffff", 0.99)}</svg>`,
  join(widgetIcons, "AppIcon-widget-tinted.png"),
  { width: 1024, flatten: "#000000" }
)
write(
  join(widgetIcons, "Contents.json"),
  `${JSON.stringify(
    {
      images: [
        { filename: "AppIcon-widget.png", idiom: "universal", platform: "ios", size: "1024x1024" },
        {
          appearances: [{ appearance: "luminosity", value: "dark" }],
          filename: "AppIcon-widget-dark.png",
          idiom: "universal",
          platform: "ios",
          size: "1024x1024",
        },
        {
          appearances: [{ appearance: "luminosity", value: "tinted" }],
          filename: "AppIcon-widget-tinted.png",
          idiom: "universal",
          platform: "ios",
          size: "1024x1024",
        },
      ],
      info: { author: "xcode", version: 1 },
    },
    null,
    2
  )}\n`
)

// The watch app had no catalog at all, which App Store Connect only mentions
// at upload time: "No icons found for watch application". watchOS takes one
// 1024 raster and derives every size it needs, and it must be opaque — the
// alpha channel is what the validator rejects next.
const watchIcons = P("apps", "mobile", "ios", "App", "OneRepWatch", "Assets.xcassets", "AppIcon.appiconset")
png(tile({ mode: "bleed" }), join(watchIcons, "AppIcon-watch.png"), {
  width: 1024,
  flatten: LIGHT_BG,
})
write(
  join(watchIcons, "Contents.json"),
  `${JSON.stringify(
    {
      images: [
        { filename: "AppIcon-watch.png", idiom: "universal", platform: "watchos", size: "1024x1024" },
      ],
      info: { author: "xcode", version: 1 },
    },
    null,
    2
  )}\n`
)
write(
  P("apps", "mobile", "ios", "App", "OneRepWatch", "Assets.xcassets", "Contents.json"),
  `${JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2)}\n`
)

// ── Android ────────────────────────────────────────────────────────────────
const androidRes = P("apps", "mobile", "android", "app", "src", "main", "res")
/** mdpi is the unit; every other density is a multiple of it. */
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

for (const [density, factor] of Object.entries(DENSITIES)) {
  const dir = join(androidRes, `mipmap-${density}`)
  png(tile({ mode: "bleed" }), join(dir, "ic_launcher.png"), { width: Math.round(48 * factor) })
  png(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="${LIGHT_BG}"/>${markGroup(LIGHT_MARK, 0.88)}</svg>`,
    join(dir, "ic_launcher_round.png"),
    { width: Math.round(48 * factor) }
  )
  // 108dp of canvas for 66dp of safe zone: the mark has to survive being
  // cropped to a circle, a squircle or whatever the launcher fancies.
  png(foreground(), join(dir, "ic_launcher_foreground.png"), {
    width: Math.round(108 * factor),
  })
}

write(
  join(androidRes, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${LIGHT_BG.toUpperCase()}</color>
</resources>
`
)

// The status bar silhouette: Android draws it as a mask, so only the shape
// survives — colour and background are thrown away.
write(
  join(androidRes, "drawable", "ic_stat_onerep.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/build-icons.mjs. Android masks this to a single
     colour, so it carries the mark's outline and nothing else. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
${STROKES.map(
  (d) => `    <path
        android:pathData="${d}"
        android:strokeWidth="30"
        android:strokeColor="#FFFFFFFF"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"/>`
).join("\n")}
    <path
        android:pathData="${ARROWHEAD}"
        android:fillColor="#FFFFFFFF"
        android:strokeWidth="14"
        android:strokeColor="#FFFFFFFF"
        android:strokeLineJoin="round"/>
</vector>
`
)

// ── Splash screens ─────────────────────────────────────────────────────────
// Both platforms shipped the Capacitor default: a small blue logo that is not
// ours on a white field that is not ours either.
function splash({ width, height, dark = false }) {
  const bg = dark ? DARK_BG : LIGHT_BG
  const fg = dark ? DARK_MARK : LIGHT_MARK
  const mark = Math.round(Math.min(width, height) * 0.24)
  const x = Math.round((width - mark) / 2)
  const y = Math.round((height - mark) / 2)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${bg}"/><svg x="${x}" y="${y}" width="${mark}" height="${mark}" viewBox="0 0 512 512">${markGroup(fg, 0.99)}</svg></svg>`
}

const iosSplash = P("apps", "mobile", "ios", "App", "App", "Assets.xcassets", "Splash.imageset")
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
]) {
  png(splash({ width: 2732, height: 2732 }), join(iosSplash, name), {
    width: 2732,
    flatten: LIGHT_BG,
  })
}

const ANDROID_SPLASH = {
  drawable: [480, 320],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
}
for (const [dir, [width, height]] of Object.entries(ANDROID_SPLASH)) {
  png(splash({ width, height }), join(androidRes, dir, "splash.png"), {
    width,
    height,
    flatten: LIGHT_BG,
  })
}

rmSync(work, { recursive: true, force: true })
console.log(`wrote ${written} icon files`)
