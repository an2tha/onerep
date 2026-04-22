/**
 * Setup script - starts Docker, runs migrations, loads data
 * Run: npx tsx scripts/setup.ts
 */
import "dotenv/config";
import { execSync } from "child_process";
import { spawn } from "child_process";
import { existsSync } from "fs";

/**
 * Pause execution for the specified number of milliseconds.
 *
 * @param ms - Number of milliseconds to wait
 * @returns Resolves with no value after the specified delay
 */
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Polls the local PostgreSQL server until it becomes available or the retry limit is reached.
 *
 * @param maxRetries - Maximum number of readiness checks to perform (default: 30).
 * @returns `true` if PostgreSQL responded as ready within the given attempts, `false` otherwise.
 */
async function waitForPostgres(maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      execSync("pg_isready -h localhost -p 5433 -U onerep", { stdio: "ignore" });
      console.log("[SETUP] PostgreSQL is ready!");
      return true;
    } catch {
      console.log(`[SETUP] Waiting for PostgreSQL... (${i + 1}/${maxRetries})`);
      await sleep(2000);
    }
  }
  return false;
}

/**
 * Orchestrates the local data-api bootstrap: starts services, migrates the database, and launches the data loader.
 *
 * Performs four steps: starts Docker Compose for PostgreSQL, waits for PostgreSQL to become ready (exiting the process with code 1 if it never becomes ready), runs schema generation and migrations, and spawns the loader process while streaming its output; logs success or the loader's exit code when the loader finishes.
 */
async function main() {
  console.log("[SETUP] Starting OneRep data-api setup...\n");

  // 1. Start Docker container
  console.log("[SETUP] Step 1/4: Starting PostgreSQL container...");
  try {
    execSync("docker compose up -d", { stdio: "inherit", cwd: __dirname + "/.." });
  } catch {
    console.log("[SETUP] Docker compose note - may already be running");
  }

  // 2. Wait for PostgreSQL
  console.log("\n[SETUP] Step 2/4: Waiting for PostgreSQL...");
  const pgReady = await waitForPostgres();
  if (!pgReady) {
    console.error("[SETUP] PostgreSQL failed to start!");
    process.exit(1);
  }

  // 3. Run migrations
  console.log("\n[SETUP] Step 3/4: Running migrations...");
  try {
    execSync("npx drizzle-kit generate", { stdio: "inherit", cwd: __dirname + "/.." });
    execSync("npx drizzle-kit migrate", { stdio: "inherit", cwd: __dirname + "/.." });
    console.log("[SETUP] Migrations complete!");
  } catch (err) {
    const errMsg = String(err);
    // Only treat idempotent errors as benign
    if (errMsg.includes("already exists") || errMsg.includes("duplicate") || errMsg.includes("relation") && errMsg.includes("exists")) {
      console.log("[SETUP] Migration note - tables may already exist");
    } else {
      console.error("[SETUP] Migration failed:", err);
      process.exit(1);
    }
  }

  // 4. Load data
  console.log("\n[SETUP] Step 4/4: Loading data...");
  console.log("[SETUP] Running loader (this may take a while for 4.4M foods)...\n");
  
  const loader = spawn("bun", ["run", "loader"], {
    cwd: __dirname + "/..",
    stdio: "inherit",
  });
  
  loader.on("close", (code) => {
    if (code === 0) {
      console.log("\n✅ [SETUP] Complete!");
    } else {
      console.log("\n⚠️ [SETUP] Loader exited with code", code);
    }
  });
}

main().catch(err => {
  console.error("[SETUP] Fatal error:", err);
  process.exit(1);
});