import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

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
    plugins: [react(), tailwindcss()],
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
