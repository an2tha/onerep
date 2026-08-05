import type { CapacitorConfig } from "@capacitor/cli"
import { config as dotenvConfig } from "dotenv"

dotenvConfig({ quiet: true })

const config: CapacitorConfig = {
  appId: "com.ananthh.onerep",
  appName: "OneRep",
  webDir: "dist",
  server: {
    hostname: "localhost",
    iosScheme: "https",
    androidScheme: "https",
  },
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
    // Over-the-air web bundle updates. src/lib/ota.ts owns the whole flow:
    // it fetches our own manifest from Cloudflare Pages, decides whether the
    // bundle is newer and whether this native shell is new enough to run it,
    // then downloads and stages it. The plugin never initiates anything.
    CapacitorUpdater: {
      autoUpdate: false,
      // Empty so no request can reach Capgo's hosted service even if a future
      // default flips autoUpdate back on.
      updateUrl: "",
      statsUrl: "",
      // notifyAppReady() only fires after React commits two frames. A cold
      // start on a slow device has to mount the tree and hydrate Convex auth
      // first; the 10s default is tight, 20s still reverts a genuinely broken
      // bundle within one relaunch.
      appReadyTimeout: 20000,
      responseTimeout: 30,
      // A store update ships new native code with new builtin web assets.
      // Dropping OTA bundles is the only state whose JS is guaranteed to match
      // the new plugin surface.
      resetWhenUpdate: true,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      // set() reloads the WebView; without this the user lands back on "/".
      keepUrlPathAfterReload: true,
      // The JS side must never be able to repoint where updates come from.
      allowModifyUrl: false,
      directUpdate: false,
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

export default config
