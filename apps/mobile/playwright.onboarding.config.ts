import { defineConfig } from "@playwright/test"
import base from "./playwright.guide.config"
export default defineConfig({
  ...base,
  testMatch: ["onboarding-studio.spec.ts"],
  timeout: 90000,
})
