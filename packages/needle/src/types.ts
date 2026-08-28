/**
 * The shapes that cross the boundary between our code and Needle 2.
 *
 * Needle is not a chat model wearing a function-calling hat. It has no free-text
 * mode at all: the context declares what may be called, and every turn comes
 * back as JSON — either a list of calls or an empty list meaning "nothing I was
 * given can serve this". That constraint is the whole reason it fits in 14 MB
 * and answers in a few hundred milliseconds on a phone, and it is why this
 * module has no `message` type anywhere in it.
 */

/**
 * A JSON Schema object describing one tool's arguments.
 *
 * Deliberately loose. Needle compiles this into the decode grammar, so the
 * subset it honours (`enum`, `const`, ranges, `pattern`, `minItems`, …) is
 * documented by the engine rather than enforced by our types; narrowing it here
 * would only mean rejecting schemas the engine would have accepted.
 */
export type JsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

/** A tool as the engine wants to see it: name, prose, and an argument schema. */
export type NeedleToolSchema = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

/**
 * A tool as you register it.
 *
 * `execute` is optional because half the useful things Needle does are not
 * actions. Declare a record with no handler and you have an extractor: the
 * grammar admits exactly one call of that name, so the arguments coming back
 * are the extracted fields and conformance is a property of decoding rather
 * than a thing you hope for and validate afterwards.
 */
export type NeedleTool<Input = Record<string, unknown>, Output = unknown> = {
  name: string;
  description: string;
  parameters: JsonSchema;
  /**
   * Whether running this destroys something the user cannot get back.
   *
   * Not advisory. A tool marked destructive cannot be executed by the loop, the
   * graph or `toolbox.execute` without an explicit confirmation, so forgetting
   * to wire a confirm handler fails closed — the run stops and reports what it
   * wanted to do rather than doing it. Deleting a preset qualifies; logging a
   * food does not, because the diary has an undo and the preset does not.
   */
  destructive?: boolean;
  execute?: (input: Input) => Output | Promise<Output>;
};

/** One call the model asked for, before anything has been run. */
export type NeedleCall = {
  name: string;
  arguments: Record<string, unknown>;
};

/** A call plus whatever happened when we ran it. */
export type NeedleCallResult = NeedleCall & {
  output?: unknown;
  error?: string;
};

/**
 * One decoded turn.
 *
 * Mirrors the engine's JSON one field for one field, including the throughput
 * counters — they cost nothing to carry and they are the only honest way to
 * answer "is this device fast enough", which varies by two orders of magnitude
 * across the phones this ships to.
 */
export type NeedleTurn = {
  type: "call" | "respond";
  success: boolean;
  error: string | null;
  errorCode: string | null;
  calls: NeedleCall[];
  reasoning: string | null;
  /**
   * Minimum of a calibrated head and the decode probability of the call tokens,
   * or null when tuned weights are loaded — fine-tuning does not update the
   * head, so the number would be a lie rather than a low score.
   */
  confidence: number | null;
  prefillTps: number | null;
  decodeTps: number | null;
  peakRamMb: number | null;
};

/** What `run()` gives back once the loop has stopped. */
export type NeedleRun = {
  /** Every call made across every step, in order, with its result. */
  calls: NeedleCallResult[];
  /** The last turn the engine produced, for its confidence and counters. */
  turn: NeedleTurn;
  steps: number;
  /**
   * Why the loop ended. `done` is the engine signalling completion; `refused`
   * is the empty call, meaning no declared tool fits; `max-steps` is our
   * ceiling, and the calls gathered so far are still yours to use.
   *
   * `unconfirmed` is a destructive call nobody approved. Nothing ran; the calls
   * are in `pending`, and the run is resumed by asking the user and calling
   * `confirm()` with the answer.
   */
  stop: "done" | "refused" | "max-steps" | "unconfirmed";
  /** Destructive calls waiting on an answer. Empty unless `stop` is that. */
  pending?: NeedleCall[];
};

/**
 * Where the weights come from — and on native, the answer is "they are already
 * here".
 *
 * `libneedle.a` is two objects: 421 KB of NEON kernels, and a 13.7 MB blob that
 * is `needle2.cact` embedded verbatim as `needle_weights`. The engine object
 * references that symbol as undefined, so it reads the baked-in weights
 * directly; `needle_load` exists to *override* them with tuned ones. Downloading
 * a copy of what is already linked into the binary would be 13.7 MB of nothing.
 *
 * The wasm build is the opposite case. `needle.wasm` is 333 KB — kernels only,
 * no weights — so there the `.cact` is a genuine, unavoidable fetch.
 */
export type NeedleWeights =
  { embedded: true } | { url: string } | { bytes: Uint8Array };

/**
 * The one thing every backend has to implement.
 *
 * Note what is missing: threads, batching, streaming, cancellation. The C API
 * behind all three runtimes is four functions over a single process-global
 * engine, so a runtime that pretended otherwise would be pretending. Serialising
 * access is the session's job, one layer up.
 */
export type NeedleRuntime = {
  readonly platform: "wasm" | "ios" | "android";
  /** Bind weights. Must happen before `init`, and once per process. */
  load(weights: NeedleWeights): Promise<void>;
  /** Rebuild the context: system facts, tool schemas, grammar. */
  init(options: {
    system: string | null;
    toolsJson: string;
    toolIndexPath: string | null;
  }): Promise<void>;
  /** One turn. Returns the raw JSON string the engine wrote. */
  complete(input: string, maxNewTokens: number): Promise<string>;
  /** Rewind the conversation, keep the tools loaded. */
  reset(): Promise<void>;
  dispose?(): Promise<void>;
};
