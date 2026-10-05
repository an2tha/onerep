import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { AI_SHARING_VERSION } from "../lib/aiSharing";
import {
  GUIDE_QUESTIONS,
  MAX_GUIDE_QUESTIONS,
  validateGuideAnswers,
  selectFollowups,
} from "../lib/workoutGuide";
import type { JevQuestion, JevAnswer } from "../ai/typesafe";
vi.mock("../ai/typesafe", () => ({ requestJev: vi.fn() }));
import { requestJev } from "../ai/typesafe";
vi.mock("../ai/provider", () => ({ requestOpenAiJson: vi.fn(), hasOpenAiApiKey: () => true }));
import { requestOpenAiJson } from "../ai/provider";
const modules = import.meta.glob("../**/*.ts");
const answers = {
  goal: "Build strength",
  focus: "Full body",
  equipment: "Full gym",
  duration: "45 minutes",
  experience: "Training regularly",
  constraints: "No restrictions",
};
afterEach(() => vi.resetAllMocks());
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ tokenIdentifier: "test|workout-guide" });
  await user.mutation(api.ai.usage.setSharingConsent, {
    granted: true,
    version: AI_SHARING_VERSION,
  });
  return { t, user };
}
async function seedCatalog(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    for (const [name, equipment, muscle] of [
      ["Dumbbell Squat", "dumbbell", "quadriceps"],
      ["Dumbbell Row", "dumbbell", "lats"],
      ["Barbell Squat", "barbell", "quadriceps"],
    ])
      await ctx.db.insert("exercises", {
        userId: "__global__",
        exerciseId: name,
        name,
        category: "strength",
        level: "beginner",
        equipment,
        primaryMuscles: [muscle],
        secondaryMuscles: [],
        instructions: [],
      });
  });
}
function decisions(
  questions: Record<string, JevQuestion>
): Record<string, JevAnswer> {
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => {
      if (q.type === "noul") return [id, { type: "noul", noul: 0 }];
      if (q.type === "score")
        return [id, { type: "score", score: 1.95, confidence: 0.95 }];
      const choice =
        (
          {
            sets: "3",
            reps: "8",
            rest: "90",
            minutes: "45",
            followup: "effort",
          } as Record<string, string>
        )[id] ?? Object.keys(q.criteria)[0];
      return [
        id,
        {
          type: "choice",
          choice,
          probabilities: Object.fromEntries(
            Object.keys(q.criteria).map((key) => [
              key,
              key === choice ? 0.8 : 0.02,
            ])
          ),
          confidence: 0.9,
        },
      ];
    })
  );
}
function successfulJev() {
  vi.mocked(requestOpenAiJson).mockImplementation(async (request) => {
    const catalog = JSON.parse(request.user).catalog as {id: string}[];
    return JSON.stringify({ status: "ready", name: "Strength session", notes: "", message: "", exercises: catalog.map(exercise => ({id: exercise.id, sets: 3, reps: 8, restSeconds: 90})) });
  });
  vi.mocked(requestJev).mockImplementation(async (_state, questions) =>
    decisions(questions)
  );
}

