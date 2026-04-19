import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["convex/__tests__/*.convex.test.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
