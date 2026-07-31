import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { extname, join, relative } from "node:path"

const sourceRoot = join(import.meta.dir)
const forbiddenImports = [
  /from ["']convex(?:\/|["'])/,
  /from ["']react-router(?:\/|["'])/,
  /from ["']@capacitor\//,
  /from ["']@\/lib\//,
  /from ["'][^"']*apps\/mobile/,
  /from ["'][^"']*convex\/_generated/,
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return [".ts", ".tsx"].includes(extname(path)) && !path.endsWith(".test.ts")
      ? [path]
      : []
  })
}

describe("@repo/ui package boundary", () => {
  test("does not import application, backend, router, or native modules", () => {
    const violations = sourceFiles(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8")
      return forbiddenImports
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(sourceRoot, path)}: ${pattern}`)
    })

    expect(violations).toEqual([])
  })

  test("mobile consumes the public UI boundary instead of primitive libraries", () => {
    const mobileRoot = join(sourceRoot, "../../../apps/mobile")
    const mobileSource = sourceFiles(join(mobileRoot, "src"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")

    expect(existsSync(join(mobileRoot, "components.json"))).toBe(false)
    for (const dependency of [
      "sonner",
      "radix-ui",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
    ]) {
      expect(mobileSource).not.toMatch(
        new RegExp(`from ["']${dependency.replace("-", "\\-")}["']`)
      )
    }
  })

  test("mobile component modules are controllers and platform adapters only", () => {
    const mobileComponents = join(
      sourceRoot,
      "../../../apps/mobile/src/components"
    )
    const allowedModules = new Set([
      "auth-guard.tsx",
      "auth-shell.tsx",
      "bottom-bar.tsx",
      "error-boundary.tsx",
      "food-detail-sheet.tsx",
      "meal-category-sync.tsx",
      "mobile-sheet.tsx",
      "offline-sync-indicator.tsx",
      "tooltips.tsx",
      // Walkthrough: Convex persistence, router, and haptics bound to the
      // presentational spotlight primitives in @repo/ui.
      "walkthrough/tour-anchor.tsx",
      "walkthrough/tour-context.tsx",
      "walkthrough/tour-provider.tsx",
      "walkthrough/welcome-sheet.tsx",
      // Renders null; syncs Convex data into the iOS widget extension.
      "widget-data-sync.tsx",
    ])
    const unexpected = sourceFiles(mobileComponents)
      .map((path) => relative(mobileComponents, path))
      .filter((path) => !path.endsWith(".test.tsx"))
      .filter((path) => !allowedModules.has(path))

    expect(unexpected).toEqual([])
  })
})
