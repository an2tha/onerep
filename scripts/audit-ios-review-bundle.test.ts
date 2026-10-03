import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
const fixtures: string[] = []
afterEach(() => {
  for (const dir of fixtures.splice(0))
    rmSync(dir, { recursive: true, force: true })
})
function fixture(platform = "ios", source = "console.log('bundled')") {
  const dir = mkdtempSync(join(tmpdir(), "onerep-ios-review-"))
  fixtures.push(dir)
  mkdirSync(join(dir, "runtime"))
  writeFileSync(
    join(dir, "version.json"),
    JSON.stringify({ nativePlatform: platform })
  )
  writeFileSync(
    join(dir, "index.html"),
    `<script type="module" src="/app.js"></script>`
  )
  writeFileSync(join(dir, "app.js"), source)
  for (const asset of [
    "ort-wasm-simd-threaded.mjs",
    "ort-wasm-simd-threaded.wasm",
  ])
    writeFileSync(join(dir, "runtime", asset), "bundled-runtime")
  return dir
}
function audit(dir: string) {
  return spawnSync(
    "node",
    [join(import.meta.dir, "audit-ios-review-bundle.mjs"), dir],
    { encoding: "utf8" }
  )
}
test("accepts bundled code and runtime", () => {
  expect(audit(fixture()).status).toBe(0)
})
test("rejects generic bundles and executable updater code", () => {
  expect(audit(fixture("web")).status).not.toBe(0)
  expect(
    audit(fixture("ios", "CapacitorUpdater.download({url:remote})")).status
  ).not.toBe(0)
})
test("rejects remote scripts even in a stamped iOS build", () => {
  const dir = fixture()
  writeFileSync(
    join(dir, "index.html"),
    '<script src="https://example.com/code.js"></script>'
  )
  expect(audit(dir).status).not.toBe(0)
})
