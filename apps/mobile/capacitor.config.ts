import type { CapacitorConfig } from "@capacitor/cli"
import { config as dotenvConfig } from "dotenv"

dotenvConfig()

const config: CapacitorConfig = {
  appId: "com.ananthh.onerep",
  appName: "mobile",
  webDir: "dist",
  server: undefined,
}


/*
For hot refresh: 
const config: CapacitorConfig = {
  appId: "com.ananthh.onerep",
  appName: "mobile",
  webDir: "dist",
  server:
    process.env.IS_DEV === "true"
      ? {
          url: "http://192.168.50.216:5173",
          cleartext: true,
        }
      : undefined,
}
*/

export default config
