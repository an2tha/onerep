import { NeedleSession } from "./session.ts";
import { createNativeRuntime } from "./runtime-native.ts";
import type { CreateNeedleOptions } from "./index.ts";
export { NeedleSession } from "./session.ts";
export type { NeedleSessionOptions } from "./session.ts";
export { NeedleToolbox, defineTool, toParameters } from "./tools.ts";
export { parseTurn } from "./turn.ts";
export { createNativeRuntime } from "./runtime-native.ts";
export type { NeedlePluginApi } from "./runtime-native.ts";
export type { CreateNeedleOptions } from "./index.ts";
export * from "./types.ts";

export async function createNeedleSession(options: CreateNeedleOptions = {}) {
  const {
    baseUrl: _baseUrl,
    assets: _assets,
    backend: _backend,
    worker: _worker,
    runtime: suppliedRuntime,
    weights,
    ...rest
  } = options;
  if (options.backend === "wasm")
    throw new Error("The iOS app uses the bundled native engine.");
  const runtime = suppliedRuntime ?? (await createNativeRuntime());
  return new NeedleSession({
    ...rest,
    runtime,
    weights: weights ?? { embedded: true },
  });
}
