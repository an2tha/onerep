/**
 * Pulls the Needle 2 engine and weights out of Hugging Face.
 *
 *   bun run needle:fetch             the wasm runtime and the .cact weights
 *   bun run needle:fetch --native    only the static archives, for iOS/Android
 *   bun run needle:fetch --all       both, which is what a dev machine wants
 *   bun run needle:fetch --force     re-download whatever was selected
 *
 * `--native` selects *instead of*, not *in addition to*, and that is load-bearing.
 * `cap sync` copies everything in apps/mobile/public into the app bundle — the
 * pose models are 28 MB in there already — and the native archives embed
 * needle2.cact as `needle_weights`, so a native build that also fetched the web
 * assets would carry a second, unread copy of the model in every IPA and APK.
 * The native jobs fetch only what they link against, and the web assets are
 * simply never on disk for cap sync to find.
 *
 * Same shape and the same reasoning as scripts/pose-models/fetch.ts: these are
 * build artifacts, ninety megabytes of them, and git is a bad place to keep a
 * binary that gets replaced wholesale on every engine release.
 *
 * Every download is checked against the committed sha256, which is not paranoia
 * about Hugging Face. It is that a truncated body or an HTML error page arrives
 * with a 200 and only fails later — inside the wasm instantiation, as an
 * unhelpful `CompileError`, or inside the linker, as a hundred undefined
 * symbols that look like the wrong architecture.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dir, "../..");
const manifest = await Bun.file(
  path.join(import.meta.dir, "manifest.json"),
).json();
const force = process.argv.includes("--force");
const all = process.argv.includes("--all");
const nativeOnly = process.argv.includes("--native");

type Entry = { remote: string; name: string; bytes: number; sha256: string };
type Group = {
  label: string;
  target: string;
  files: Entry[];
};

const wanted = all ? null : nativeOnly ? "native" : "runtime";
const groups: Group[] = manifest.groups.filter(
  (group: Group) => wanted === null || group.label === wanted,
);
if (groups.length === 0) {
  throw new Error(`needle: no group named ${wanted} in manifest.json`);
}

let downloaded = 0;
let skipped = 0;

for (const group of groups) {
  for (const entry of group.files) {
    const destination = path.join(root, group.target, entry.name);
    if (!force && (await verified(destination, entry))) {
      skipped += 1;
      continue;
    }
    await mkdir(path.dirname(destination), { recursive: true });
    const url = `https://huggingface.co/${manifest.repo}/resolve/${manifest.revision}/${entry.remote}`;
    process.stdout.write(`needle: ${group.label}/${entry.name} … `);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `${url} answered ${response.status} ${response.statusText}`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = hash(bytes);
    if (digest !== entry.sha256) {
      throw new Error(
        `${entry.name} came back with sha256 ${digest}, manifest says ${entry.sha256}. ` +
          `Either the revision moved or the download is not what it claims to be.`,
      );
    }
    if (bytes.byteLength !== entry.bytes) {
      throw new Error(
        `${entry.name} is ${bytes.byteLength} bytes, manifest says ${entry.bytes}`,
      );
    }
    await Bun.write(destination, bytes);
    downloaded += 1;
    process.stdout.write(`${(bytes.byteLength / 1e6).toFixed(1)} MB\n`);
  }
}

console.log(
  `needle: ${groups.map((group) => group.label).join(" + ")} — ` +
    `${downloaded} downloaded, ${skipped} already present`,
);

/**
 * A file that is present but wrong is re-downloaded rather than trusted.
 *
 * The case that matters is an interrupted fetch: a half-written .cact is the
 * right name, the right place, and 40 % of a model, and the error it eventually
 * produces names neither this script nor the file.
 */
async function verified(destination: string, entry: Entry) {
  if (!existsSync(destination)) return false;
  const bytes = new Uint8Array(await Bun.file(destination).arrayBuffer());
  return bytes.byteLength === entry.bytes && hash(bytes) === entry.sha256;
}

function hash(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}
