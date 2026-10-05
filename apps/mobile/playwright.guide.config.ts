import { defineConfig } from "@playwright/test"
import base from "./playwright.config"
export default defineConfig({
  ...base,
  testMatch: ["workout-guide.spec.ts"],
  workers: 1,
  timeout: 60000,
  // Match the native app WebView and exercise the room on the Apple GPU.
  // Chromium headless uses SwiftShader here and cannot measure scene motion.
  use: { ...base.use, browserName: "webkit" },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
})
