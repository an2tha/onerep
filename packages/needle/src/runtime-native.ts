import type { NeedleRuntime, NeedleWeights } from "./types.ts";

/**
 * The Capacitor runtime, in front of `NeedlePlugin.swift` and `NeedlePlugin.kt`.
 *
 * Both of those wrap the same four C functions the wasm build exports, so this
 * file is a bridge and nothing else: no fallback, no shimming, no second
 * opinion about what a turn looks like. The one thing it does decide is that
 * the default here is embedded weights — see `load`.
 */

export type NeedlePluginApi = {
  isAvailable(): Promise<{ available: boolean; platform: string }>;
  /**
   * With neither `url` nor `data`, the engine keeps the weights it was linked
   * with and nothing is transferred. `url` and `data` are the override path,
   * for tuned `.cact` files.
   */
  load(options: { url?: string; data?: string }): Promise<{
    bytes: number;
    source: "embedded" | "url" | "data";
  }>;
  init(options: {
    system?: string;
    toolsJson: string;
    toolIndexPath?: string;
  }): Promise<{ tools: number }>;
  complete(options: {
    input: string;
    maxNewTokens: number;
  }): Promise<{ json: string }>;
  reset(): Promise<void>;
};

export type NativeRuntimeOptions = {
  /**
   * Overrides the registered plugin. Only tests want this; the app should let
   * the bridge answer, so that a build where the plugin failed to register
   * fails here rather than three screens later.
   */
  plugin?: NeedlePluginApi;
};

export async function createNativeRuntime(
  options: NativeRuntimeOptions = {},
): Promise<NeedleRuntime> {
  const { plugin, platform } = options.plugin
    ? // An injected plugin is asked which platform it is, rather than Capacitor,
      // which would answer "web" in a test process and reject a plugin that is
      // sitting right there.
      { plugin: options.plugin, platform: await platformOf(options.plugin) }
    : await bridge();

  return {
    platform,

    /**
     * Normally a no-op, and that is the point.
     *
     * `libneedle.a` already contains `needle2.cact` verbatim as `needle_weights`,
     * and the engine object references that symbol directly, so the weights the
     * app ships with are the weights it runs. The bridge carries nothing.
     *
     * The two override paths are for tuned `.cact` files. `url` beats `bytes`
     * by a distance: 13.7 MB across the bridge means base64, an 18 MB string
     * marshalled through JSON, on a phone. Native fetches and caches it itself.
     */
    async load(weights: NeedleWeights) {
      if ("embedded" in weights) {
        await plugin.load({});
        return;
      }
      if ("url" in weights) {
        await plugin.load({ url: weights.url });
        return;
      }
      await plugin.load({ data: base64(weights.bytes) });
    },

    async init({ system, toolsJson, toolIndexPath }) {
      await plugin.init({
        ...(system === null ? {} : { system }),
        toolsJson,
        ...(toolIndexPath === null ? {} : { toolIndexPath }),
      });
    },

    async complete(input: string, maxNewTokens: number) {
      const { json } = await plugin.complete({ input, maxNewTokens });
      return json;
    },

    async reset() {
      await plugin.reset();
    },
  };
}

type NativePlatform = "ios" | "android";

/** Resolve the real plugin through Capacitor, and refuse anywhere it is not. */
async function bridge(): Promise<{
  plugin: NeedlePluginApi;
  platform: NativePlatform;
}> {
  // Dynamic, so that importing this package on the server — or in a test — does
  // not drag in a Capacitor bundle that has nothing to do there.
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  const platform = Capacitor.getPlatform();
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`needle has no native runtime on ${platform}`);
  }
  if (!Capacitor.isPluginAvailable("Needle")) {
    throw new Error(
      "needle: the Needle plugin is missing from this build — the web asset is newer than the shell",
    );
  }
  return { plugin: registerPlugin<NeedlePluginApi>("Needle"), platform };
}

async function platformOf(plugin: NeedlePluginApi): Promise<NativePlatform> {
  const { platform } = await plugin.isAvailable();
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`needle has no native runtime on ${platform}`);
  }
  return platform;
}

/** Chunked, because `String.fromCharCode(...bytes)` blows the stack past ~64k. */
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}
