/**
 * The browser runtime, moved off the main thread.
 *
 * Same four functions, same wasm build, same weights — the only difference is
 * which thread blocks while the engine works, and that difference is the whole
 * point. `needle_load` copies 13.7 MB into the wasm heap and a turn of decode
 * runs for as long as it runs; on the main thread both of those are frames the
 * page does not get.
 *
 * There is no cancellation here because there is none underneath: the C API
 * has no way to interrupt a `needle_complete` in flight. `dispose` terminates
 * the worker, which is the only stop that exists, and it takes the engine with
 * it — the caller gets a fresh one next time or nothing at all.
 */

import type { NeedleRuntime, NeedleWeights } from "./types.ts";

export type WorkerRuntimeOptions = {
  glueUrl: string;
  wasmUrl: string;
  bufferBytes?: number;
  /** Overridable so a host with its own bundling rules can hand one over. */
  spawn?: () => Worker;
};

/** Flat rather than a discriminated union: this crosses `postMessage`, where
 * the type is a claim about the other side rather than a fact about it. */
type Reply = { id: number; ok: boolean; value?: unknown; error?: string };

/** Whether this environment can run the engine off-thread at all. Node and the
 * test process cannot, and neither can a WebView with workers disabled. */
export function canUseWorker() {
  return typeof Worker !== "undefined";
}

export async function createWorkerRuntime(
  options: WorkerRuntimeOptions,
): Promise<NeedleRuntime> {
  const worker = options.spawn
    ? options.spawn()
    : new Worker(new URL("./needle.worker.ts", import.meta.url), {
        type: "module",
      });

  const waiting = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (cause: Error) => void }
  >();
  let next = 0;
  let dead: Error | null = null;

  worker.addEventListener("message", (event: MessageEvent<Reply>) => {
    const reply = event.data;
    const seat = waiting.get(reply.id);
    if (!seat) return;
    waiting.delete(reply.id);
    if (reply.ok) seat.resolve(reply.value);
    else seat.reject(new Error(reply.error ?? "needle: the worker failed"));
  });

  // A worker that dies takes every outstanding call with it. Without this they
  // hang forever, which is the failure everybody mistakes for a slow model.
  worker.addEventListener("error", (event: ErrorEvent) => {
    dead = new Error(event.message || "needle: the worker died");
    for (const seat of waiting.values()) seat.reject(dead);
    waiting.clear();
  });

  function ask<T>(request: Record<string, unknown>): Promise<T> {
    if (dead) return Promise.reject(dead);
    const id = (next += 1);
    return new Promise<T>((resolve, reject) => {
      waiting.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      worker.postMessage({ ...request, id });
    });
  }

  await ask({
    op: "start",
    glueUrl: options.glueUrl,
    wasmUrl: options.wasmUrl,
    ...(options.bufferBytes ? { bufferBytes: options.bufferBytes } : {}),
  });

  return {
    platform: "wasm",
    load: (weights: NeedleWeights) => ask({ op: "load", weights }),
    init: (context) => ask({ op: "init", ...context }),
    complete: (input, maxNewTokens) =>
      ask<string>({ op: "complete", input, maxNewTokens }),
    reset: () => ask({ op: "reset" }),
    async dispose() {
      dead = new Error("needle: the session was disposed");
      for (const seat of waiting.values()) seat.reject(dead);
      waiting.clear();
      worker.terminate();
    },
  };
}
