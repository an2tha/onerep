import { defineConfig, devices } from "@playwright/test"
import base from "./playwright.config"
export default defineConfig({
  ...base,
  projects: [{ name: "iphone-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } }],
})
