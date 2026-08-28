import { describe, expect, test } from "bun:test";
import * as z from "zod";
import { NeedleSession } from "../session.ts";
import { NeedleToolbox, defineTool, toParameters } from "../tools.ts";
import { parseTurn } from "../turn.ts";
import { fakeRuntime, turn } from "./fake-runtime.ts";

const setLights = defineTool({
  name: "set_lights",
  description: "Turn a room's lights on or off",
  input: z.object({ room: z.string(), on: z.boolean() }),
  execute: (input) => ({ ok: true, room: input.room }),
});

function session(
  turns: readonly string[],
  options: Partial<ConstructorParameters<typeof NeedleSession>[0]> = {},
) {
  const fake = fakeRuntime(turns);
  return {
    fake,
    session: new NeedleSession({
      runtime: fake.runtime,
      weights: { url: "needle2.cact" },
      tools: [setLights],
      ...options,
    }),
  };
}

describe("parseTurn", () => {
  test("reads the engine's snake_case into our shape", () => {
    const parsed = parseTurn(
      turn([{ name: "set_lights", arguments: { room: "kitchen" } }]),
    );
    expect(parsed.type).toBe("call");
    expect(parsed.calls).toEqual([
      { name: "set_lights", arguments: { room: "kitchen" } },
    ]);
    expect(parsed.confidence).toBe(0.9);
    expect(parsed.decodeTps).toBe(850);
  });

  test("a truncated buffer is a failed turn, not an exception", () => {
    const parsed = parseTurn('{"type":"call","function_call');
    expect(parsed.success).toBe(false);
    expect(parsed.errorCode).toBe("malformed");
    expect(parsed.calls).toEqual([]);
  });

  test("drops call entries that could never be executed", () => {
    const parsed = parseTurn(
      JSON.stringify({
        function_calls: [{ arguments: {} }, { name: "ok", arguments: 7 }],
      }),
    );
    expect(parsed.calls).toEqual([{ name: "ok", arguments: {} }]);
  });
});

describe("toolbox", () => {
  test("rejects names the grammar could not spell back", () => {
    expect(() =>
      new NeedleToolbox().register({
        name: "set lights",
        description: "x",
        parameters: {},
      }),
    ).toThrow(/bare identifier/);
  });

  test("a tool with no handler extracts rather than executes", async () => {
    const box = new NeedleToolbox([
      {
        name: "receipt",
        description: "a receipt",
        parameters: { type: "object" },
      },
    ]);
    expect(
      await box.execute({ name: "receipt", arguments: { total: 7.75 } }),
    ).toEqual({
      total: 7.75,
    });
  });

  test("inlines the $refs zod emits for reused schemas", () => {
    const leg = z.object({ from: z.string(), to: z.string() });
    const parameters = toParameters(z.object({ out: leg, back: leg }));
    expect(JSON.stringify(parameters)).not.toContain("$ref");
    expect(JSON.stringify(parameters)).not.toContain("$defs");
    expect(
      (parameters.properties?.back as { properties: object }).properties,
    ).toHaveProperty("from");
  });
});

describe("run", () => {
  test("executes calls and feeds the result back", async () => {
    const { session: needle, fake } = session([
      turn([{ name: "set_lights", arguments: { room: "kitchen", on: true } }]),
      turn([]),
    ]);
    const result = await needle.run("lights on in the kitchen");
    expect(result.stop).toBe("done");
    expect(result.calls).toEqual([
      {
        name: "set_lights",
        arguments: { room: "kitchen", on: true },
        output: { ok: true, room: "kitchen" },
      },
    ]);
    expect(fake.calls[1]?.input).toBe('{"ok":true,"room":"kitchen"}');
  });

  test("the empty call on the first turn is a refusal", async () => {
    const { session: needle } = session([turn([])]);
    const result = await needle.run("what is the capital of Peru");
    expect(result.stop).toBe("refused");
    expect(result.calls).toEqual([]);
  });

  test("stops below the confidence floor without executing", async () => {
    let ran = false;
    const { session: needle } = session(
      [
        turn(
          [{ name: "set_lights", arguments: { room: "kitchen", on: true } }],
          { confidence: 0.2 },
        ),
      ],
      {
        minConfidence: 0.6,
        tools: [{ ...setLights, execute: () => ((ran = true), {}) }],
      },
    );
    const result = await needle.run("maybe the lights");
    expect(result.stop).toBe("refused");
    expect(ran).toBe(false);
  });

  test("a throwing tool goes back to the model instead of out to the caller", async () => {
    const { session: needle, fake } = session(
      [
        turn([{ name: "set_lights", arguments: { room: "attic", on: true } }]),
        turn([]),
      ],
      {
        tools: [
          {
            ...setLights,
            execute: () => {
              throw new Error("no such room");
            },
          },
        ],
      },
    );
    const result = await needle.run("attic lights");
    expect(result.calls[0]?.error).toBe("no such room");
    expect(fake.calls[1]?.input).toBe('{"error":"no such room"}');
  });

  test("reports the ceiling instead of dropping the work done under it", async () => {
    const call = turn([
      { name: "set_lights", arguments: { room: "kitchen", on: true } },
    ]);
    const { session: needle } = session([call, call, call]);
    const result = await needle.run("lights", { maxSteps: 3 });
    expect(result.stop).toBe("max-steps");
    expect(result.calls).toHaveLength(3);
  });
});

describe("engine lifecycle", () => {
  test("re-inits only when the toolbox changes", async () => {
    const { session: needle, fake } = session([turn([]), turn([]), turn([])]);
    await needle.complete("one");
    await needle.complete("two");
    expect(fake.inits).toHaveLength(1);
    needle.toolbox.register({
      name: "other",
      description: "x",
      parameters: {},
    });
    await needle.complete("three");
    expect(fake.inits).toHaveLength(2);
    expect(JSON.parse(fake.inits[1]!.toolsJson)).toHaveLength(2);
  });

  test("serialises overlapping turns through one engine", async () => {
    const { session: needle, fake } = session([turn([]), turn([]), turn([])]);
    await Promise.all([
      needle.complete("a"),
      needle.complete("b"),
      needle.complete("c"),
    ]);
    expect(fake.calls.map((entry) => entry.input)).toEqual(["a", "b", "c"]);
  });

  test("a failed turn does not poison the queue", async () => {
    const { session: needle } = session(["not json", turn([])]);
    await needle.complete("first");
    expect((await needle.complete("second")).success).toBe(true);
  });

  test("extract declares one record and restores the toolbox afterwards", async () => {
    const { session: needle, fake } = session([
      turn([
        { name: "receipt", arguments: { merchant: "GreenMart", total: 7.75 } },
      ]),
    ]);
    const record = {
      name: "receipt",
      description: "a purchase receipt",
      parameters: { type: "object" },
    };
    const extracted = await needle.extract("GreenMart total 7.75", record);
    expect(extracted).toEqual({ merchant: "GreenMart", total: 7.75 });
    expect(JSON.parse(fake.inits[0]!.toolsJson)).toHaveLength(1);
    expect(needle.toolbox.names()).toEqual(["set_lights"]);
    expect(
      await needle.toolbox.execute({
        name: "set_lights",
        arguments: { room: "x" },
      }),
    ).toEqual({ ok: true, room: "x" });
  });
});
