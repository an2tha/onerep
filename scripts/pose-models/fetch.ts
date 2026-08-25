/**
 * Downloads the runtime pose weights into apps/mobile/public/models.
 *
 * The two .onnx files are build artifacts of scripts/form-JEPA/export_onnx.py,
 * too large and too frequently re-exported to keep in git history, so they live
 * in R2 and are pulled in before the build. Vite then copies them into
 * apps/mobile/dist and they deploy to app.onerep.life, which is where the web
 * app and — via otaOrigin() — the native app both fetch them from at runtime.
 * They are deliberately excluded from the OTA zip for the same reason.
 *
 *   bun run models:fetch            the .onnx weights
 *   bun run models:fetch --coreml   those, plus the iOS .mlpackage bundles
 *
 * The CoreML packages are directories, and every file inside is an object of
 * its own in the same versioned prefix — nothing to archive, nothing whose
 * checksum depends on when the zip was made. Only the iOS build needs them,
 * which is why they are behind a flag rather than in the default set.
 *
 * This has to run before `turbo run test` as well as before the build:
 * apps/mobile/public-assets.test.ts asserts both files are present, because a
 * deploy without them replaces the site and 404s every pose request.
 *
 * Every download is checked against the committed sha256 in manifest.json. That
 * is not paranoia about R2 — it is that a truncated or HTML-substituted body
 * arrives with a 200 and only fails later, inside onnxruntime, as "protobuf
 * parsing failed", which is a genuinely awful thing to debug from a build log.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dir, "../..");
const manifest = await Bun.file(path.join(import.meta.dir, "manifest.json")).json();
const force = process.argv.includes("--force");
const withCoreML = process.argv.includes("--coreml");

type Entry = { name: string; bytes: number; sha256: string };
type Release = { repo: string; tag: string };
const groups: { label: string; target: string; files: Entry[]; release?: Release }[] = [
  { label: "onnx", target: manifest.target, files: manifest.files },
];
if (withCoreML) {
  groups.push({
    label: "coreml",
    target: manifest.coremlTarget,
    files: manifest.coreml,
    release: manifest.coremlRelease,
  });
}

// Release assets have flat names; the packages are trees. One separator, one
// reversal, and nothing has to encode a directory listing anywhere.
const assetName = (name: string) => name.replaceAll("/", "__");

const downloadAsset = (release: Release, entry: Entry, dir: string) => {
  const result = Bun.spawnSync(
    ["gh", "release", "download", release.tag, "--repo", release.repo,
     "--pattern", assetName(entry.name), "--dir", dir, "--clobber"],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Could not download ${entry.name} from ${release.repo}@${release.tag}.\n` +
        `The CoreML packages are gitignored, so a clean checkout has to pull them:\n` +
        `  - locally, gh must be authenticated against the private repo\n` +
        `  - in CI, the job needs GH_TOKEN set to a token that can read releases\n` +
        `If the release does not exist yet: bun run models:publish:ios, from a machine holding the packages.`,
    );
  }
};

const sha256 = async (file: string) => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(file).arrayBuffer());
  return hasher.digest("hex");
};

let fetched = 0;
let total = 0;
for (const group of groups) {
 const targetDir = path.join(root, group.target);
 await mkdir(targetDir, { recursive: true });
 for (const entry of group.files) {
  total += 1;
  const target = path.join(targetDir, entry.name);

  if (!force && existsSync(target)) {
    const digest = await sha256(target);
    if (digest === entry.sha256) {
      console.log(` ok    ${entry.name} (cached)`);
      continue;
    }
    console.log(` stale ${entry.name} — checksum differs, re-fetching`);
  }

  // The release path: gh writes the asset to a scratch dir under the flat
  // name, and it is verified and moved into place below like any other body.
  if (group.release) {
    const scratch = path.join(root, ".cache/pose-models");
    await mkdir(scratch, { recursive: true });
    console.log(` get   ${group.release.repo}@${group.release.tag} ${assetName(entry.name)}`);
    downloadAsset(group.release, entry, scratch);
    const staged = path.join(scratch, assetName(entry.name));
    const body = new Uint8Array(await Bun.file(staged).arrayBuffer());
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(body);
    const digest = hasher.digest("hex");
    if (digest !== entry.sha256) {
      throw new Error(`${entry.name}: sha256 mismatch\n  expected ${entry.sha256}\n  got      ${digest}`);
    }
    await Bun.write(target, body);
    console.log(` ok    ${entry.name} (${(body.byteLength / 1024 / 1024).toFixed(1)} MiB)`);
    fetched += 1;
    continue;
  }

  // Versioned key, so a redeploy of an older commit cannot pick up a model
  // exported after it and silently change what that build measures.
  const url = `${manifest.baseUrl}/v${manifest.version}/${entry.name}`;
  console.log(` get   ${url}`);

  const hint =
    `\nThe models live in R2 (bucket "${manifest.bucket}"). If they have not been published yet:\n` +
    `  1. Enable R2 in the Cloudflare dashboard — it is a billing opt-in no API token can perform.\n` +
    `  2. npx wrangler@4 r2 bucket create ${manifest.bucket}\n` +
    `  3. Give it a public hostname and point "baseUrl" in scripts/pose-models/manifest.json at it.\n` +
    `  4. bun run models:publish, from a machine holding the exported files.`;

  // A DNS or TLS failure throws rather than returning a response, so it has to
  // be caught here or CI reports a bare "ConnectionRefused" with no clue what
  // it was reaching for or what to do about it.
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(`${entry.name}: cannot reach ${url} (${(cause as Error).message})${hint}`);
  }
  if (!response.ok) {
    throw new Error(`${entry.name}: ${response.status} ${response.statusText} from ${url}${hint}`);
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength !== entry.bytes) {
    throw new Error(`${entry.name}: expected ${entry.bytes} bytes, got ${body.byteLength}`);
  }

  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(body);
  const digest = hasher.digest("hex");
  if (digest !== entry.sha256) {
    throw new Error(`${entry.name}: sha256 mismatch\n  expected ${entry.sha256}\n  got      ${digest}`);
  }

  await Bun.write(target, body);
  console.log(` ok    ${entry.name} (${(body.byteLength / 1024 / 1024).toFixed(1)} MiB)`);
  fetched += 1;
 }
}

console.log(`${fetched} downloaded, ${total - fetched} already present.`);
