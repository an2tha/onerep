import { afterEach, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  OtaPolicyError,
  validateOtaSourcePolicy,
} from "../check-release-policy.mjs"

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function git(dir: string, args: string[]) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim()
}

function initRepo(files: Record<string, string>): {
  dir: string
  base: string
} {
  const dir = mkdtempSync(path.join(tmpdir(), "onerep-policy-"))
  dirs.push(dir)
  git(dir, ["init", "-q"])
  git(dir, ["config", "user.email", "test@example.com"])
  git(dir, ["config", "user.name", "Test"])
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  git(dir, ["add", "-A"])
  git(dir, ["commit", "-qm", "base"])
  return { dir, base: git(dir, ["rev-parse", "HEAD"]) }
}

function commitChange(dir: string, name: string, content: string): string {
  const full = path.join(dir, name)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  git(dir, ["add", "-A"])
  git(dir, ["commit", "-qm", `change ${name}`])
  return git(dir, ["rev-parse", "HEAD"])
}

describe("validateOtaSourcePolicy", () => {
  test("rejects an unknown release kind", () => {
    const { dir, base } = initRepo({ "apps/mobile/src/a.ts": "a" })
    const head = commitChange(dir, "apps/mobile/src/a.ts", "b")
    expect(() =>
      validateOtaSourcePolicy({
        repoRoot: dir,
        baseCommit: base,
        headCommit: head,
        releaseKind: "feature",
      })
    ).toThrow(OtaPolicyError)
  })

  test("rejects an empty source range", () => {
    const { dir, base } = initRepo({ "apps/mobile/src/a.ts": "a" })
    expect(() =>
      validateOtaSourcePolicy({
        repoRoot: dir,
        baseCommit: base,
        headCommit: base,
        releaseKind: "bugfix",
      })
    ).toThrow(/no changes/)
  })

  test("rejects native shell changes", () => {
    const { dir, base } = initRepo({ "apps/mobile/src/a.ts": "a" })
    const head = commitChange(
      dir,
      "apps/mobile/ios/App/App/OtaTrustPlugin.swift",
      "changed"
    )
    expect(() =>
      validateOtaSourcePolicy({
        repoRoot: dir,
        baseCommit: base,
        headCommit: head,
        releaseKind: "bugfix",
      })
    ).toThrow(/Store-only/)
  })

  test("rejects OTA infrastructure changes", () => {
    const { dir, base } = initRepo({ "apps/mobile/src/a.ts": "a" })
    const head = commitChange(dir, "apps/mobile/src/lib/ota.ts", "changed")
    expect(() =>
      validateOtaSourcePolicy({
        repoRoot: dir,
        baseCommit: base,
        headCommit: head,
        releaseKind: "bugfix",
      })
    ).toThrow(/Store-only/)
  })

  test("rejects billing changes", () => {
    const { dir, base } = initRepo({ "apps/mobile/src/a.ts": "a" })
    const head = commitChange(
      dir,
      "apps/mobile/src/components/billing/paywall.tsx",
      "changed"
    )
    expect(() =>
      validateOtaSourcePolicy({
        repoRoot: dir,
        baseCommit: base,
        headCommit: head,
        releaseKind: "security",
      })
    ).toThrow(/Store-only/)
  })

  test("rejects new pages", () => {
    const { dir, base } = initRepo({ "apps/mobile/src/a.ts": "a" })
    const head = commitChange(
      dir,
      "apps/mobile/src/pages/NewScreen.tsx",
      "export default 1"
    )
    expect(() =>
      validateOtaSourcePolicy({
        repoRoot: dir,
        baseCommit: base,
        headCommit: head,
        releaseKind: "bugfix",
      })
    ).toThrow(/New app screens/)
  })

  test("rejects new routes in main.tsx", () => {
    const { dir, base } = initRepo({
      "apps/mobile/src/main.tsx": "routes = []",
    })
    const head = commitChange(
      dir,
      "apps/mobile/src/main.tsx",
      'routes = []\nconst r = { path: "/new" }'
    )
    expect(() =>
      validateOtaSourcePolicy({
        repoRoot: dir,
        baseCommit: base,
        headCommit: head,
        releaseKind: "bugfix",
      })
    ).toThrow(/routes require store review/)
  })

  test("content releases cannot contain code changes", () => {
    const { dir, base } = initRepo({ "apps/mobile/src/a.ts": "a" })
    const head = commitChange(dir, "apps/mobile/src/a.ts", "b")
    expect(() =>
      validateOtaSourcePolicy({
        repoRoot: dir,
        baseCommit: base,
        headCommit: head,
        releaseKind: "content",
      })
    ).toThrow(/Content releases/)
  })

  test("content releases allow asset-only changes", () => {
    const { dir, base } = initRepo({ "apps/mobile/public/logo.png": "a" })
    const head = commitChange(dir, "apps/mobile/public/logo.png", "b")
    const result = validateOtaSourcePolicy({
      repoRoot: dir,
      baseCommit: base,
      headCommit: head,
      releaseKind: "content",
    })
    expect(result.releaseKind).toBe("content")
    expect(result.changed).toContain("apps/mobile/public/logo.png")
  })

  test("bugfix releases allow code repairs outside store-only paths", () => {
    const { dir, base } = initRepo({ "apps/mobile/src/a.ts": "a" })
    const head = commitChange(dir, "apps/mobile/src/a.ts", "b")
    const result = validateOtaSourcePolicy({
      repoRoot: dir,
      baseCommit: base,
      headCommit: head,
      releaseKind: "bugfix",
    })
    expect(result.releaseKind).toBe("bugfix")
  })
})
