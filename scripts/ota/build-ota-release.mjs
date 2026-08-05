#!/usr/bin/env node
/**
 * Packages the built mobile web bundle for over-the-air delivery.
 *
 * Runs in CI after `turbo run build --filter=mobile` and before the Cloudflare
 * Pages deploy. It writes into apps/mobile/dist so the OTA artifacts ride along
 * in the same deployment as the PWA — one atomic publish, so a device can never
 * read a manifest whose zip has not landed yet.
 *
 * Because the output lands in dist, do not run `cap sync` between this script
 * and the next build: sync copies dist wholesale into the native projects and
 * would embed a copy of the bundle inside the app binary. `vite build` empties
 * dist, so a rebuild clears it.
 *
 * Node rather than Bun: @capgo/cli is a Node CLI, the same constraint that puts
 * the wrangler steps on node:22-alpine.
 *
 * Usage:
 *   node scripts/ota/build-ota-release.mjs --dist apps/mobile/dist \
 *     --base-url https://app.onerep.life
 */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

/**
 * Native shells older than this must not receive OTA bundles.
 *
 * Hand-maintained on purpose: raise it in the same commit that makes the web
 * bundle depend on a native capability the older shell does not have. Nothing
 * can infer that coupling, so it has to be a deliberate edit.
 */
const OTA_MIN_NATIVE_VERSION = "1.0.0"

const APP_ID = "com.ananthh.onerep"
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

export class OtaPackagingError extends Error {}

/**
 * Builds the manifest devices poll. Pure, so its shape is unit-testable
 * without running a build.
 */
export function buildManifest({
  version,
  commit,
  checksum,
  baseUrl,
  minNativeVersion = OTA_MIN_NATIVE_VERSION,
  releasedAt = new Date().toISOString(),
}) {
  if (!SEMVER_PATTERN.test(version ?? "")) {
    throw new OtaPackagingError(
      `Bundle version must be semver, got ${JSON.stringify(version)}`
    )
  }
  if (!SEMVER_PATTERN.test(minNativeVersion)) {
    throw new OtaPackagingError(
      `minNativeVersion must be semver, got ${JSON.stringify(minNativeVersion)}`
    )
  }
  if (!/^[0-9a-f]{64}$/.test(checksum ?? "")) {
    throw new OtaPackagingError(`Checksum must be sha256 hex, got ${checksum}`)
  }

  const origin = new URL(baseUrl).origin
  return {
    schema: 1,
    version,
    url: `${origin}/ota/bundles/${version}.zip`,
    checksum,
    minNativeVersion,
    commit: commit ?? "unknown",
    releasedAt,
    mandatory: false,
  }
}

function parseArgs(argv) {
  const args = { dist: "apps/mobile/dist", baseUrl: "https://app.onerep.life" }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === "--dist") args.dist = argv[++index]
    else if (flag === "--base-url") args.baseUrl = argv[++index]
  }
  return args
}

function readVersionStamp(distDir) {
  const stampPath = path.join(distDir, "version.json")
  if (!existsSync(stampPath)) {
    throw new OtaPackagingError(
      `Missing ${stampPath}. The build must run with VITE_BUNDLE_VERSION set.`
    )
  }

  const stamp = JSON.parse(readFileSync(stampPath, "utf8"))
  // A turbo cache hit can replay a dist built under a different stamp. The
  // manifest is derived from this file rather than from the environment so
  // that a stale build is caught here instead of shipping a manifest that
  // advertises code the zip does not contain.
  if (!SEMVER_PATTERN.test(stamp.version ?? "")) {
    throw new OtaPackagingError(
      `${stampPath} has a non-semver version ${JSON.stringify(stamp.version)}. ` +
        `This usually means VITE_BUNDLE_VERSION was unset, or turbo replayed a ` +
        `cached build — check that VITE_BUNDLE_VERSION is listed in turbo.json env.`
    )
  }
  return stamp
}

/**
 * Copy-then-delete rather than rename: the staging directory lives in the
 * OS temp dir and the build tree does not, so on CI the two sit on different
 * filesystems and `renameSync` fails with EXDEV.
 */
function moveFile(from, to) {
  copyFileSync(from, to)
  rmSync(from, { force: true })
}

