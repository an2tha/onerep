/// <reference lib="webworker" />

/**
 * The engine, one thread over.
 *
 * `createWasmRuntime` runs unchanged in here — its glue loader already has a
 * branch for contexts with no `document`, which is exactly this one. All this
 * file adds is the postMessage envelope: one request in, one reply out, in the
 * order they arrive, because the C API behind it is four functions over a
 * single process-global engine and cannot be asked two things at once.
 *
 * Nothing about the engine gets faster by being here. What changes is who
 * waits: a 13.7 MB `needle_load` and a decode loop that runs for seconds are
 * both perfectly happy to block a thread, and on the main thread that is the
 * whole app — scrolling, animation, the page that spawned it. The pose models
 * get away with staying put because one YOLO pass is milliseconds; a turn of
 * autoregressive decode is not.
 */

import { createWasmRuntime } from "./runtime-wasm.ts";
import type { NeedleRuntime, NeedleWeights } from "./types.ts";

type Request =
  | {
      id: number;
      op: "start";
      glueUrl: string;
      wasmUrl: string;
      bufferBytes?: number;
    }
  | { id: number; op: "load"; weights: NeedleWeights }
  | {
      id: number;
      op: "init";
      system: string | null;
      toolsJson: string;
      toolIndexPath: string | null;
    }
  | { id: number; op: "complete"; input: string; maxNewTokens: number }
  | { id: number; op: "reset" };

let runtime: NeedleRuntime | null = null;
/** Requests are serialised here as well as in the session: a `complete` that
 * overtook its own `init` would be a different bug in a harder place. */
let queue: Promise<unknown> = Promise.resolve();

function need() {
  if (!runtime) throw new Error("needle: worker used before start");
  return runtime;
}

async function handle(request: Request): Promise<unknown> {
  switch (request.op) {
    case "start":
      runtime = await createWasmRuntime({
        glueUrl: request.glueUrl,
        wasmUrl: request.wasmUrl,
        ...(request.bufferBytes ? { bufferBytes: request.bufferBytes } : {}),
      });
      return null;
    case "load":
      return await need().load(request.weights);
    case "init":
      return await need().init({
        system: request.system,
        toolsJson: request.toolsJson,
        toolIndexPath: request.toolIndexPath,
      });
    case "complete":
      return await need().complete(request.input, request.maxNewTokens);
    case "reset":
      return await need().reset();
  }
}

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const request = event.data;
  queue = queue.then(async () => {
    try {
      const value = await handle(request);
      self.postMessage({ id: request.id, ok: true, value });
    } catch (cause) {
      self.postMessage({
        id: request.id,
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  });
});
