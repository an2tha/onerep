// Include the installable package in the same Pages deployment as the console.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const cwd = fileURLToPath(new URL("../packages/sdk/", import.meta.url));
const destination = fileURLToPath(
  new URL("../apps/mobile/public/sdk/", import.meta.url),
);
mkdirSync(destination, { recursive: true });
execFileSync("bun", ["scripts/generate-sdk.ts", "--check"], {
  cwd: root,
  stdio: "inherit",
});
execFileSync("bun", ["run", "build"], { cwd, stdio: "inherit" });
execFileSync(
  "bun",
  ["pm", "pack", "--ignore-scripts", "--destination", destination],
  { cwd, stdio: "inherit" },
);
