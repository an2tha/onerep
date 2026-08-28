import type { NeedleRuntime } from "../types.ts";

/**
 * A runtime that replays scripted turns.
 *
 * The engine itself is 14 MB of quantised weights and a wasm blob; none of the
 * behaviour worth testing here lives in it. What lives here is the loop, the
 * parser and the toolbox, and all three are exercised by handing back the JSON
 * the engine would have written.
 */
export function fakeRuntime(turns: readonly string[]) {
  const calls: { input: string; maxNewTokens: number }[] = [];
  const inits: { system: string | null; toolsJson: string }[] = [];
  let index = 0;
  let resets = 0;
  const runtime: NeedleRuntime = {
    platform: "wasm",
    async load() {},
    async init({ system, toolsJson }) {
      inits.push({ system, toolsJson });
    },
    async complete(input, maxNewTokens) {
      calls.push({ input, maxNewTokens });
      const turn = turns[index];
      index += 1;
      if (turn === undefined) throw new Error("fake runtime ran out of turns");
      return turn;
    },
    async reset() {
      resets += 1;
    },
  };
  return {
    runtime,
    calls,
    inits,
    get resets() {
      return resets;
    },
  };
}

export function turn(
  calls: Array<{ name: string; arguments: Record<string, unknown> }>,
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    type: calls.length === 0 ? "respond" : "call",
    success: true,
    error: null,
    error_code: null,
    function_calls: calls,
    reasoning: "because",
    confidence: 0.9,
    prefill_tps: 4300,
    decode_tps: 850,
    peak_ram_mb: 28.5,
    ...extra,
  });
}
