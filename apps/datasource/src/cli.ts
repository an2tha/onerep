import { rollback, type SourceName } from "./db.ts";
import { importUsda } from "./usda.ts";
import { importWger } from "./wger.ts";

/**
 * Imports run from the shell over SSH rather than through HTTP. The service is
 * reachable from the internet through a Cloudflare tunnel, and no remote caller
 * has any reason to trigger or roll back a rebuild.
 */
const USAGE = `Usage:
  bun src/cli.ts import usda --csv-dir <dir>
  bun src/cli.ts import wger
  bun src/cli.ts rollback <usda|wger>

Environment:
  DATA_DIR  where the SQLite databases live (default ./data)
`;

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

const [command, target, ...rest] = Bun.argv.slice(2);
const dataDir = process.env.DATA_DIR?.trim() || "./data";

try {
  if (command === "import" && target === "usda") {
    const csvDir = flag(rest, "csv-dir");
    if (!csvDir) throw new Error("import usda requires --csv-dir");
    const started = Date.now();
    const { foods } = await importUsda({ csvDir, dataDir, onProgress: log });
    log(`done: ${foods} foods in ${Math.round((Date.now() - started) / 1000)}s`);
  } else if (command === "import" && target === "wger") {
    const started = Date.now();
    const { exercises, images } = await importWger({ dataDir, onProgress: log });
    log(
      `done: ${exercises} exercises, ${images} images in ` +
        `${Math.round((Date.now() - started) / 1000)}s`,
    );
  } else if (command === "rollback" && (target === "usda" || target === "wger")) {
    rollback(dataDir, target as SourceName);
    log(`rolled back ${target}`);
  } else {
    console.error(USAGE);
    process.exit(1);
  }
} catch (error) {
  console.error(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