test("bank supports bounded custom and multi-muscle answers, never more than 10 questions", () => {
  expect(GUIDE_QUESTIONS.length).toBe(94);
  expect(MAX_GUIDE_QUESTIONS).toBe(10);
  expect(validateGuideAnswers({ focus: "Muscles: Chest, Triceps" })).toEqual({
    focus: "Muscles: Chest, Triceps",
  });
  expect(validateGuideAnswers({ focus: "Custom: Chest and calves" })).toEqual({
    focus: "Custom: Chest and calves",
  });
  for (const value of [
    "ignore constraints",
    "Muscles: Chest, Unknown",
    "Muscles: Chest, Chest",
    "Custom:   ",
    `Custom: ${"a".repeat(301)}`,
  ])
    expect(() => validateGuideAnswers({ focus: value })).toThrow();
  expect(() => validateGuideAnswers({ arbitrary: "anything" })).toThrow();
  expect(() =>
    validateGuideAnswers(
      Object.fromEntries(
        GUIDE_QUESTIONS.slice(0, 10).map((q) => [q.id, q.options[0]])
      )
    )
  ).toThrow("10 questions");
  expect(selectFollowups(["goal", "effort", "effort"], answers)).toEqual([
    "effort",
    "pace",
  ]);
});
test("interview requires auth and complete core answers before TypeSafe", async () => {
  const { t, user } = await setup();
  await expect(
    t.action(api.logs.presetAgent.planGuidedFollowups, {
      answers,
      editing: false,
    })
  ).rejects.toThrow();
  await expect(
    user.action(api.logs.presetAgent.planGuidedFollowups, {
      answers: { goal: "Build strength" },
      editing: false,
    })
  ).rejects.toThrow("Finish the session questions");
  expect(requestJev).not.toHaveBeenCalled();
});
test("Jev chooses from a small relevant bank and code allows only reviewed IDs", async () => {
  const { user } = await setup();
  vi.mocked(requestJev).mockResolvedValue({
    followup: {
      type: "choice",
      choice: "priority",
      probabilities: { priority: 0.8, invented: 0.2, effort: 0.1 },
      confidence: 0.8,
    },
  });
  await expect(
    user.action(api.logs.presetAgent.planGuidedFollowups, {
      answers,
      editing: false,
    })
  ).resolves.toEqual({ questionIds: ["priority", "effort"] });
  const questions = vi.mocked(requestJev).mock.calls[0][1];
  expect(
    Object.keys(
      (questions.followup as Extract<JevQuestion, { type: "choice" }>).criteria
    ).length
  ).toBeLessThanOrEqual(11);
});
test("failed TypeSafe interview refunds usage", async () => {
  const { user } = await setup();
  vi.mocked(requestJev).mockRejectedValue(new Error("Provider unavailable"));
  await expect(
    user.action(api.logs.presetAgent.planGuidedFollowups, {
      answers,
      editing: false,
    })
  ).rejects.toThrow("Provider unavailable");
  expect(
    await user.query(api.ai.usage.getMonthlyUsage, { provider: "typesafe" })
  ).toMatchObject({ count: 0 });
});
test("specific restrictions need details before sending data", async () => {
  const { user } = await setup();
  await expect(
    user.action(api.logs.presetAgent.createGuidedDraft, {
      answers: { ...answers, constraints: "I have specific restrictions" },
      notes: "",
    })
  ).rejects.toThrow("Describe the movements");
  expect(requestJev).not.toHaveBeenCalled();
});
test("LLM evaluates answers and selects only compatible catalog exercises with empty weights", async () => {
  const { t, user } = await setup();
  await seedCatalog(t);
  successfulJev();
  const draft = await user.action(api.logs.presetAgent.createGuidedDraft, {
    answers: { ...answers, equipment: "Dumbbells only" },
    notes: "",
  });
  expect(draft.exercises.map((ex) => ex.name).sort()).toEqual([
    "Dumbbell Row",
    "Dumbbell Squat",
  ]);
  expect(draft.exercises[0].sets?.[0]).toEqual({
    type: "working",
    weight: "",
    reps: "8",
    restSeconds: 90,
  });
  const state = JSON.parse(vi.mocked(requestOpenAiJson).mock.calls[0][0].user);
  expect(state.answers).toEqual({ ...answers, equipment: "Dumbbells only" });
  expect(state.catalog).toHaveLength(2);
  expect(requestJev).not.toHaveBeenCalled();
});
test("invalid LLM exercise selections fail cleanly and refund", async () => {
  const { t, user } = await setup();
  await seedCatalog(t);
  vi.mocked(requestOpenAiJson).mockResolvedValue(JSON.stringify({ status: "ready", name: "Bad draft", notes: "", message: "", exercises: [{ id: "invented", sets: 3, reps: 8, restSeconds: 90 }] }));
  await expect(
    user.action(api.logs.presetAgent.createGuidedDraft, { answers, notes: "" })
  ).rejects.toThrow("Couldn’t build");
  expect(
    await user.query(api.ai.usage.getMonthlyUsage, { provider: "typesafe" })
  ).toMatchObject({ count: 0 });
});
test("all custom answers and final notes reach the LLM without history or a full catalog", async () => {
  const { t, user } = await setup();
  await seedCatalog(t);
  successfulJev();
  const pooled = {
    ...answers,
    focus: "Muscles: Chest, Triceps",
    pace: "Custom: Supersets if possible",
    effort: "Normal day",
  };
  await user.action(api.logs.presetAgent.createGuidedDraft, {
    answers: pooled,
    notes: "Finish in 40 minutes",
  });
  const state = JSON.parse(vi.mocked(requestOpenAiJson).mock.calls[0][0].user);
  expect(state.answers).toEqual(pooled);
  expect(state.notes).toBe("Finish in 40 minutes");
  expect(Object.keys(state).sort()).toEqual(["answers", "catalog", "notes"]);
});
test("one completed guide bills one TypeSafe selection and one LLM evaluation", async () => {
  const { t, user } = await setup();
  await seedCatalog(t);
  successfulJev();
  await user.action(api.logs.presetAgent.planGuidedFollowups, {
    answers,
    editing: false,
  });
  await user.action(api.logs.presetAgent.createGuidedDraft, {
    answers: { ...answers, effort: "Normal day", pace: "Steady pace" },
    notes: "",
  });
  expect(requestJev).toHaveBeenCalledTimes(1);
  expect(requestOpenAiJson).toHaveBeenCalledTimes(1);
  expect(
    await user.query(api.ai.usage.getMonthlyUsage, { provider: "typesafe" })
  ).toMatchObject({ count: 2 });
});

