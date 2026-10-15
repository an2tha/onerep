import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { CapacitorConfig } from "@capacitor/cli"
import { config as dotenvConfig } from "dotenv"

dotenvConfig({ quiet: true })

const config: CapacitorConfig = {
  appId: "com.ananthh.onerep",
  appName: "OneRep",
  // Identify the native app when requesting OpenStreetMap tiles.
  appendUserAgent: "OneRep (+https://onerep.life)",
  webDir: "dist",
  server: {
    hostname: "localhost",
    // WKWebView reserves HTTP(S); Capacitor serves bundled iOS assets here.
    iosScheme: "capacitor",
    androidScheme: "https",
  },
  // Store releases on both platforms ship only their bundled executable assets.
  includePlugins: [
    "@capacitor/app",
    "@capacitor/browser",
    "@capacitor/camera",
    "@capacitor/filesystem",
    "@capacitor/haptics",
    "@capacitor/local-notifications",
    "@capacitor/preferences",
    "@capacitor/push-notifications",
    "@capacitor/share",
    "@capgo/capacitor-speech-recognition",
  ],
  ios: {
    buildOptions: {
      exportMethod: "debugging",
    },
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
    // Android-only. Without an explicit smallIcon the plugin falls back to the
    // launcher icon, which the status bar renders as an alpha mask — i.e. a
    // featureless white square. ic_stat_onerep is a monochrome silhouette.
    LocalNotifications: {
      smallIcon: "ic_stat_onerep",
      iconColor: "#09090B",
    },
  },
}

/*
For hot refresh:
const config: CapacitorConfig = {
  appId: "com.ananthh.onerep",
  appName: "OneRep",
  webDir: "dist",
  server:
    process.env.IS_DEV === "true"
      ? {
          url: process.env.CAPACITOR_DEV_SERVER_URL ?? "http://localhost:5173",
          cleartext: true,
        }
      : undefined,
}
*/

if (
  process.env.VITE_NATIVE_PLATFORM === "ios" ||
  process.argv.includes("ios")
) {
  if (process.argv.some((arg) => arg === "sync" || arg === "copy")) {
    const stamp = JSON.parse(
      readFileSync(join(__dirname, "dist/version.json"), "utf8")
    )
    if (stamp.nativePlatform !== "ios")
      throw new Error("Build with VITE_NATIVE_PLATFORM=ios before syncing iOS.")
  }
}

export default config
