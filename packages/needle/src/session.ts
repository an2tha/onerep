import { NeedleToolbox } from "./tools.ts";
import { parseTurn } from "./turn.ts";
import type {
  NeedleCall,
  NeedleCallResult,
  NeedleRun,
  NeedleRuntime,
  NeedleTool,
  NeedleTurn,
  NeedleWeights,
} from "./types.ts";

export type NeedleSessionOptions = {
  runtime: NeedleRuntime;
  weights: NeedleWeights;
  tools?: NeedleToolbox | ReadonlyArray<NeedleTool<never, unknown>>;
  /**
   * Environment facts, never instructions. `date: 2026-08-26 Wed 14:30;
   * locale: en-GB; device: phone`. The model resolves "tomorrow at seven"
   * against these and passes the human phrase through verbatim when nothing
   * licenses the resolution; text placed here that reads as an order is simply
   * ignored, so there is no prompt to tune and no prompt to leak.
   */
  system?: string | null;
  /** Where the engine caches tool embeddings. Native only; ignored on wasm. */
  toolIndexPath?: string | null;
  /** Tokens per turn. The default is the engine's own. */
  maxNewTokens?: number;
  /**
   * Below this, `run()` stops and reports rather than executing.
   *
   * The confidence head is calibrated so that the failure mode is escalation,
   * not wrong execution — which only holds if somebody actually picks a
   * threshold. Zero means "act on everything", and is the wrong default for
   * anything that writes.
   */
  minConfidence?: number;
  /**
   * Asked before any destructive tool runs. Return false and the run stops with
   * nothing executed.
   *
   * Omit it and destructive calls simply never execute: `run()` returns
   * `stop: "unconfirmed"` with the calls in `pending`, which is the right
   * default for a model that can decide to delete something on its own. Wire it
   * to a sheet, not to `() => true`.
   */
  confirm?: (
    calls: NeedleCall[],
    turn: NeedleTurn,
  ) => boolean | Promise<boolean>;
};

const DEFAULT_MAX_NEW_TOKENS = 256;
/**
 * The engine's own default for `run`. Eight is generous for a phone: each step
 * is a full prefill of the tool context, and a chain longer than this is nearly
 * always a toolset problem rather than a hard question.
 */
const DEFAULT_MAX_STEPS = 8;

/**
 * One conversation against one engine.
 *
 * Every call funnels through `queue`, and that is not belt-and-braces. The C
 * API is four functions over a process-global engine — `needle_reset` takes no
 * handle and returns nothing — so two overlapping `complete()` calls do not
 * race on a mutex we forgot to take, they interleave inside one KV cache and
 * come back with each other's arguments. Serialising here is the only place it
 * can be done once for all three runtimes.
 */
export class NeedleSession {
  readonly toolbox: NeedleToolbox;
  private readonly runtime: NeedleRuntime;
  private readonly weights: NeedleWeights;
  private readonly toolIndexPath: string | null;
  private readonly maxNewTokens: number;
  readonly minConfidence: number;
  private confirm?: NeedleSessionOptions["confirm"];
  private system: string | null;
  private queue: Promise<unknown> = Promise.resolve();
  private loaded = false;
  private initialisedAt = -1;
  private disposed = false;

  constructor(options: NeedleSessionOptions) {
    this.runtime = options.runtime;
    this.weights = options.weights;
    this.toolbox =
      options.tools instanceof NeedleToolbox
        ? options.tools
        : new NeedleToolbox(options.tools ?? []);
    this.system = options.system ?? null;
    this.toolIndexPath = options.toolIndexPath ?? null;
    this.maxNewTokens = options.maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS;
    this.minConfidence = options.minConfidence ?? 0;
    this.confirm = options.confirm;
  }

  get platform() {
    return this.runtime.platform;
  }

  /**
   * Pay the load cost now rather than inside the first user-facing call.
   *
   * Optional — everything else calls it — but on a cold cache this is a 14 MB
   * download and a wasm instantiation, and the difference between doing that at
   * screen mount and doing it after somebody has typed is the difference
   * between a spinner and a bug report.
   */
  async prepare() {
    await this.serialize(() => this.ensureReady());
  }

  /**
   * Attach the confirmation handler after construction.
   *
   * The session is usually a module-level singleton created before any screen
   * exists, while the sheet that asks "delete this preset?" belongs to a
   * screen. Without this the handler would have to be decided by whichever
   * component happened to mount first, which is a bad way to decide who is
   * allowed to delete things.
   */
  setConfirm(confirm: NeedleSessionOptions["confirm"]) {
    this.confirm = confirm;
  }

  /** Replace the system facts. Takes effect on the next turn. */
  setSystem(system: string | null) {
    if (system === this.system) return;
    this.system = system;
    this.initialisedAt = -1;
  }

