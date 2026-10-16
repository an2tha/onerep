import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { AI_SHARING_VERSION } from "../lib/aiSharing";
vi.mock("../ai/provider", async (original) => ({
  ...(await original<typeof import("../ai/provider")>()),
  requestOpenAiJson: vi.fn(),
}));
import { requestOpenAiJson } from "../ai/provider";
const modules = import.meta.glob("../**/*.ts");
const content = {
  title: "A measured next step",
  summary: "There is not enough logged activity to infer a trend.",
  observations: [],
  nextSteps: ["Log a comparable session."],
  limitations: ["No recorded sessions in this window."],
  sessions: [],
  meals: [],
};
afterEach(() => vi.clearAllMocks());
async function setup(id = "test|center") {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ tokenIdentifier: id });
  await user.mutation(api.ai.usage.setSharingConsent, {
    granted: true,
    version: AI_SHARING_VERSION,
  });
  return { t, user };
}
test("honors an explicit sharing opt-out before any model call", async () => {
  const user = convexTest(schema, modules).withIdentity({
    tokenIdentifier: "test|no-consent",
  });
  await user.mutation(api.ai.usage.setSharingConsent, {
    granted: false,
    version: AI_SHARING_VERSION,
  });
  await expect(
    user.action(api.ai.coachCenter.generate, {
      kind: "review",
      today: "2026-10-16",
      preferences: "",
    }),
  ).rejects.toThrow();
  expect(requestOpenAiJson).not.toHaveBeenCalled();
});
test("saves validated results for the authenticated owner without creating workouts", async () => {
  const { t, user } = await setup();
  vi.mocked(requestOpenAiJson).mockResolvedValue(JSON.stringify(content));
  const result = await user.action(api.ai.coachCenter.generate, {
    kind: "review",
    today: "2026-10-16",
    preferences: "",
  });
  expect(result.content).toEqual(content);
  expect(
    await user.query(api.ai.coachCenterState.latest, { kind: "review" }),
  ).toEqual(result);
  expect(
    await t
      .withIdentity({ tokenIdentifier: "test|other" })
      .query(api.ai.coachCenterState.latest, { kind: "review" }),
  ).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("presets").take(1))).toEqual([]);
});
test.each([
  "not JSON",
  JSON.stringify({ ...content, sessions: [{ title: "invalid" }] }),
  JSON.stringify({
    ...content,
    meals: [
      {
        name: "Unexpected",
        meal: "Lunch",
        minutes: 10,
        ingredients: ["Rice"],
        steps: ["Cook"],
      },
    ],
  }),
])(
  "rejects malformed or mismatched model data and restores allowance",
  async (response) => {
    const { user } = await setup();
    vi.mocked(requestOpenAiJson).mockResolvedValue(response);
    await expect(
      user.action(api.ai.coachCenter.generate, {
        kind: "review",
        today: "2026-10-16",
        preferences: "",
      }),
    ).rejects.toThrow("allowance was restored");
    expect(await user.query(api.ai.usage.getMonthlyUsage, {})).toMatchObject({
      count: 0,
    });
    expect(
      await user.query(api.ai.coachCenterState.latest, { kind: "review" }),
    ).toBeNull();
  },
);
test("rejects impossible dates before charging or calling the model", async () => {
  const { user } = await setup();
  await expect(
    user.action(api.ai.coachCenter.generate, {
      kind: "review",
      today: "2026-02-30",
      preferences: "",
    }),
  ).rejects.toThrow("valid date");
  expect(requestOpenAiJson).not.toHaveBeenCalled();
});
test("replaces only the owner’s latest result of that kind", async () => {
  const { t, user } = await setup();
  const base = {
    kind: "review" as const,
    today: "2026-10-16",
    createdAt: 1,
    content,
    activity: [],
  };
  await t.mutation(internal.ai.coachCenterState.save, {
    userId: "test|center",
    result: base,
  });
  await t.mutation(internal.ai.coachCenterState.save, {
    userId: "test|center",
    result: { ...base, createdAt: 2 },
  });
  expect(
    (await t.run((ctx) => ctx.db.query("coachCenterResults").take(10))).length,
  ).toBe(1);
  expect(
    await user.query(api.ai.coachCenterState.latest, { kind: "review" }),
  ).toMatchObject({ createdAt: 2 });
});

test("omits activity graphs when personalized insights are disabled", async () => {
  const { t, user } = await setup();
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", "test|center"))
      .unique();
    await ctx.db.patch(row!._id, {
      privacySettings: {
        analyticsEnabled: false,
        personalizedInsightsEnabled: false,
      },
    });
  });
  vi.mocked(requestOpenAiJson).mockResolvedValue(JSON.stringify(content));
  const result = await user.action(api.ai.coachCenter.generate, {
    kind: "progress",
    today: "2026-10-16",
    preferences: "",
  });
  expect(result.activity).toEqual([]);
  const sent = JSON.parse(vi.mocked(requestOpenAiJson).mock.calls[0][0].user);
  expect(sent.workspace).not.toHaveProperty("recentWorkouts");
});

test("charts use owned recorded values and respect the requested time window", async () => {
  const { t, user } = await setup();
  await t.run(async (ctx) => {
    for (const [userId, date] of [
      ["test|center", "2026-10-16"],
      ["test|center", "2026-10-16"],
      ["test|center", "2026-10-01"],
      ["test|other", "2026-10-16"],
    ])
      await ctx.db.insert("workoutLogs", {
        userId,
        date,
        exercises: [],
        durationSeconds: 900,
        completedAt: Date.parse(date),
      });
    await ctx.db.insert("bodyMeasurements", {
      userId: "test|center",
      clientId: "weigh-in",
      loggedAt: "2026-10-15",
      weightKg: 71.2,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  vi.mocked(requestOpenAiJson).mockResolvedValue(JSON.stringify(content));
  const result = await user.action(api.ai.coachCenter.generate, {
    kind: "progress",
    today: "2026-10-16",
    preferences: "",
  });
  expect(result.activity.at(-1)).toEqual({ date: "2026-10-16", sessions: 2 });
  expect(result.activity.reduce((sum, d) => sum + d.sessions, 0)).toBe(2);
  expect(result.series).toContainEqual({
    title: "Body weight",
    unit: "kg",
    points: [{ date: "2026-10-15", value: 71.2 }],
  });
});

test("saved Center results are included in account export and deletion", async () => {
  const { t, user } = await setup();
  for (const userId of ["test|center", "test|other"])
    await t.mutation(internal.ai.coachCenterState.save, {
      userId,
      result: {
        kind: "review",
        today: "2026-10-16",
        createdAt: 1,
        content,
        activity: [],
      },
    });
  const exported = await user.query(api.users.users.exportMyData, {});
  expect(exported.data.coachCenterResults).toHaveLength(1);
  await user.mutation(api.users.users.deleteMyDataBatch, { batchSize: 50 });
  expect(
    await user.query(api.ai.coachCenterState.latest, { kind: "review" }),
  ).toBeNull();
  expect(
    await t
      .withIdentity({ tokenIdentifier: "test|other" })
      .query(api.ai.coachCenterState.latest, { kind: "review" }),
  ).not.toBeNull();
});
