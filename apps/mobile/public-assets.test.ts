/**
 * Cloudflare Pages rejects any single file over 25 MiB, and it rejects it at
 * upload time — after tests, after the Convex deploy, after both builds. A
 * 29 MB pose model landed in `public/` once and took the whole pipeline down
 * at the last step, leaving production on the previous deployment.
 *
 * Everything in `public/` is copied verbatim into `dist/`, so it is the only
 * place an oversized file can enter the deploy without a build step noticing.
 */
import { describe, expect, test } from "bun:test"
import { readdirSync, statSync } from "node:fs"
import path from "node:path"

/** Cloudflare Pages' per-file limit. Not configurable, not raisable. */
const PAGES_MAX_FILE_BYTES = 25 * 1024 * 1024

const publicDir = path.join(import.meta.dir, "public")

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(full) : [full]
  })
}

describe("static assets shipped to Cloudflare Pages", () => {
  test("no file is large enough for Pages to reject the deploy", () => {
    const oversized = filesUnder(publicDir)
      .map((file) => ({ file, bytes: statSync(file).size }))
      .filter(({ bytes }) => bytes > PAGES_MAX_FILE_BYTES)
      .map(
        ({ file, bytes }) =>
          `${path.relative(publicDir, file)} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`
      )

    expect(oversized).toEqual([])
  })

  test("the pose model is fetched from a CDN rather than served by us", async () => {
    // It is 29 MB — over the cap above — so a self-hosted copy cannot deploy.
    const source = await Bun.file(
      path.join(import.meta.dir, "src/lib/form-coach.ts")
    ).text()

    expect(source).toContain("https://storage.googleapis.com/mediapipe-models/")
    expect(
      readdirSync(publicDir).filter((name) => name.includes("pose_landmarker"))
    ).toEqual([])
  })
})
