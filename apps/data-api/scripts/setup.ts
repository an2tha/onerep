/**
 * Setup script - starts Docker, runs migrations, loads data
 * Run: npx tsx scripts/setup.ts
 */
import "dotenv/config";
import { execSync } from "child_process";
import { spawn } from "child_process";
import { existsSync } from "fs";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  } catch {
    console.log("[SETUP] Migration note - tables may already exist");
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
