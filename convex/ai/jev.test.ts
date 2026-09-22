import { describe, expect, test } from "bun:test";
import { prepareWithJev } from "./jev";
import type { CoachPreparation } from "../../packages/models/src/coachPreparation";

const candidate: CoachPreparation = {
  id: "nutrition_targets",
  title: "Your nutrition targets",
  detail: "Saved daily targets",
  rows: [{ label: "Daily protein target", value: "130 g" }],
};
const request = {
  message: "Help me plan meals",
  history: [],
  coachMode: "chat",
  hasAttachment: false,
  candidates: [candidate],
};
const config = { apiKey: "test-key", processorApproved: true };
const answer = (choice: string) =>
  Response.json({ answers: { preparation: { type: "choice", choice } } });
const fetcher = (
  fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) => fn as typeof fetch;

describe("bounded Jev preparation", () => {
  test("makes one typed evaluation and returns only the supplied candidate", async () => {
    let calls = 0;
    const result = await prepareWithJev(request, {
      ...config,
      fetch: fetcher(async (url, init) => {
        calls++;
        expect(url).toBe("https://api.typesafe.ai/v1/systemone");
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe("jev-latest");
        expect(body.questions.preparation.instructions).toContain(
          "hand off immediately",
        );
        expect(body.questions.preparation.criteria).toHaveProperty(
          candidate.id,
        );
        expect(body.state.message).toBe(request.message);
        expect(JSON.stringify(body)).not.toContain("130 g");
        return answer(candidate.id);
      }),
    });
    expect(calls).toBe(1);
    expect(result).toMatchObject({
      state: "handoff",
      reason: "prepared",
      preparation: candidate,
    });
  });
  for (const choice of [
    "needs_reasoning",
    "uncertain",
    "no_matching_ui",
  ] as const) {
    test(`${choice} exits immediately with no speculative UI`, async () => {
      const result = await prepareWithJev(request, {
        ...config,
        fetch: fetcher(async () => answer(choice)),
      });
      expect(result).toMatchObject({
        state: "handoff",
        reason: choice,
        preparation: null,
      });
    });
  }
  test("evaluates even when no UI candidate is available", async () => {
    let calls = 0;
    const result = await prepareWithJev(
      { ...request, candidates: [] },
      {
        ...config,
        fetch: fetcher(async () => {
          calls++;
          return answer("needs_reasoning");
        }),
      },
    );
    expect(calls).toBe(1);
    expect(result.reason).toBe("needs_reasoning");
  });
  test("does not retry rate limits, invalid answers, or network failures", async () => {
    for (const response of [
      new Response(null, { status: 429 }),
      answer("invented_component"),
      Response.json(null),
      new Response("invalid JSON"),
    ]) {
      let calls = 0;
      const result = await prepareWithJev(request, {
        ...config,
        fetch: fetcher(async () => {
          calls++;
          return response;
        }),
      });
      expect(calls).toBe(1);
      expect(result).toMatchObject({
        state: "handoff",
        reason: "error",
        preparation: null,
      });
    }
    expect(
      await prepareWithJev(request, {
        ...config,
        fetch: fetcher(async () => {
          throw new Error("offline");
        }),
      }),
    ).toMatchObject({ reason: "error" });
  });
  test("missing configuration exits without sending user data", async () => {
    let calls = 0;
    const fail = fetcher(async () => {
      calls++;
      throw new Error("Must not fetch");
    });
    expect(
      await prepareWithJev(request, { ...config, apiKey: "", fetch: fail }),
    ).toMatchObject({ reason: "unavailable" });
    expect(
      await prepareWithJev(request, {
        ...config,
        processorApproved: false,
        fetch: fail,
      }),
    ).toMatchObject({ reason: "unavailable" });
    expect(calls).toBe(0);
  });
  test("deadline aborts an uncooperative fetch and ignores its late answer", async () => {
    let resolve!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    const result = await prepareWithJev(request, {
      ...config,
      deadlineMs: 10,
      fetch: fetcher(async (_, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((done) => {
          resolve = done;
        });
      }),
    });
    expect(signal?.aborted).toBe(true);
    expect(result).toMatchObject({
      state: "handoff",
      reason: "timeout",
      preparation: null,
    });
    resolve(answer(candidate.id));
    await Promise.resolve();
    expect(result.preparation).toBeNull();
  });
  test("deadline also bounds a response whose JSON body never finishes", async () => {
    const response = {
      ok: true,
      json: () => new Promise(() => {}),
    } as Response;
    const result = await prepareWithJev(request, {
      ...config,
      deadlineMs: 10,
      fetch: fetcher(async () => response),
    });
    expect(result).toMatchObject({ reason: "timeout", preparation: null });
  });
});
