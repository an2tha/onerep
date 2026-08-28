import type { NeedleRuntime, NeedleWeights } from "./types.ts";

/**
 * The browser runtime: `wasm/needle.js` plus `wasm/needle.wasm` from the model
 * repo, driven through the same four C functions the phones call.
 *
 * 333 KB of wasm and 14 MB of weights. That is the whole runtime — no worker
 * pool, no SharedArrayBuffer, no cross-origin isolation to arrange, which is
 * exactly why this is the fallback that works everywhere the pose models do not.
 */

/** Matches the Python binding's default. Turns are JSON objects, not essays. */
const DEFAULT_BUFFER_BYTES = 65_536;

type EmscriptenModule = {
  HEAPU8: Uint8Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  UTF8ToString(pointer: number): string;
  _needle_init(system: number, tools: number, index: number): number;
  /**
   * `n` is `unsigned long long` in the header, and emscripten maps a 64-bit
   * integer parameter to a JS BigInt. Handing it a plain number does not
   * truncate — it throws `Invalid argument type in ToBigInt operation`, which
   * is at least honest, and is why this one signature looks different.
   */
  _needle_load(bytes: number, length: bigint): number;
  _needle_complete(
    input: number,
    maxNewTokens: number,
    out: number,
    capacity: number,
  ): number;
  _needle_reset(): void;
};

type NeedleFactory = (options: {
  wasmBinary: ArrayBuffer | Uint8Array;
}) => Promise<EmscriptenModule>;

export type WasmRuntimeOptions = {
  /** URL of `needle.js`, the emscripten glue. */
  glueUrl: string;
  /** URL of `needle.wasm`. */
  wasmUrl: string;
  /**
   * Bytes reserved for one turn's JSON.
   *
   * The engine writes into a fixed buffer and truncates rather than growing, so
   * this is a ceiling on the reasoning string more than on the calls. 64 KB
   * costs nothing and is far past anything a tool call needs.
   */
  bufferBytes?: number;
  fetch?: typeof globalThis.fetch;
};

export async function createWasmRuntime(
  options: WasmRuntimeOptions,
): Promise<NeedleRuntime> {
  const get = options.fetch ?? globalThis.fetch.bind(globalThis);
  const capacity = options.bufferBytes ?? DEFAULT_BUFFER_BYTES;
  const [factory, wasmBinary] = await Promise.all([
    loadFactory(options.glueUrl, get),
    read(get, options.wasmUrl),
  ]);
  // `wasmBinary` rather than letting the glue locate its own file: this build
  // resolves `needle.wasm` against the script's own directory and offers no
  // `locateFile` hook, so a glue file served from a CDN or an OTA bundle would
  // go looking for the binary somewhere we never put it.
  const module = await factory({ wasmBinary });

  const out = module._malloc(capacity);
  if (!out) throw new Error("needle: could not reserve an output buffer");

  /**
   * Held for the life of the runtime, never freed.
   *
   * The engine is handed a pointer and we have no contract saying it copies.
   * 14 MB of resident wasm heap is the cost of not finding out the hard way,
   * on a device, that it did not.
   */
  const held: number[] = [];

  const put = (value: string | null) => {
    if (value === null) return 0;
    const bytes = new TextEncoder().encode(value);
    const pointer = module._malloc(bytes.length + 1);
    if (!pointer) throw new Error("needle: out of wasm memory");
    module.HEAPU8.set(bytes, pointer);
    module.HEAPU8[pointer + bytes.length] = 0;
    return pointer;
  };

  return {
    platform: "wasm",

    async load(weights: NeedleWeights) {
      if ("embedded" in weights) {
        // The native archives carry the .cact inside them; needle.wasm is
        // 333 KB of kernels and nothing else. Saying so beats letting
        // needle_init fail with a number.
        throw new Error(
          "needle: the wasm build embeds no weights — pass { url } or { bytes }",
        );
      }
      const bytes =
        "bytes" in weights ? weights.bytes : await read(get, weights.url);
      const pointer = module._malloc(bytes.byteLength);
      if (!pointer) {
        throw new Error(
          `needle: could not allocate ${bytes.byteLength} bytes for the weights`,
        );
      }
      module.HEAPU8.set(bytes, pointer);
      held.push(pointer);
      const code = module._needle_load(pointer, BigInt(bytes.byteLength));
      if (code < 0) throw new Error(`needle_load failed (${code})`);
    },

    async init({ system, toolsJson, toolIndexPath }) {
      // Strings go through malloc, not ccall's "string" marshalling: that one
      // allocates on the wasm stack, and a catalogue of tool schemas is exactly
      // the argument large enough to run the 64 KB stack into the heap.
      const pointers = [
        put(system),
        put(toolsJson),
        put(toolIndexPath),
      ] as const;
      try {
        // Negative is the failure, not non-zero: these three return a count,
        // not a status. `init` answers with the size of the tool context in
        // tokens and `complete` with the bytes it wrote, both of which are
        // healthily non-zero on a successful call.
        const code = module._needle_init(...pointers);
        if (code < 0) throw new Error(`needle_init failed (${code})`);
      } finally {
        for (const pointer of pointers) if (pointer) module._free(pointer);
      }
    },

    async complete(input: string, maxNewTokens: number) {
      const pointer = put(input);
      try {
        const code = module._needle_complete(
          pointer,
          maxNewTokens,
          out,
          capacity,
        );
        if (code < 0) throw new Error(`needle_complete failed (${code})`);
        return module.UTF8ToString(out);
      } finally {
        if (pointer) module._free(pointer);
      }
    },

    async reset() {
      module._needle_reset();
    },
  };
}

