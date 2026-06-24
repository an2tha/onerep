import type { CapacitorConfig } from "@capacitor/cli"
import { config as dotenvConfig } from "dotenv"

dotenvConfig({ quiet: true })

const config: CapacitorConfig = {
  appId: "com.ananthh.onerep",
  appName: "OneRep",
  webDir: "dist",
  ios: {
    buildOptions: {
      exportMethod: "debugging",
    },
  },
  server: undefined,
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
