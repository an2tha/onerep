import { describe, expect, test } from "bun:test";
import { createNeedleSession } from "../index.ts";
import {
  createNativeRuntime,
  type NeedlePluginApi,
} from "../runtime-native.ts";
import type { NeedleRuntime } from "../types.ts";
import { turn } from "./fake-runtime.ts";

/**
 * Where the weights come from, per backend.
 *
 * The distinction is not cosmetic: `libneedle.a` embeds `needle2.cact` verbatim
 * as `needle_weights` and the engine object reads that symbol directly, so a
 * native build that downloads the file fetches 13.7 MB it is already carrying.
 * `needle.wasm` is 333 KB of kernels with no weights at all, so there the fetch
 * is the only way the model arrives.
 */

function fakePlugin() {
  const loads: Array<{ url?: string; data?: string }> = [];
  const plugin: NeedlePluginApi = {
    async isAvailable() {
      return { available: true, platform: "ios" };
    },
    async load(options) {
      loads.push(options);
      return {
        bytes: 0,
        source: options.url ? "url" : options.data ? "data" : "embedded",
      };
    },
    async init() {
      return { tools: 0 };
    },
    async complete() {
      return { json: turn([]) };
    },
    async reset() {},
  };
  return { plugin, loads };
}

/** Enough of a runtime for `createNeedleSession` to pick weights against. */
function stub(platform: NeedleRuntime["platform"]) {
  const loads: unknown[] = [];
  const runtime: NeedleRuntime = {
    platform,
    async load(weights) {
      loads.push(weights);
    },
    async init() {},
    async complete() {
      return turn([]);
    },
    async reset() {},
  };
  return { runtime, loads };
}

describe("weights, by backend", () => {
  test("native takes the weights the archive was linked with", async () => {
    const { runtime, loads } = stub("ios");
    const session = await createNeedleSession({ runtime });
    await session.prepare();

    expect(loads).toEqual([{ embedded: true }]);
  });

  test("wasm fetches the .cact, because needle.wasm has none", async () => {
    const { runtime, loads } = stub("wasm");
    const session = await createNeedleSession({ runtime, baseUrl: "/needle" });
    await session.prepare();

    expect(loads).toEqual([{ url: "/needle/needle2.cact" }]);
  });

  test("an explicit override beats both defaults", async () => {
    const { runtime, loads } = stub("ios");
    const session = await createNeedleSession({
      runtime,
      weights: { url: "https://example.test/tuned.cact" },
    });
    await session.prepare();

    expect(loads).toEqual([{ url: "https://example.test/tuned.cact" }]);
  });
});

describe("the native bridge", () => {
  test("embedded weights cross the bridge as nothing at all", async () => {
    const { plugin, loads } = fakePlugin();
    const runtime = await createNativeRuntime({ plugin });
    await runtime.load({ embedded: true });

    // Not `{ url: undefined }`: the plugin decides on the absence of both keys,
    // and Capacitor drops undefined values on the way across anyway.
    expect(loads).toEqual([{}]);
  });

  test("a tuned .cact still travels as a URL", async () => {
    const { plugin, loads } = fakePlugin();
    const runtime = await createNativeRuntime({ plugin });
    await runtime.load({ url: "https://example.test/tuned.cact" });

    expect(loads).toEqual([{ url: "https://example.test/tuned.cact" }]);
  });
});
