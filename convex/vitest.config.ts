import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["convex/__tests__/*.convex.test.ts"],
    environment: "edge-runtime",
    // Pro is comped for everyone when this variable is unset — the right
    // default for a deployment, and the wrong one for these tests, which
    // exist to prove the gating works when someone actually turns it on.
    env: { BILLING_COMP_ALL_USERS: "false" },
    // convexTest isolates database state, but not the imported function graph.
    // Provider mocks also need isolation: an action loaded by an earlier file
    // can otherwise retain its real provider despite a later vi.mock().
    isolate: true,
    // Vitest sizes the pool from the host's core count, which on a container
    // is the machine's cores, not the ones this job actually gets. Capping it
    // keeps each worker on real CPU instead of 38 forks fighting over it.
    maxWorkers: 4,
    testTimeout: 30_000,
    server: { deps: { inline: ["convex-test"] } },
  },
});
