import { defineConfig } from "@playwright/test"

const storageState = process.env.E2E_STORAGE_STATE

const viewports = [
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-430", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
] as const

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./test-results/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    storageState: storageState || undefined,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: viewports.flatMap((viewport) =>
    (["light", "dark"] as const).map((theme) => ({
      name: `${viewport.name}-${theme}`,
      use: {
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
      },
    }))
  ),
  webServer: {
    command: "bun run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/login",
    reuseExistingServer: !process.env.CI,
  },
})
