import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["convex/__tests__/*.convex.test.ts"],
    environment: "edge-runtime",
    // Every file imports the whole `convex/**` graph through convex-test's
    // module glob. Isolating each file makes each one pay that import and
    // transform cost again, which on a shared CI box pushed the first test in
    // a file past a 20s timeout while the rest of the file ran in ms. Reusing
    // one environment per worker is safe here: convexTest() builds a fresh
    // in-memory database per call, so files share modules, not state.
    isolate: false,
    // Vitest sizes the pool from the host's core count, which on a container
    // is the machine's cores, not the ones this job actually gets. Capping it
    // keeps each worker on real CPU instead of 38 forks fighting over it.
    maxWorkers: 4,
    testTimeout: 30_000,
    server: { deps: { inline: ["convex-test"] } },
  },
});
