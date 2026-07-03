import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"

const uiRoot = path.resolve(__dirname, "../../packages/ui/src")
const appRoot = path.resolve(__dirname, "./src")
const envRoot = path.resolve(__dirname, "../../")
const mobileNodeModules = path.resolve(__dirname, "node_modules")

// Redirect `@/...` imports that originate from inside packages/ui/src
// to that package's own src root, not the app's src root.
function uiAliasPlugin(): Plugin {
  return {
    name: "ui-alias",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.startsWith("@/")) return null
      if (!importer?.includes("/packages/ui/src/")) return null
      return this.resolve(path.resolve(uiRoot, source.slice(2)), importer, {
        skipSelf: true,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, envRoot, ""), ...process.env }
  if (command === "build" && mode === "production") {
    if (!env.VITE_CONVEX_SITE_URL) {
      throw new Error(
        "Production mobile builds require VITE_CONVEX_SITE_URL for Better Auth."
      )
    }
    if (env.CONVEX_DEPLOYMENT?.startsWith("dev:")) {
      throw new Error(
        "Production mobile builds require a production Convex deployment. CONVEX_DEPLOYMENT must not start with dev:."
      )
    }
  }

  return {
    envDir: envRoot,
    plugins: [uiAliasPlugin(), react(), tailwindcss()],
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
            if (id.includes("@convex-dev/better-auth") || id.includes("better-auth") || id.includes("convex")) {
              return "auth-data"
            }
            if (id.includes("@capacitor") || id.includes("@ionic")) {
              return "native"
            }
            if (id.includes("@zxing")) return "scanner"
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
        "@repo/ui": uiRoot,
        convex: path.resolve(mobileNodeModules, "convex"),
      },
    },
  }
})
