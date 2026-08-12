// Ensures the generated billing seam files exist before anything tries to
// build.
//
// Each pair is (generated file, checked-in stub). The generated files are
// gitignored: production machines carry private implementations that are not
// in this repository, and everyone else runs the stubs. A fresh clone has
// neither, so this copies the stubs into place. Files that already exist —
// stub or otherwise — are left alone.
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const seams = [
  {
    target: join(root, "convex", "billing", "provider.ts"),
    stub: join(root, "convex", "billing", "provider.stub.ts"),
  },
  {
    target: join(
      root,
      "apps",
      "mobile",
      "src",
      "components",
      "billing",
      "index.tsx",
    ),
    stub: join(
      root,
      "apps",
      "mobile",
      "src",
      "components",
      "billing",
      "index.stub.tsx",
    ),
  },
];

for (const { target, stub } of seams) {
  if (!existsSync(target)) {
    copyFileSync(stub, target);
    console.log(`billing: no provider found, installed the stub (${target})`);
  }
}
