import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores([
    "dist",
    "android/app/build",
    "android/.gradle",
    "ios/DerivedData",
    "convex/_generated",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-constant-binary-expression": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "sonner",
              message: "Import toast and Toaster from @repo/ui.",
            },
            {
              name: "radix-ui",
              message: "Use the primitive exported by @repo/ui.",
            },
            {
              name: "class-variance-authority",
              message: "Variants belong in @repo/ui.",
            },
            {
              name: "clsx",
              message: "Import cn from @repo/ui.",
            },
            {
              name: "tailwind-merge",
              message: "Import cn from @repo/ui.",
            },
          ],
          patterns: [
            {
              group: [
                "../../packages/ui/src/**",
                "../../../packages/ui/src/**",
              ],
              message: "Use the public @repo/ui API.",
            },
          ],
        },
      ],
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-refresh/only-export-components": "off",
    },
  },
])
