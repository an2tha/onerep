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

  test("both pose models are actually present to be served", () => {
    // They are build artefacts of `scripts/form-JEPA/export_onnx.py`, not
    // source, so the only thing stopping a deploy that 404s on every pose
    // request is checking they were exported.
    const models = readdirSync(path.join(publicDir, "models"))

    expect(models).toContain("yolo11n_pose_448_fp32.onnx")
    expect(models).toContain("motionbert_lite_int8.onnx")
  })

  test("the unquantized lifter is not shipped", () => {
    // fp32 MotionBERT is 64 MB and spills its weights into a sidecar .data
    // file. Either would fail the cap above; the .data file would also load as
    // a silently broken model, since nothing fetches it.
    //
    // The detector is deliberately fp32 and is not covered by this: quantizing
    // it costs 10x in speed, which is why it ships at full precision.
    const models = readdirSync(path.join(publicDir, "models"))

    expect(models.filter((name) => name.startsWith("motionbert"))).toEqual([
      "motionbert_lite_int8.onnx",
    ])
    expect(models.filter((name) => name.endsWith(".data"))).toEqual([])
  })

  test("the Needle engine and its weights are present to be served", () => {
    // Same argument as the pose models: fetched from Hugging Face by
    // `bun run needle:fetch`, never committed, and a deploy without them 404s
    // every on-device tool call rather than falling back to anything.
    const needle = readdirSync(path.join(publicDir, "needle"))

    expect(needle).toContain("needle2.cact")
    // The weights the app actually loads. Copied by `needle:tuned`, which
    // `needle:fetch` chains — a deploy that serves only the stock blob leaves
    // every session 404ing on the one it asks for by name.
    expect(needle).toContain("needle2-onerep.cact")
    expect(needle).toContain("needle.js")
    expect(needle).toContain("needle.wasm")
  })

  test("models are addressed by absolute origin on native only", async () => {
    // On native these sit outside the OTA bundle — too big to ship in every
    // update — so a root-relative path resolves inside the bundle directory
    // Capgo swapped in and 404s after the first update. On the web the reverse
    // holds: the same origin already serves them, and reaching for the
    // production origin means dev fetches a model that is not deployed there
    // yet and gets the SPA shell back with a 200.
    const source = await Bun.file(
      path.join(import.meta.dir, "src/lib/onnx-runtime.ts")
    ).text()

    expect(source).toMatch(
      /isNativePlatform\(\)\s*\?\s*`\$\{otaOrigin\(\)\}\/models`\s*:\s*"\/models"/
    )
  })

  test("the Needle assets follow the same origin rule", async () => {
    const source = await Bun.file(
      path.join(import.meta.dir, "src/lib/needle.ts")
    ).text()

    expect(source).toMatch(
      /isNativePlatform\(\)\s*\?\s*`\$\{otaOrigin\(\)\}\/needle`\s*:\s*"\/needle"/
    )
  })
})
