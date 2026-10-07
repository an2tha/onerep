import { defineConfig } from "@playwright/test"
import base from "./playwright.guide.config"
export default defineConfig({ ...base, testMatch: ["programme-setup.spec.ts"] })