async function read(get: typeof fetch, url: string) {
  const response = await get(url);
  if (!response.ok) {
    throw new Error(`needle: ${url} answered ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The glue is a UMD bundle, not a module, so it cannot simply be imported.
 *
 * A classic `<script>` is tried first because it needs no `unsafe-eval` and the
 * top-level `var createNeedle` lands on `window` for free. Workers, Node and
 * the test process have no `document`, and there the source is evaluated
 * directly with the three UMD sentinels left undefined so neither branch of its
 * export dance fires.
 */
async function loadFactory(
  url: string,
  get: typeof fetch,
): Promise<NeedleFactory> {
  const global = globalThis as {
    createNeedle?: NeedleFactory;
    document?: Document;
  };
  if (global.createNeedle) return global.createNeedle;
  if (typeof global.document?.createElement === "function") {
    await new Promise<void>((resolve, reject) => {
      const script = global.document!.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`needle: could not load ${url}`));
      global.document!.head.appendChild(script);
    });
    if (!global.createNeedle) {
      throw new Error(`needle: ${url} did not define createNeedle`);
    }
    return global.createNeedle;
  }
  const source = new TextDecoder().decode(await read(get, url));
  // `require` and the two path globals are named parameters rather than left to
  // scope. Under Bun and Node the glue takes its own filesystem branch — which
  // begins `var fs = require("node:fs")` and runs eagerly, before anything gets
  // a chance not to need it — and inside a `new Function` body neither `require`
  // nor `__dirname` exists, so the whole factory dies on line one. Passing them
  // through costs nothing in a browser, where that branch never runs.
  const build = new Function(
    "exports",
    "module",
    "define",
    "require",
    "__filename",
    "__dirname",
    `${source}\nreturn createNeedle`,
  ) as (
    exports: undefined,
    module: undefined,
    define: undefined,
    require: unknown,
    filename: string | undefined,
    dirname: string | undefined,
  ) => NeedleFactory;
  return build(
    undefined,
    undefined,
    undefined,
    await nodeRequire(),
    undefined,
    (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.(),
  );
}

/**
 * `require`, when there is one to be had.
 *
 * ESM has no `require` in scope, and the glue's Node branch wants one before it
 * will do anything at all. `node:module` is imported by a name a bundler cannot
 * see so that a browser build does not try to resolve it, and the whole thing
 * degrades to `undefined` in the browser, where the branch never runs anyway.
 */
async function nodeRequire(): Promise<unknown> {
  const node = (globalThis as { process?: { versions?: { node?: string } } })
    .process;
  if (!node?.versions?.node) return undefined;
  try {
    const module = await import(/* @vite-ignore */ "node:module");
    return module.createRequire(
      `${(globalThis as { process: { cwd: () => string } }).process.cwd()}/`,
    );
  } catch {
    return undefined;
  }
}
