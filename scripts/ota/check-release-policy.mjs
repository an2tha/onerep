#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const RELEASE_KINDS = new Set(["content", "bugfix", "security"])
const STORE_ONLY_PREFIXES = [
  "apps/mobile/ios/",
  "apps/mobile/android/",
  "apps/mobile/capacitor.config.ts",
  "apps/mobile/package.json",
  "bun.lock",
  "apps/mobile/src/lib/ota.ts",
  "apps/mobile/src/lib/ota-config.ts",
  "apps/mobile/src/lib/ota-manifest.ts",
  "apps/mobile/src/components/billing/",
]
const STORE_ONLY_PATTERNS = [
  /(?:^|\/)native-(?:health|tab|plugin|bridge)/,
  /(?:^|\/)health-provider(?:\.|\/)/,
  /(?:^|\/)(?:billing|purchases?|subscriptions?)(?:\.|\/)/,
]
const CONTENT_ONLY_PATTERNS = [
  /(?:^|\/)(?:public|assets|locales|translations)\//,
  /\.(?:css|md|png|jpe?g|webp|svg|gif|woff2?|json)$/,
]

export class OtaPolicyError extends Error {}

function git(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" })
  if (result.status !== 0) {
    throw new OtaPolicyError(
      result.stderr.trim() || `git ${args.join(" ")} failed`
    )
  }
  return result.stdout.trim()
}

export function validateOtaSourcePolicy({
  repoRoot,
  baseCommit,
  headCommit,
  releaseKind,
}) {
  if (!RELEASE_KINDS.has(releaseKind)) {
    throw new OtaPolicyError(`Invalid OTA release kind: ${releaseKind}`)
  }
  if (!baseCommit || !headCommit) {
    throw new OtaPolicyError("Both base and head commits are required")
  }
  git(repoRoot, ["rev-parse", "--verify", `${baseCommit}^{commit}`])
  git(repoRoot, ["rev-parse", "--verify", `${headCommit}^{commit}`])

  const range = `${baseCommit}..${headCommit}`
  const changed = git(repoRoot, ["diff", "--name-only", range])
    .split("\n")
    .filter(Boolean)
  if (changed.length === 0) {
    throw new OtaPolicyError("OTA release source range contains no changes")
  }

  const storeOnly = changed.filter(
    (file) =>
      STORE_ONLY_PREFIXES.some(
        (prefix) => file === prefix || file.startsWith(prefix)
      ) || STORE_ONLY_PATTERNS.some((pattern) => pattern.test(file))
  )
  if (storeOnly.length > 0) {
    throw new OtaPolicyError(
      `Store-only files changed:\n${storeOnly.map((file) => `- ${file}`).join("\n")}`
    )
  }

  const addedPages = git(repoRoot, [
    "diff",
    "--name-only",
    "--diff-filter=A",
    range,
    "--",
    "apps/mobile/src/pages",
  ])
    .split("\n")
    .filter(Boolean)
  if (addedPages.length > 0) {
    throw new OtaPolicyError(
      `New app screens require store review:\n${addedPages
        .map((file) => `- ${file}`)
        .join("\n")}`
    )
  }

  const routeAdditions = git(repoRoot, [
    "diff",
    "--unified=0",
    range,
    "--",
    "apps/mobile/src/main.tsx",
  ])
    .split("\n")
    .filter((line) => /^\+[^+]/.test(line))
    .filter((line) =>
      /\bpath\s*:\s*["']|createBrowserRouter|lazy\s*:/.test(line)
    )
  if (routeAdditions.length > 0) {
    throw new OtaPolicyError(
      "New or materially rewired routes require store review"
    )
  }

  if (releaseKind === "content") {
    const codeChanges = changed.filter(
      (file) => !CONTENT_ONLY_PATTERNS.some((pattern) => pattern.test(file))
    )
    if (codeChanges.length > 0) {
      throw new OtaPolicyError(
        `Content releases cannot contain code changes:\n${codeChanges
          .map((file) => `- ${file}`)
          .join("\n")}`
      )
    }
  }

  return { range, releaseKind, changed }
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--base") args.baseCommit = argv[++index]
    else if (argv[index] === "--head") args.headCommit = argv[++index]
    else if (argv[index] === "--kind") args.releaseKind = argv[++index]
  }
  return args
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = validateOtaSourcePolicy({
      repoRoot: path.resolve(import.meta.dirname, "../.."),
      ...parseArgs(process.argv.slice(2)),
    })
    console.log(
      `OTA policy approved ${result.changed.length} files in ${result.range} as ${result.releaseKind}`
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
