// Namespace import, not `import { z }`: zod v4 exposes `z` as a
// self-referential `export * as z`, which Bun does not materialise, so the
// named form is undefined at runtime under `bun` — as in CI, and as in every
// test in this package.
import * as z from "zod";
import type { JsonSchema, NeedleTool, NeedleToolSchema } from "./types.ts";

/**
 * Register a tool from a zod schema instead of hand-written JSON Schema.
 *
 * The conversion is `z.toJSONSchema`, the same call `convex/ai/provider.ts`
 * makes on its way to OpenAI, which is the point: one schema, both models, no
 * second description drifting away from the first.
 */
export function defineTool<Schema extends z.ZodType, Output>(definition: {
  name: string;
  description: string;
  input: Schema;
  execute?: (input: z.output<Schema>) => Output | Promise<Output>;
}): NeedleTool<z.output<Schema>, Output> {
  return {
    name: definition.name,
    description: definition.description,
    parameters: toParameters(definition.input),
    execute: definition.execute,
  };
}

/**
 * zod's JSON Schema output carries `$schema` and, for anything reused, a
 * `$defs` block full of `$ref`s. Needle compiles the schema into a decode
 * grammar and has no resolver, so a `$ref` is not a slow path — it is a tool
 * whose arguments cannot be expressed. Inlining happens here, once, where the
 * failure would otherwise surface as a grammar the model quietly cannot satisfy.
 */
export function toParameters(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, {
    io: "input",
    target: "draft-7",
  }) as Record<string, unknown>;
  const defs = (raw.$defs ?? raw.definitions) as
    Record<string, unknown> | undefined;
  const inlined = inline(raw, defs, new Set()) as JsonSchema;
  delete inlined.$schema;
  delete inlined.$defs;
  delete inlined.definitions;
  return inlined;
}

/**
 * A `$ref` cycle cannot be inlined at all — a recursive tool argument has no
 * finite grammar — so the cycle guard leaves the ref in place rather than
 * hanging. The engine will reject it, loudly, at `init`, which is a better
 * place to find out than a stack overflow in a build step.
 */
function inline(
  node: unknown,
  defs: Record<string, unknown> | undefined,
  seen: ReadonlySet<string>,
): unknown {
  if (Array.isArray(node)) return node.map((item) => inline(item, defs, seen));
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  const ref = record.$ref;
  if (typeof ref === "string") {
    const key = ref.replace(/^#\/(?:\$defs|definitions)\//, "");
    const target = defs?.[key];
    if (target !== undefined && !seen.has(key)) {
      const merged = inline(target, defs, new Set([...seen, key])) as Record<
        string,
        unknown
      >;
      const { $ref: _dropped, ...siblings } = record;
      return { ...merged, ...(inline(siblings, defs, seen) as object) };
    }
    return record;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "$defs" || key === "definitions" || key === "$schema") continue;
    out[key] = inline(value, defs, seen);
  }
  return out;
}

/**
 * A mutable set of tools, and the only thing that decides what the engine may
 * call.
 *
 * Mutable on purpose. A toolbox is per-screen — the food logger declares food
 * tools, the workout screen declares workout tools — and re-declaring means one
 * `init`, not a new engine. Above five tools the engine switches to retrieval
 * and puts only the five best-scoring schemas in context, so a toolbox is a
 * catalogue rather than a shortlist and it is fine for it to be long.
 */
export class NeedleToolbox {
  private readonly tools = new Map<string, NeedleTool<never, unknown>>();
  private revision = 0;

  constructor(tools: ReadonlyArray<NeedleTool<never, unknown>> = []) {
    for (const tool of tools) this.register(tool);
  }

  register(...tools: ReadonlyArray<NeedleTool<never, unknown>>): this {
    for (const tool of tools) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tool.name)) {
        // The name goes into the grammar as a literal. Anything the model
        // cannot spell back exactly is a tool that can never be selected.
        throw new Error(
          `needle tool name must be a bare identifier, got ${JSON.stringify(tool.name)}`,
        );
      }
      this.tools.set(tool.name, tool);
    }
    this.revision += 1;
    return this;
  }

  unregister(...names: readonly string[]): this {
    let removed = false;
    for (const name of names) removed = this.tools.delete(name) || removed;
    if (removed) this.revision += 1;
    return this;
  }

  clear(): this {
    if (this.tools.size > 0) {
      this.tools.clear();
      this.revision += 1;
    }
    return this;
  }

  has(name: string) {
    return this.tools.has(name);
  }

  get size() {
    return this.tools.size;
  }

  /** Bumped on every mutation; the session re-inits when it changes. */
  get version() {
    return this.revision;
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /** The registered tools themselves, handlers included. */
  list(): NeedleTool<never, unknown>[] {
    return [...this.tools.values()];
  }

  schemas(): NeedleToolSchema[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /** Exactly what goes over the FFI boundary as `tools_json`. */
  toJSON(): string {
    return JSON.stringify(this.schemas());
  }

  /** Whether any of these calls needs a human to say yes first. */
  anyDestructive(calls: ReadonlyArray<{ name: string }>) {
    return calls.some((call) => this.tools.get(call.name)?.destructive === true);
  }

  /**
   * Run one call.
   *
   * A tool with no handler is an extraction record, not a mistake: the
   * arguments were the answer, so they are the result. An unknown name is a
   * mistake, but a recoverable one — the grammar should have made it
   * impossible, and if it happens the loop is better off feeding the error back
   * than throwing out the calls that did work.
   *
   * The destructive gate lives here rather than only in the loop so that it
   * cannot be walked around. `toolbox.execute` is public, a UI will reach for it
   * to re-run a call the user just approved, and a check that only the loop
   * performs is a check one caller forgets.
   */
  async execute(
    call: {
      name: string;
      arguments: Record<string, unknown>;
    },
    options: { confirmed?: boolean } = {},
  ): Promise<unknown> {
    const tool = this.tools.get(call.name);
    if (!tool) throw new Error(`needle called unknown tool ${call.name}`);
    if (tool.destructive && !options.confirmed) {
      throw new Error(
        `${call.name} is destructive and was not confirmed — ask first, then pass { confirmed: true }`,
      );
    }
    if (!tool.execute) return call.arguments;
    return await tool.execute(call.arguments as never);
  }
}
