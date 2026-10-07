import { defineConfig } from "@playwright/test"
import base from "./playwright.guide.config"
export default defineConfig({ ...base, testMatch: ["exercise-swap.spec.ts"] })
