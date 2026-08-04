import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"

const uiRoot = path.resolve(__dirname, "../../packages/ui/src")
const appRoot = path.resolve(__dirname, "./src")
const envRoot = path.resolve(__dirname, "../../")
const mobileNodeModules = path.resolve(__dirname, "node_modules")

function isPlaceholderServiceUrl(value: string | undefined) {
  if (!value) return true
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return (
      hostname === "example.convex.cloud" ||
      hostname === "example.convex.site" ||
      hostname.endsWith(".invalid")
    )
  } catch {
    return true
  }
}

/**
 * Emits dist/version.json describing the build.
 *
 * The OTA packaging script reads this rather than being told a version
 * separately, so the version advertised in the manifest cannot drift from the
 * one compiled into the JS — the failure mode being a manifest promising a
 * bundle whose contents are a build older than it claims, after which devices
 * consider themselves up to date forever.
 */
function versionStampPlugin(version: string, commit: string): Plugin {
  return {
    name: "onerep-version-stamp",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          { version, commit, builtAt: new Date().toISOString() },
          null,
          2
        ),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  for (const key of ["VITE_CONVEX_URL", "VITE_CONVEX_SITE_URL"] as const) {
    if (process.env[key] !== undefined && !process.env[key]?.trim()) {
      delete process.env[key]
    }
  }
  const processEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0
    )
  )
  // Docker declares optional build arguments as empty environment variables.
  // Do not let those erase valid values loaded from .env.production.
  const env = { ...loadEnv(mode, envRoot, ""), ...processEnv }
  for (const key of ["VITE_CONVEX_URL", "VITE_CONVEX_SITE_URL"] as const) {
    if (!process.env[key]?.trim() && env[key]?.trim()) {
      process.env[key] = env[key].trim()
    }
  }
  if (command === "build") {
    if (isPlaceholderServiceUrl(env.VITE_CONVEX_URL)) {
      throw new Error(
        "Production mobile builds require a real VITE_CONVEX_URL."
      )
    }
    const effectiveConvexSiteUrl =
      env.VITE_CONVEX_SITE_URL?.trim() ||
      env.VITE_CONVEX_URL?.replace(/\.convex\.cloud\/?$/, ".convex.site")
    if (isPlaceholderServiceUrl(effectiveConvexSiteUrl)) {
      throw new Error(
        "Mobile builds require VITE_CONVEX_SITE_URL or a derivable Convex deployment URL for Better Auth."
      )
    }
    if (mode === "production" && env.CONVEX_DEPLOYMENT?.startsWith("dev:")) {
      throw new Error(
        "Production mobile builds require a production Convex deployment. CONVEX_DEPLOYMENT must not start with dev:."
      )
    }
  }

  return {
    envDir: envRoot,
    plugins: [
      react(),
      tailwindcss(),
      versionStampPlugin(
        env.VITE_BUNDLE_VERSION?.trim() || "0.0.0",
        env.VITE_BUNDLE_COMMIT?.trim() || "unknown"
      ),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined
            if (
              /node_modules\/(?:@remix-run|react|react-dom|react-router|scheduler)\//.test(
                id
              )
            ) {
              return "react-vendor"
            }
            if (
              id.includes("@convex-dev/better-auth") ||
              id.includes("better-auth") ||
              id.includes("convex")
            ) {
              return "auth-data"
            }
            // Left unassigned so Rollup splits it off on its own. src/lib/ota
            // imports it dynamically behind a native-platform guard, so on the
            // web build this chunk is never requested.
            if (id.includes("@capgo/capacitor-updater")) return undefined
            if (id.includes("@capacitor") || id.includes("@ionic")) {
              return "native"
            }
            if (id.includes("@zxing")) return "scanner"
            // Kept out of "vendor" so the lazily-loaded pose viewer is the only
            // thing that pulls three.js down.
            if (/node_modules\/three\//.test(id)) return "three"
            if (id.includes("@phosphor-icons")) return "icons"
            if (id.includes("posthog")) return "analytics"
            return "vendor"
          },
        },
      },
    },
    resolve: {
      dedupe: ["convex", "react", "react-dom"],
      alias: {
        "@": appRoot,
        "@repo/ui/styles.css": path.resolve(uiRoot, "index.css"),
        "@repo/ui": uiRoot,
        convex: path.resolve(mobileNodeModules, "convex"),
      },
    },
  }
})
