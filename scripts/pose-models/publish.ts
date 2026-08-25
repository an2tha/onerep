/**
 * Uploads the runtime pose weights to R2. Run from a machine that has them —
 * normally straight after scripts/form-JEPA/export_onnx.py.
 *
 *   bun run models:publish            the .onnx weights, to R2
 *   bun run models:publish --coreml   the iOS .mlpackage bundles, to a GitHub
 *                                     release on the private repo
 *
 * The CoreML packages are directories. Each file inside goes up as its own
 * object under the same versioned prefix, so nothing has to be archived and no
 * checksum depends on when a zip was made.
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
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dir, "../..");
const manifestPath = path.join(import.meta.dir, "manifest.json");
const manifest = await Bun.file(manifestPath).json();
const withCoreML = process.argv.includes("--coreml");

type Entry = { name: string; bytes: number; sha256: string };
type Release = { repo: string; tag: string };
// --coreml publishes the CoreML packages *instead of* the .onnx weights, not
// alongside them: the two go to different places, and the R2 half is dormant
// until somebody enables R2 on the account. Publishing one should not require
// the other to be reachable.
const groups: { target: string; files: Entry[]; release?: Release }[] = withCoreML
  ? [{ target: manifest.coremlTarget, files: manifest.coreml, release: manifest.coremlRelease }]
  : [{ target: manifest.target, files: manifest.files }];

const assetName = (name: string) => name.replaceAll("/", "__");

// Flat asset names, so the tree has to be flattened on the way up. The staging
// copies live under .cache and are overwritten every run; nothing reads them
// afterwards.
const uploadToRelease = async (release: Release, sourceDir: string, files: Entry[]) => {
  const staging = path.join(root, ".cache/pose-models-upload");
  await mkdir(staging, { recursive: true });

  const exists = Bun.spawnSync(["gh", "release", "view", release.tag, "--repo", release.repo], {
    stdout: "ignore",
    stderr: "ignore",
  }).exitCode === 0;
  if (!exists) {
    console.log(` new   release ${release.repo}@${release.tag}`);
    const created = Bun.spawnSync(
      ["gh", "release", "create", release.tag, "--repo", release.repo, "--title",
       "Pose models (CoreML)", "--notes",
       "iOS .mlpackage bundles fetched by scripts/pose-models/fetch.ts --coreml. Not source; build artifacts of scripts/form-JEPA.",
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    if (created.exitCode !== 0) throw new Error(`could not create release ${release.tag}`);
  }

  for (const entry of files) {
    const staged = path.join(staging, assetName(entry.name));
    await Bun.write(staged, Bun.file(path.join(sourceDir, entry.name)));
    console.log(` put   ${release.repo}@${release.tag} ${assetName(entry.name)}`);
    const result = Bun.spawnSync(
      ["gh", "release", "upload", release.tag, staged, "--repo", release.repo, "--clobber"],
      { stdout: "inherit", stderr: "inherit" },
    );
    if (result.exitCode !== 0) throw new Error(`gh failed for ${entry.name}`);
  }
  return files.length;
};

const sha256 = async (file: string) => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(file).arrayBuffer());
  return hasher.digest("hex");
};

// Verify before uploading anything: publishing a model whose checksum does not
// match the committed manifest would leave CI unable to fetch it, which is a
// confusing way to find out you forgot to update the manifest.
for (const group of groups) {
 const sourceDir = path.join(root, group.target);
 for (const entry of group.files) {
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
}

let published = 0;
for (const group of groups) {
 const sourceDir = path.join(root, group.target);
 if (group.release) {
   published += await uploadToRelease(group.release, sourceDir, group.files);
   continue;
 }
 for (const entry of group.files) {
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
  published += 1;
 }
}

console.log(`\nPublished ${published} objects at v${manifest.version}.`);
console.log(`Verify with: bun run models:fetch --force${withCoreML ? " --coreml" : ""}`);
