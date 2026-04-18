import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const uiRoot = path.resolve(__dirname, "../../packages/ui/src")
const appRoot = path.resolve(__dirname, "./src")

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
export default defineConfig({
  plugins: [uiAliasPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": appRoot,
      "@repo/ui": uiRoot,
    },
  },
})
