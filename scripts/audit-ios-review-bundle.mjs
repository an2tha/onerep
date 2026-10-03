// Release gate: audit the actual assets before Capacitor packages them.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[2] || "apps/mobile/dist";
const stamp = JSON.parse(readFileSync(join(root, "version.json"), "utf8"));
if (stamp.nativePlatform !== "ios")
  throw new Error("Build with VITE_NATIVE_PLATFORM=ios before syncing iOS.");
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
for (const file of walk(root).filter((file) => /\.(js|mjs|html)$/.test(file))) {
  const source = readFileSync(file, "utf8");
  if (
    /CapacitorUpdater|OtaTrust|onerep:ota:(?:last-check|pending-bundle|rollout-bucket)|cdn\.jsdelivr\.net\/npm\/onnxruntime|needle: could not load/.test(
      source,
    )
  ) {
    throw new Error(
      `Remote executable update/loading capability remains in ${file}`,
    );
  }
  if (
    file.endsWith("index.html") &&
    /<script[^>]+src=["']https?:/.test(source)
  ) {
    throw new Error("The native HTML contains a remote script.");
  }
}
for (const asset of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
]) {
  if (!readFileSync(join(root, "runtime", asset)).length)
    throw new Error(`Missing bundled runtime ${asset}`);
}
console.log(
  "iOS review bundle verified: no OTA updater or remote runtime loader; inference runtime bundled.",
);
