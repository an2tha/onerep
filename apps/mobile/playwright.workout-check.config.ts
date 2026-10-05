import { defineConfig, devices } from "@playwright/test"
import base from "./playwright.config"

export default defineConfig({
  ...base,
  testMatch: [
    "active-workout.spec.ts",
    "workout-search.spec.ts",
    "workout-page.spec.ts",
  ],
  workers: 2,
  projects: [
    {
      name: "phone-320-webkit",
      use: {
        ...devices["iPhone SE"],
        browserName: "webkit",
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "iphone-dark-webkit",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        colorScheme: "dark",
      },
    },
    { name: "phone-430", use: { viewport: { width: 430, height: 932 } } },
    { name: "phone-landscape", use: { viewport: { width: 844, height: 390 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
})