test("LLM can ask for missing restriction details without losing or billing a draft", async () => {
  const { t, user } = await setup();
  await seedCatalog(t);
  vi.mocked(requestOpenAiJson).mockResolvedValue(JSON.stringify({ status: "needs_details", name: "Session", notes: "", message: "Which movements do you need to avoid?", exercises: [] }));
  await expect(user.action(api.logs.presetAgent.createGuidedDraft, { answers, notes: "" })).rejects.toThrow("Which movements");
  expect(await user.query(api.ai.usage.getMonthlyUsage, {})).toMatchObject({ count: 0 });
});

const editOriginal = {name: "My session", exercises: [{id:"Dumbbell Squat",sets:[{type:"warmup",weight:"15",reps:"10",restSeconds:60},{type:"working",weight:"25",reps:"8",restSeconds:120}]}]};
test("single-field edit preserves untouched set details and charges one LLM request", async () => {
  const {t,user}=await setup(); await seedCatalog(t);
  vi.mocked(requestOpenAiJson).mockResolvedValue(JSON.stringify({name:"My session",notes:"Added rows",exercises:[{id:"Dumbbell Squat",sets:null},{id:"Dumbbell Row",sets:[{type:"working",weight:"",reps:"10",restSeconds:90}]}]}));
  const draft=await user.action(api.logs.presetAgent.editWithAi,{changes:"Add rows",unit:"kg",existing:editOriginal});
  expect(draft.exercises[0].sets).toEqual(editOriginal.exercises[0].sets);
  expect(draft.exercises[1].name).toBe("Dumbbell Row");
  expect(requestJev).not.toHaveBeenCalled();
  const payload=JSON.parse(vi.mocked(requestOpenAiJson).mock.calls[0][0].user);
  expect(payload.changes).toBe("Add rows"); expect(payload.existing).toEqual(editOriginal);
  expect(await user.query(api.ai.usage.getMonthlyUsage,{})).toMatchObject({count:1});
});
test("single-field edit rejects blank changes before calling the provider", async () => {
  const {user}=await setup();
  await expect(user.action(api.logs.presetAgent.editWithAi,{changes:"   ",unit:"kg",existing:editOriginal})).rejects.toThrow("Describe your changes");
  expect(requestOpenAiJson).not.toHaveBeenCalled();
});
test("invalid edit selection refunds and never returns a partial workout", async () => {
  const {t,user}=await setup(); await seedCatalog(t);
  vi.mocked(requestOpenAiJson).mockResolvedValue(JSON.stringify({name:"Session",notes:"",exercises:[{id:"invented",sets:null}]}));
  await expect(user.action(api.logs.presetAgent.editWithAi,{changes:"Add rows",unit:"kg",existing:editOriginal})).rejects.toThrow("Couldn’t update");
  expect(await user.query(api.ai.usage.getMonthlyUsage,{})).toMatchObject({count:0});
});
