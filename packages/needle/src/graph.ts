import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { NeedleSession } from "./session.ts";
import type { NeedleCallResult, NeedleTurn } from "./types.ts";

/**
 * The same loop `session.run()` runs, as a LangGraph.
 *
 * `run()` is the right thing to call ninety per cent of the time and this is
 * the other ten: a graph can be checkpointed, interrupted before the node that
 * writes, streamed step by step into a UI, and composed into a larger graph
 * alongside the cloud agent in `convex/ai/provider.ts`, which is already built
 * this way. Nothing is duplicated that matters — both paths go through
 * `session.complete()` and `toolbox.execute()`.
 *
 * The shape is two nodes because Needle's contract is two moves. There is no
 * "should I answer in prose" edge to draw: the model emits calls or it emits
 * the empty call, and the empty call ends the run.
 */

export type NeedleGraphOptions = {
  session: NeedleSession;
  maxSteps?: number;
  maxNewTokens?: number;
  /**
   * Called before anything executes, with the calls the model wants. Return
   * false to stop the run — this is where a confirmation sheet goes, and the
   * reason the graph exists at all for anything that spends money or writes.
   */
  approve?: (
    calls: NeedleTurn["calls"],
    turn: NeedleTurn,
  ) => boolean | Promise<boolean>;
};

const DEFAULT_MAX_STEPS = 8;

const NeedleState = Annotation.Root({
  /** What goes into the next turn: the query, then each tool result in turn. */
  input: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  calls: Annotation<NeedleCallResult[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  turn: Annotation<NeedleTurn | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  steps: Annotation<number>({
    reducer: (left, right) => left + right,
    default: () => 0,
  }),
  stop: Annotation<"done" | "refused" | "max-steps" | "declined" | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
});

export type NeedleGraphState = typeof NeedleState.State;

export function createNeedleGraph(options: NeedleGraphOptions) {
  const { session } = options;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  return new StateGraph(NeedleState)
    .addNode("model", async (state) => {
      const turn = await session.complete(state.input, {
        maxNewTokens: options.maxNewTokens,
      });
      return { turn, steps: 1 };
    })
    .addNode("tools", async (state) => {
      const turn = state.turn;
      if (!turn) throw new Error("needle graph reached tools with no turn");
      // A destructive call with no `approve` wired is declined, not run. The
      // graph and `session.run()` fail closed the same way on purpose — the
      // whole point of marking a tool destructive is that forgetting the
      // handler cannot be the thing that deletes somebody's preset.
      const needsApproval = session.toolbox.anyDestructive(turn.calls);
      const approved = options.approve
        ? await options.approve(turn.calls, turn)
        : !needsApproval;
      if (!approved) return { stop: "declined" as const };

      const calls: NeedleCallResult[] = [];
      const results: unknown[] = [];
      for (const call of turn.calls) {
        try {
          const output = await session.toolbox.execute(call, {
            confirmed: approved,
          });
          calls.push({ ...call, output });
          results.push(output);
        } catch (error) {
          // Fed back rather than thrown. A tool that failed is information the
          // model can act on — it is how "that contact does not exist" becomes
          // a search instead of a crashed screen.
          const message =
            error instanceof Error ? error.message : String(error);
          calls.push({ ...call, error: message });
          results.push({ error: message });
        }
      }
      return {
        calls,
        input: JSON.stringify(results.length === 1 ? results[0] : results),
      };
    })
    .addEdge(START, "model")
    .addConditionalEdges("model", (state) => {
      const turn = state.turn;
      if (!turn || !turn.success) return END;
      if (turn.calls.length === 0) return END;
      if (turn.confidence !== null && turn.confidence < session.minConfidence) {
        return END;
      }
      return "tools";
    })
    .addConditionalEdges("tools", (state) => {
      if (state.stop === "declined") return END;
      // `respond` with calls attached is the last useful turn: the results were
      // the answer, and asking again only costs a prefill to be told so.
      if (state.turn?.type === "respond") return END;
      return state.steps >= maxSteps ? END : "model";
    })
    .compile();
}

/** `run()`'s answer, from a graph invocation. */
export function summarize(state: NeedleGraphState) {
  const turn = state.turn;
  const stop =
    state.stop ??
    (state.steps >= 1 &&
    turn &&
    turn.calls.length === 0 &&
    state.calls.length === 0
      ? ("refused" as const)
      : state.turn?.type === "respond" || turn?.calls.length === 0
        ? ("done" as const)
        : ("max-steps" as const));
  return { calls: state.calls, turn, steps: state.steps, stop };
}
