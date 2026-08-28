/**
 * Needle 2, on the device, behind one interface.
 *
 * Three backends — CoreML-free Swift, JNI, WebAssembly — all sitting on the
 * same four C functions, all reaching the same `NeedleSession`. Register tools,
 * ask a question, get calls back. Nothing here talks to a server, and nothing
 * here knows about the coach.
 *
 *   const needle = await createNeedleSession({
 *     baseUrl: "/needle",
 *     system: `date: ${new Date().toISOString()}; device: phone`,
 *     minConfidence: 0.6,
 *   })
 *   needle.toolbox.register(logFood, startWorkout)
 *   const { calls, stop } = await needle.run("log 200g of chicken breast")
 */
import { NeedleSession, type NeedleSessionOptions } from "./session.ts";
import { NeedleToolbox } from "./tools.ts";
import type { NeedleRuntime, NeedleTool, NeedleWeights } from "./types.ts";

export { NeedleSession } from "./session.ts";
export type { NeedleSessionOptions } from "./session.ts";
export { NeedleToolbox, defineTool, toParameters } from "./tools.ts";
export { parseTurn } from "./turn.ts";
export { createWasmRuntime } from "./runtime-wasm.ts";
export { createWorkerRuntime, canUseWorker } from "./runtime-worker.ts";
export type { WorkerRuntimeOptions } from "./runtime-worker.ts";
export type { WasmRuntimeOptions } from "./runtime-wasm.ts";
export { createNativeRuntime } from "./runtime-native.ts";
export type { NeedlePluginApi } from "./runtime-native.ts";
export * from "./types.ts";

/** The three files the model repo ships, under whatever base you serve them. */
export const NEEDLE_ASSETS = {
  glue: "needle.js",
  wasm: "needle.wasm",
  weights: "needle2.cact",
} as const;

export type CreateNeedleOptions = Omit<
  NeedleSessionOptions,
  "runtime" | "weights" | "tools"
> & {
  /**
   * Where `needle.js`, `needle.wasm` and `needle2.cact` are served from.
   *
   * Read by the wasm backend only. Native links the weights in and fetches
   * nothing, so none of these three URLs is ever resolved there.
   *
   * It must be absolute on native all the same, for the day somebody points
   * `weights` at a tuned `.cact`: these assets sit outside the OTA bundle,
   * which is swapped wholesale on every update, so a root-relative path
   * resolves inside whichever bundle Capgo installed last and 404s.
   * `apps/mobile/src/lib/needle.ts` is where that origin is decided.
   */
  baseUrl?: string;
  assets?: { glueUrl: string; wasmUrl: string; weightsUrl: string };
  /**
   * Overrides the weights. Defaults to embedded on native and the served
   * `.cact` on wasm, which is right unless you are running tuned weights.
   */
  weights?: NeedleWeights;
  tools?: NeedleToolbox | ReadonlyArray<NeedleTool<never, unknown>>;
  /**
   * `auto` picks native inside the Capacitor shell and wasm everywhere else,
   * which is what you want. The explicit values exist for the simulator, where
   * running the wasm build is the fastest way to tell a model problem apart
   * from a linking problem.
   */
  backend?: "auto" | "native" | "wasm";
  /**
   * Set `false` to run the wasm build on the calling thread. Only worth doing
   * to prove a worker problem is a worker problem — everything the engine does
   * is long enough to be felt.
   */
  worker?: boolean;
  runtime?: NeedleRuntime;
};

export async function createNeedleSession(options: CreateNeedleOptions = {}) {
  const base = (options.baseUrl ?? "/needle").replace(/\/$/, "");
  const assets = options.assets ?? {
    glueUrl: `${base}/${NEEDLE_ASSETS.glue}`,
    wasmUrl: `${base}/${NEEDLE_ASSETS.wasm}`,
    weightsUrl: `${base}/${NEEDLE_ASSETS.weights}`,
  };
  const runtime = options.runtime ?? (await resolveRuntime(options, assets));
  const {
    baseUrl: _baseUrl,
    assets: _assets,
    backend: _backend,
    worker: _worker,
    runtime: _runtime,
    weights: _weights,
    ...rest
  } = options;
  return new NeedleSession({
    ...rest,
    runtime,
    // Decided from the runtime rather than the platform, so that forcing
    // `backend: "wasm"` in the simulator still fetches the .cact the wasm build
    // has no copy of.
    weights:
      options.weights ??
      (runtime.platform === "wasm"
        ? { url: assets.weightsUrl }
        : { embedded: true }),
  });
}

async function resolveRuntime(
  options: CreateNeedleOptions,
  assets: { glueUrl: string; wasmUrl: string },
): Promise<NeedleRuntime> {
  const backend = options.backend ?? "auto";
  if (backend !== "wasm" && (backend === "native" || (await isNative()))) {
    const { createNativeRuntime } = await import("./runtime-native.ts");
    return await createNativeRuntime();
  }
  // Off the main thread wherever there is another one to use. The engine is
  // the same either way; the difference is whether the page keeps its frames
  // while `needle_load` copies 13.7 MB and decode runs for seconds.
  if (options.worker !== false) {
    const { canUseWorker, createWorkerRuntime } =
      await import("./runtime-worker.ts");
    if (canUseWorker()) {
      try {
        return await createWorkerRuntime(assets);
      } catch {
        // A bundler that cannot see the worker file, or a WebView that refuses
        // to spawn one, is a reason to be slow rather than a reason to fail.
      }
    }
  }
  const { createWasmRuntime } = await import("./runtime-wasm.ts");
  return await createWasmRuntime(assets);
}

/**
 * Asked of Capacitor rather than sniffed from the user agent, and never cached
 * into a module constant — whichever module imported this one first would
 * otherwise freeze the answer for the whole test process.
 */
async function isNative() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
