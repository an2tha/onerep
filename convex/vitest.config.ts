import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["convex/__tests__/*.convex.test.ts"],
    environment: "edge-runtime",
    testTimeout: 20_000,
    server: { deps: { inline: ["convex-test"] } },
  },
});
