import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import * as z from "zod";
import { createWasmRuntime } from "../runtime-wasm.ts";
import { NeedleSession } from "../session.ts";
import { defineTool } from "../tools.ts";

/**
 * The real engine, real weights, real decode.
 *
 * Skipped when the assets are not there, because they are 14 MB fetched from
 * Hugging Face by `bun run needle:fetch` and deliberately not committed. That
 * makes this a test most runs do not execute — which is the honest trade: the
 * alternative is a suite that only ever exercises a fake, and every interesting
 * thing about this integration (the BigInt length argument, the counts that
 * come back where a status code was expected, the UMD glue that will not simply
 * import) was found by running it.
 */
const assets = path.join(
  import.meta.dir,
  "../../../../apps/mobile/public/needle",
);
const present =
  existsSync(path.join(assets, "needle.js")) &&
  existsSync(path.join(assets, "needle.wasm")) &&
  existsSync(path.join(assets, "needle2.cact"));

/** The runtime speaks in URLs; on disk, a URL is a path and a `Response`. */
const fromDisk = (async (url: string | URL) =>
  new Response(await Bun.file(String(url)).arrayBuffer(), {
    status: 200,
  })) as unknown as typeof fetch;

async function engine() {
  const runtime = await createWasmRuntime({
    glueUrl: path.join(assets, "needle.js"),
    wasmUrl: path.join(assets, "needle.wasm"),
    fetch: fromDisk,
  });
  return new NeedleSession({
    runtime,
    weights: { url: path.join(assets, "needle2.cact") },
    system: "date: 2026-08-26 Wed 14:30; locale: en-GB; device: phone",
    tools: [
      defineTool({
        name: "set_lights",
        description: "Turn a room's lights on or off and set brightness",
        input: z.object({
          room: z.string().describe("which room to control"),
          on: z.boolean(),
          brightness: z.number().int().min(0).max(100).optional(),
        }),
        execute: (input) => ({ ok: true, ...input }),
      }),
    ],
  });
}

describe.skipIf(!present)("needle 2, actually running", () => {
  test("turns a sentence into a grammar-conforming call", async () => {
    const session = await engine();
    const result = await session.run("dim the kitchen to 10");

    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]?.name).toBe("set_lights");
    expect(result.calls[0]?.arguments).toMatchObject({
      room: "kitchen",
      brightness: 10,
    });
    expect(result.stop).toBe("done");
    expect(result.turn.confidence).toBeGreaterThan(0.5);
  }, 120_000);

  test("refuses what no declared tool can serve", async () => {
    const session = await engine();
    const result = await session.run("what is the capital of Peru");

    expect(result.stop).toBe("refused");
    expect(result.calls).toEqual([]);
  }, 120_000);

  test("the wasm build refuses embedded weights instead of failing later", async () => {
    // needle.wasm is 333 KB of kernels; the .cact is not in it. The native
    // archives are the opposite case, which is the whole reason this branch
    // exists — see NeedleWeights.
    const runtime = await createWasmRuntime({
      glueUrl: path.join(assets, "needle.js"),
      wasmUrl: path.join(assets, "needle.wasm"),
      fetch: fromDisk,
    });

    expect(runtime.load({ embedded: true })).rejects.toThrow(
      /wasm build embeds no weights/,
    );
  }, 120_000);

  test("extracts a record when the record is the only tool", async () => {
    const session = await engine();
    const receipt = await session.extract(
      "GreenMart receipt: oat milk 3.50, total 7.75",
      {
        name: "receipt",
        description: "A purchase receipt shared as text",
        parameters: {
          type: "object",
          properties: {
            merchant: { type: "string" },
            total: { type: "number" },
          },
          required: ["merchant", "total"],
        },
      },
    );

    expect(receipt).toMatchObject({ merchant: "GreenMart", total: 7.75 });
  }, 120_000);
});
