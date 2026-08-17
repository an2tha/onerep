import { rollback } from "./core/store.ts";
import { createRegistry } from "./registry.ts";

/**
 * Imports run from the shell over SSH rather than through HTTP. The service is
 * reachable from the internet through a Cloudflare tunnel, and no remote caller
 * has any reason to trigger or roll back a rebuild.
 */

const dataDir = process.env.DATA_DIR?.trim() || "./data";
const cacheDir = process.env.CACHE_DIR?.trim() || "./data/cache";
const registry = createRegistry(dataDir);

function usage(): string {
  const imports = registry.providers.map((provider) => {
    const flags = provider.buildFlags
      .map((flag) => (flag.required ? `--${flag.name} <value>` : `[--${flag.name} <value>]`))
      .join(" ");
    return `  bun src/cli.ts import ${provider.id}${flags ? ` ${flags}` : ""}`;
  });
  const ids = registry.providers.map((provider) => provider.id).join("|");

  return [
    "Usage:",
    ...imports,
    `  bun src/cli.ts rollback <${ids}>`,
    "  bun src/cli.ts stats",
    "",
    "Environment:",
    "  DATA_DIR   where the SQLite databases live (default ./data)",
    "  CACHE_DIR  scratch space for downloads (default ./data/cache)",
    "",
  ].join("\n");
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function fail(message: string): never {
  console.error(`failed: ${message}`);
  process.exit(1);
}

const [command, target, ...rest] = Bun.argv.slice(2);

try {
  if (command === "import") {
    const provider = target ? registry.get(target) : undefined;
    if (!provider) fail(`unknown provider: ${target ?? "(none)"}\n\n${usage()}`);

    for (const required of provider.buildFlags.filter((entry) => entry.required)) {
      if (!flag(rest, required.name)) {
        fail(`import ${provider.id} requires --${required.name} (${required.description})`);
      }
    }

    const started = Date.now();
    const summary = await provider.build({
      dataDir,
      cacheDir,
      log,
      flag: (name) => flag(rest, name),
    });
    const counts = Object.entries(summary.counts)
      .map(([key, value]) => `${value} ${key}`)
      .join(", ");
    log(`done: ${counts} in ${Math.round((Date.now() - started) / 1000)}s`);
  } else if (command === "rollback") {
    if (!target || !registry.get(target)) fail(`unknown provider: ${target ?? "(none)"}`);
    rollback(dataDir, target);
    log(`rolled back ${target}`);
  } else if (command === "stats") {
    console.log(JSON.stringify(registry.stats(), null, 2));
  } else {
    console.error(usage());
    process.exit(1);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