  /**
   * One turn, nothing executed.
   *
   * Pass a query to ask; pass a JSON-serialised tool result to continue from
   * one. They are the same call because they are the same thing to the model —
   * text in, calls out — and pretending otherwise would mean two methods that
   * differ only in what the caller stringified.
   */
  async complete(input: string, options?: { maxNewTokens?: number }) {
    return await this.serialize(async () => {
      await this.ensureReady();
      const raw = await this.runtime.complete(
        input,
        options?.maxNewTokens ?? this.maxNewTokens,
      );
      return parseTurn(raw);
    });
  }

  /**
   * The full loop: the model picks calls, we run the registered handlers, the
   * results go back in, and it continues from them.
   *
   * The answer is the tool results. There is no closing paragraph to wait for
   * and none is generated, so a run that reaches the step ceiling is not a
   * failure — the calls it did make are complete and already executed, and
   * `stop` says which of the three ways it ended.
   */
  async run(
    query: string,
    options?: {
      maxSteps?: number;
      maxNewTokens?: number;
      minConfidence?: number;
    },
  ): Promise<NeedleRun> {
    const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
    const floor = options?.minConfidence ?? this.minConfidence;
    const calls: NeedleCallResult[] = [];
    let input = query;
    let turn: NeedleTurn | undefined;
    for (let step = 1; step <= maxSteps; step += 1) {
      turn = await this.complete(input, {
        maxNewTokens: options?.maxNewTokens,
      });
      if (!turn.success) {
        return { calls, turn, steps: step, stop: "done" };
      }
      // The empty call is the whole contract for "no declared tool serves
      // this". It arrives as a normal, successful turn, so it has to be read
      // here rather than treated as an error anywhere below.
      if (turn.calls.length === 0) {
        return {
          calls,
          turn,
          steps: step,
          stop: step === 1 ? "refused" : "done",
        };
      }
      if (turn.confidence !== null && turn.confidence < floor) {
        // Deliberately before execution. A low-confidence call that has already
        // written to the diary is not something a caller can escalate out of.
        return { calls, turn, steps: step, stop: "refused" };
      }
      // Asked once for the whole turn, not once per call: the user is agreeing
      // to an action ("delete the push preset"), and splitting that into three
      // dialogs teaches them to tap yes without reading.
      let confirmed = false;
      if (this.toolbox.anyDestructive(turn.calls)) {
        confirmed = (await this.confirm?.(turn.calls, turn)) ?? false;
        if (!confirmed) {
          return {
            calls,
            turn,
            steps: step,
            stop: "unconfirmed",
            pending: turn.calls,
          };
        }
      }
      const results: unknown[] = [];
      for (const call of turn.calls) {
        try {
          const output = await this.toolbox.execute(call, { confirmed });
          calls.push({ ...call, output });
          results.push(output);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          calls.push({ ...call, error: message });
          results.push({ error: message });
        }
      }
      if (turn.type === "respond") {
        return { calls, turn, steps: step, stop: "done" };
      }
      input = JSON.stringify(results.length === 1 ? results[0] : results);
    }
    return {
      calls,
      turn: turn as NeedleTurn,
      steps: maxSteps,
      stop: "max-steps",
    };
  }

  /**
   * Extract one record from free text.
   *
   * Not a mode — it is tool calling with a single declared tool, which is why
   * it takes a temporary toolbox rather than a flag. With one tool the grammar
   * admits exactly one call of that name, so the fields come back conforming
   * rather than needing to be validated into conforming.
   */
  async extract<T = Record<string, unknown>>(
    text: string,
    record: NeedleTool<never, unknown>,
    options?: { maxNewTokens?: number },
  ): Promise<T | null> {
    const previous = this.toolbox.list();
    this.toolbox.clear().register(record);
    try {
      const turn = await this.complete(text, options);
      const call = turn.calls.find((entry) => entry.name === record.name);
      return call ? (call.arguments as T) : null;
    } finally {
      this.toolbox.clear();
      this.toolbox.register(...previous);
    }
  }

  /** Rewind the conversation, keep the tools loaded. */
  async reset() {
    await this.serialize(async () => {
      if (this.initialisedAt < 0) return;
      await this.runtime.reset();
    });
  }

  async dispose() {
    await this.serialize(async () => {
      this.disposed = true;
      this.loaded = false;
      this.initialisedAt = -1;
      await this.runtime.dispose?.();
    });
  }

  private async ensureReady() {
    if (this.disposed) throw new Error("needle session has been disposed");
    if (!this.loaded) {
      await this.runtime.load(this.weights);
      this.loaded = true;
    }
    // Every registration bumps the toolbox version, and a stale grammar is a
    // silent failure — the model keeps calling the tool that used to be there.
    if (this.initialisedAt !== this.toolbox.version) {
      await this.runtime.init({
        system: this.system,
        toolsJson: this.toolbox.toJSON(),
        toolIndexPath: this.toolIndexPath,
      });
      this.initialisedAt = this.toolbox.version;
    }
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    // `.then(work, work)` rather than a catch: a failed predecessor must not
    // poison the queue, and its rejection is already owned by its own caller.
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
