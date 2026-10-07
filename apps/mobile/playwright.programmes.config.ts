import { defineConfig } from "@playwright/test"
import base from "./playwright.guide.config"
export default defineConfig({ ...base, testMatch: ["programmes.spec.ts", "programme-setup.spec.ts", "exercise-swap.spec.ts"] })
