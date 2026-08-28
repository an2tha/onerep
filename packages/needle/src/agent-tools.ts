import * as z from "zod";
import { toParameters } from "./tools.ts";
import type { NeedleTool } from "./types.ts";

/**
 * Reuse the tools the cloud coach already has.
 *
 * `convex/ai/provider.ts` defines `AgentTool` — a description, a zod schema and
 * an `execute` — and everything the coach can do is written against it:
 * `buildFormCoachTools(capture)` alone is thirteen measurements over a pose
 * capture. Those are the same measurements a local model wants, and rewriting
 * them here would mean two definitions of "range of motion" drifting apart in
 * two languages of prose.
 *
 * The type is declared structurally instead of imported. A package under
 * `packages/` that imports from `convex/` inherits the Convex build, its
 * generated API and its runtime, none of which belong in a bundle that has to
 * run inside a WebView — and the shape is three fields.
 */
export type AgentToolLike = {
  description: string;
  inputSchema: z.ZodType;
  execute: (input: never) => unknown | Promise<unknown>;
};

export type AgentToolSetLike = Record<string, AgentToolLike>;

/**
 * Convert a whole `ToolSet` into Needle tools.
 *
 * The record key becomes the tool name, which is also how the OpenAI path names
 * them, so a tool called on-device and the same tool called in the cloud show up
 * under one name in whatever we end up logging.
 */
export function fromAgentTools(
  tools: AgentToolSetLike,
  options: { only?: readonly string[]; prefix?: string } = {},
): NeedleTool<never, unknown>[] {
  const wanted = options.only;
  return Object.entries(tools)
    .filter(([name]) => !wanted || wanted.includes(name))
    .map(([name, definition]) =>
      fromAgentTool(`${options.prefix ?? ""}${name}`, definition),
    );
}

export function fromAgentTool(
  name: string,
  definition: AgentToolLike,
): NeedleTool<never, unknown> {
  return {
    name,
    description: definition.description,
    parameters: toParameters(definition.inputSchema),
    /**
     * Parsed before execution, exactly as the cloud path does it.
     *
     * The grammar already guarantees the JSON matches the schema's shape, but
     * not its coercions and refinements — a `z.coerce.number()` or a
     * `.transform()` is invisible to the grammar, and the handler on the other
     * side was written expecting the parsed value.
     */
    execute: (input) =>
      definition.execute(definition.inputSchema.parse(input) as never),
  };
}