function stageBundle(distDir) {
  const stageRoot = mkdtempSync(path.join(tmpdir(), "onerep-ota-"))
  const stageDir = path.join(stageRoot, "bundle")
  cpSync(distDir, stageDir, { recursive: true })

  // Never let a previous run's artifacts end up inside the zip.
  rmSync(path.join(stageDir, "ota"), { recursive: true, force: true })

  if (!existsSync(path.join(stageDir, "index.html"))) {
    throw new OtaPackagingError(
      "Staged bundle has no index.html at its root; the plugin would reject it."
    )
  }
  return { stageRoot, stageDir }
}

/**
 * Zips via the official CLI, which produces the layout the plugin expects
 * (files at the zip root, index.html among them). node:22-alpine has no `zip`
 * binary anyway.
 *
 * The CLI resolves a package.json from its working directory, so it runs from
 * apps/mobile rather than the repo root.
 */
function zipBundle({ stageDir, stageRoot, repoRoot, version }) {
  const outputName = `${version}.zip`
  const cliCwd = path.join(repoRoot, "apps/mobile")

  const result = spawnSync(
    "npx",
    [
      "--yes",
      "@capgo/cli@latest",
      "bundle",
      "zip",
      APP_ID,
      "--path",
      stageDir,
      "--name",
      outputName,
      "--json",
      // The check greps a minified bundle for notifyAppReady; our call is
      // behind a lazy import and a platform guard, so it false-negatives.
      "--no-code-check",
    ],
    { cwd: cliCwd, encoding: "utf8", env: { ...process.env, CAPGO_TOKEN: "" } }
  )

  if (result.status !== 0) {
    throw new OtaPackagingError(
      `@capgo/cli bundle zip failed (exit ${result.status})\n${result.stderr || result.stdout}`
    )
  }

  const reported = JSON.parse(result.stdout.trim())
  // The CLI writes to its own working directory, under the literal --name.
  const producedPath = path.join(cliCwd, outputName)
  if (!existsSync(producedPath)) {
    throw new OtaPackagingError(
      `@capgo/cli reported success but no zip appeared at ${producedPath}`
    )
  }

  const zipPath = path.join(stageRoot, outputName)
  moveFile(producedPath, zipPath)
  return { zipPath, reportedChecksum: reported.checksum }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoRoot = path.resolve(import.meta.dirname, "../..")
  const distDir = path.resolve(repoRoot, args.dist)

  if (!existsSync(distDir)) {
    throw new OtaPackagingError(`No build output at ${distDir}`)
  }

  const stamp = readVersionStamp(distDir)
  const { stageRoot, stageDir } = stageBundle(distDir)

  try {
    const { zipPath, reportedChecksum } = zipBundle({
      stageDir,
      stageRoot,
      repoRoot,
      version: stamp.version,
    })

    // Hash the bytes that will actually be uploaded rather than trusting the
    // CLI's number, then cross-check — a mismatch means the CLI's checksum
    // semantics changed and every device would reject the download.
    const zipBytes = readFileSync(zipPath)
    const checksum = createHash("sha256").update(zipBytes).digest("hex")
    if (reportedChecksum && reportedChecksum !== checksum) {
      throw new OtaPackagingError(
        `Checksum mismatch: @capgo/cli reported ${reportedChecksum}, ` +
          `sha256 of the file is ${checksum}. Verify the CLI's checksum algorithm.`
      )
    }

    const manifest = buildManifest({
      version: stamp.version,
      commit: stamp.commit,
      checksum,
      baseUrl: args.baseUrl,
    })

    const bundlesDir = path.join(distDir, "ota", "bundles")
    mkdirSync(bundlesDir, { recursive: true })
    moveFile(zipPath, path.join(bundlesDir, `${stamp.version}.zip`))
    writeFileSync(
      path.join(distDir, "ota", "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    )

    const sizeMb = (zipBytes.byteLength / 1024 / 1024).toFixed(2)
    console.log(`OTA bundle ${stamp.version} packaged (${sizeMb} MB)`)
    console.log(JSON.stringify(manifest, null, 2))
  } finally {
    rmSync(stageRoot, { recursive: true, force: true })
  }
}

// Only run when invoked directly, so tests can import buildManifest.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  try {
    main()
  } catch (error) {
    console.error(
      error instanceof OtaPackagingError ? error.message : String(error?.stack ?? error)
    )
    process.exit(1)
  }
}
