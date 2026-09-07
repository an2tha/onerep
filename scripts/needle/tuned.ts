/**
 * Puts the tuned weights where the app will serve them from.
 *
 * `needle2-onerep.cact` is the base checkpoint with the OneRep LoRA merged in
 * — built by `needle build` from scripts/needle2-finetune. Unlike the stock
 * blob it is not on Hugging Face, so there is nothing to fetch and no checksum
 * to check it against; it is committed, and this copies it next to the engine.
 *
 * `apps/mobile/public` is what `cap sync` sweeps into the app bundle, so
 * native builds carry the tuned file too — the native plugin loads it directly
 * from the bundle via `asset: "needle/needle2-onerep.cact"`. If the bundle
 * copy is missing (e.g. after an OTA update), the plugin falls through to the
 * network URL.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dir, "../..");
const source = path.join(
  root,
  "scripts/needle2-finetune/needle2-onerep.cact",
);
const destination = path.join(
  root,
  "apps/mobile/public/needle/needle2-onerep.cact",
);

if (!existsSync(source)) {
  throw new Error(
    `needle: ${path.relative(root, source)} is missing. Build it with:\n` +
      `  cd scripts/needle2-finetune && .venv/bin/needle build checkpoints/needle2.pkl ` +
      `--lora checkpoints/onerep-lora.pkl --out needle2-onerep.cact`,
  );
}

const bytes = new Uint8Array(await Bun.file(source).arrayBuffer());
// A .cact opens with this tag; anything else is a truncated copy or a text
// file wearing the extension, and the failure it causes otherwise happens
// inside the wasm engine as an unhelpful load error.
if (!(bytes[0] === 0x83 && bytes[1] === 0x2a && bytes[2] === 0xe1)) {
  throw new Error("needle: the tuned weights do not start with a .cact tag");
}

await mkdir(path.dirname(destination), { recursive: true });
await Bun.write(destination, bytes);
console.log(
  `needle: tuned weights → ${path.relative(root, destination)} ` +
    `(${(bytes.byteLength / 1e6).toFixed(1)} MB)`,
);
