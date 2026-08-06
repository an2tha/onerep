# Runtime pose models

The two ONNX files the Form Coach runs on:

| File | Precision | Size | Runs |
| --- | --- | --- | --- |
| `yolo11n_pose_448_fp32.onnx` | fp32 | 11.7 MB | once per **frame** |
| `motionbert_lite_int8.onnx` | int8 | 16.6 MB | once per **clip** |

They are build artifacts of `scripts/form-JEPA/export_onnx.py`, not source.

## Why they have to be present at build time

Vite copies `apps/mobile/public/models` into `apps/mobile/dist`, which deploys to
`app.onerep.life`. That origin is where **both** clients fetch the models at
runtime — the web app from `/models`, and the native app from
`${otaOrigin()}/models`, which resolves to the same host. They are deliberately
kept out of the OTA zip for exactly that reason.

Cloudflare Pages replaces the entire site on every deploy. A build without the
models therefore does not fall back to the previously deployed copies: it 404s
every pose request, on web and native alike. `apps/mobile/public-assets.test.ts`
is the guard against that. **Do not relax it — satisfy it.**

This has already gone wrong once: `1082c3a` untracked the models without adding
any replacement delivery, which took CI red and would have shipped a modelless
deploy the moment anyone forced it green.

## Current state

The models are tracked in git (`7535c47`), so `bun run models:fetch` finds them
already present, verifies their checksums and exits without touching the
network. Everything below is wired and ready but dormant.

## Moving to R2

Motivation: each re-export writes another ~28 MB into git history forever.
Object storage makes re-exports free.

One-off setup:

1. **Enable R2** in the Cloudflare dashboard. It is a billing opt-in — no API
   token can do it, and the API returns error 10042 until it is done.
2. `npx wrangler@4 r2 bucket create onerep-models`
3. Give the bucket a public hostname (its `r2.dev` subdomain or a custom
   domain) and point `baseUrl` in `manifest.json` at it. CI fetches over plain
   HTTPS with no credentials, so it has to be publicly readable.
4. `bun run models:publish` from a machine holding the exported files.
5. Verify: `bun run models:fetch --force`

Then, and only then, stop tracking them:

```sh
git rm --cached apps/mobile/public/models/*.onnx
# restore the ignore rule: drop the "!apps/mobile/public/models/*.onnx" line
```

The `Fetch pose models` CI step already runs before the tests and the build, so
nothing else changes. Note that this does not reclaim the ~28 MB already in
history at `7535c47` — that would need a history rewrite.

## Re-exporting

Object keys are versioned (`v<version>/<name>`), so an old commit keeps
resolving the models it was tested against and nothing is overwritten in place.
After a re-export:

1. Update `bytes` and `sha256` in `manifest.json` (`shasum -a 256 <file>`).
2. Bump `version`.
3. `bun run models:publish`.

`publish.ts` refuses to upload anything whose checksum disagrees with the
manifest, so a forgotten manifest update fails loudly at your terminal rather
than quietly in CI.
