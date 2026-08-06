/**
 * Uploads the runtime pose weights to R2. Run from a machine that has them —
 * normally straight after scripts/form-JEPA/export_onnx.py.
 *
 *   bun run models:publish
 *
 * Prerequisites, once:
 *   1. Enable R2 on the Cloudflare account (dashboard → R2 → Enable). It is a
 *      billing opt-in, so no API token can do it.
 *   2. `npx wrangler@4 r2 bucket create onerep-models`
 *   3. Give the bucket a public hostname — either the r2.dev subdomain or a
 *      custom domain — and point `baseUrl` in manifest.json at it. CI fetches
 *      over plain HTTPS with no credentials, so the bucket has to be readable.
 *
 * Objects are written under v<version>/, and the version in manifest.json is
 * bumped whenever the models are re-exported. Old builds keep resolving the
 * models they were tested against, and a redeploy of an old commit stays
 * reproducible. Nothing is ever overwritten in place.
 *
 * Uses wrangler rather than the S3 API so it reuses the Cloudflare auth already
 * on the machine, and needs no extra access-key pair to leak.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dir, "../..");
const manifestPath = path.join(import.meta.dir, "manifest.json");
const manifest = await Bun.file(manifestPath).json();
const sourceDir = path.join(root, manifest.target);

const sha256 = async (file: string) => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(file).arrayBuffer());
  return hasher.digest("hex");
};

// Verify before uploading anything: publishing a model whose checksum does not
// match the committed manifest would leave CI unable to fetch it, which is a
// confusing way to find out you forgot to update the manifest.
for (const entry of manifest.files as { name: string; bytes: number; sha256: string }[]) {
  const source = path.join(sourceDir, entry.name);
  if (!existsSync(source)) {
    throw new Error(`${entry.name} is missing from ${manifest.target}. Re-export it first.`);
  }
  const bytes = Bun.file(source).size;
  const digest = await sha256(source);
  if (bytes !== entry.bytes || digest !== entry.sha256) {
    throw new Error(
      `${entry.name} does not match manifest.json.\n` +
        `  manifest: ${entry.bytes} bytes, ${entry.sha256}\n` +
        `  on disk:  ${bytes} bytes, ${digest}\n` +
        `If this is a new export, bump "version" and update the checksums in manifest.json.`,
    );
  }
}

for (const entry of manifest.files as { name: string }[]) {
  const source = path.join(sourceDir, entry.name);
  const key = `v${manifest.version}/${entry.name}`;
  console.log(` put r2://${manifest.bucket}/${key}`);
  const result = Bun.spawnSync(
    [
      "npx",
      "--yes",
      "wrangler@4",
      "r2",
      "object",
      "put",
      `${manifest.bucket}/${key}`,
      "--file",
      source,
      "--content-type",
      "application/octet-stream",
      "--remote",
    ],
    { cwd: root, stdout: "inherit", stderr: "inherit" },
  );
  if (result.exitCode !== 0) throw new Error(`wrangler failed for ${entry.name}`);
}

console.log(`\nPublished ${manifest.files.length} objects at v${manifest.version}.`);
console.log(`Verify with: bun run models:fetch --force`);
