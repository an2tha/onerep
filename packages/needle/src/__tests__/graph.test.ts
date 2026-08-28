import { describe, expect, test } from "bun:test";
import * as z from "zod";
import { fromAgentTools } from "../agent-tools.ts";
import { createNeedleGraph, summarize } from "../graph.ts";
import { NeedleSession } from "../session.ts";
import { fakeRuntime, turn } from "./fake-runtime.ts";

/**
 * Shaped exactly like the coach's own tools in `convex/ai/provider.ts`: a
 * description, a zod schema, an execute. If that contract ever changes, this is
 * the test that notices.
 */
const coachTools = {
  measure_joint_angle: {
    description: "Angle at a joint, in degrees",
    inputSchema: z.object({
      joint: z.enum(["knee", "hip"]),
      side: z.enum(["left", "right"]).default("left"),
    }),
    execute: (input: { joint: string; side: string }) => ({
      joint: input.joint,
      side: input.side,
      degrees: 92.4,
    }),
  },
  get_capture_quality: {
    description: "Whether the footage is good enough to measure",
    inputSchema: z.object({}),
    execute: () => ({ usable: true }),
  },
};

function needleWith(turns: readonly string[]) {
  const fake = fakeRuntime(turns);
  return {
    fake,
    session: new NeedleSession({
      runtime: fake.runtime,
      weights: { url: "needle2.cact" },
      tools: fromAgentTools(coachTools),
    }),
  };
}

describe("fromAgentTools", () => {
  test("carries the record key across as the tool name", () => {
    expect(fromAgentTools(coachTools).map((tool) => tool.name)).toEqual([
      "measure_joint_angle",
      "get_capture_quality",
    ]);
  });

  test("keeps zod's defaults by parsing before it hands over", async () => {
    const [angle] = fromAgentTools(coachTools, {
      only: ["measure_joint_angle"],
    });
    expect(await angle!.execute!({ joint: "knee" } as never)).toEqual({
      joint: "knee",
      side: "left",
      degrees: 92.4,
    });
  });

  test("emits a grammar-ready schema with the enum intact", () => {
    const [angle] = fromAgentTools(coachTools, {
      only: ["measure_joint_angle"],
    });
    expect(angle!.parameters.properties?.joint).toMatchObject({
      enum: ["knee", "hip"],
    });
  });
});

describe("createNeedleGraph", () => {
  test("loops through tools and back into the model", async () => {
    const { session } = needleWith([
      turn([{ name: "get_capture_quality", arguments: {} }]),
      turn([{ name: "measure_joint_angle", arguments: { joint: "knee" } }]),
      turn([]),
    ]);
    const graph = createNeedleGraph({ session });
    const state = await graph.invoke({ input: "how deep was the squat" });
    expect(summarize(state).stop).toBe("done");
    expect(state.calls.map((call) => call.name)).toEqual([
      "get_capture_quality",
      "measure_joint_angle",
    ]);
    expect(state.steps).toBe(3);
  });

  test("approve() stops the run before anything executes", async () => {
    let ran = false;
    const { session } = needleWith([
      turn([{ name: "measure_joint_angle", arguments: { joint: "hip" } }]),
    ]);
    session.toolbox.register({
      name: "measure_joint_angle",
      description: "x",
      parameters: {},
      execute: () => ((ran = true), {}),
    });
    const graph = createNeedleGraph({ session, approve: () => false });
    const state = await graph.invoke({ input: "measure" });
    expect(state.stop).toBe("declined");
    expect(ran).toBe(false);
    expect(state.calls).toEqual([]);
  });

  test("honours the step ceiling", async () => {
    const call = turn([{ name: "get_capture_quality", arguments: {} }]);
    const { session } = needleWith([call, call, call]);
    const graph = createNeedleGraph({ session, maxSteps: 2 });
    const state = await graph.invoke({ input: "measure" });
    expect(state.steps).toBe(2);
    expect(summarize(state).stop).toBe("max-steps");
  });
});
