/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { ConvexError } from "convex/values";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { defaultProgrammeSettings } from "../../packages/models/src/guided-programme";

const modules = import.meta.glob("../**/*.ts");
const profile = {
  age: 25,
  heightCm: 175,
  nutritionGoal: "maintain" as const,
  safetyMode: "standard" as const,
  safetyFlags: [] as string[],
  trackingMode: "full" as const,
  dietType: "No preference",
  allergies: [] as string[],
  mealFrequency: 3,
};
function setup() {
  const t = convexTest(schema, modules);
  return {
    t,
    owner: t.withIdentity({ tokenIdentifier: "test|nutrition-profile" }),
    other: t.withIdentity({ tokenIdentifier: "test|other-profile" }),
  };
}
test("default adult nutrition profile is eligible and can reserve generation", async () => {
  const { owner, t } = setup();
  const saved = await owner.mutation(
    api.users.onboarding.saveNutritionProfile,
    profile,
  );
  expect(saved).toMatchObject({
    ...profile,
    goal: "health",
    shownTooltips: [],
  });
  expect(await owner.query(api.nutritionProgrammes.getEligibility, {})).toEqual(
    { eligible: true, reason: null },
  );
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings: defaultProgrammeSettings(),
  });
  const reservation = await owner.mutation(
    internal.guidedProgrammes.reserveGeneration,
    { id, requestId: "eligible" },
  );
  expect(reservation.complete).toBe(false);
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(5);
  await t.mutation(internal.guidedProgrammes.failGeneration, {
    generationId: reservation.generationId!,
    attempt: reservation.attempt!,
    error: "Test cleanup",
  });
});
test("inline corrections preserve non-nutrition answers and cannot touch another account", async () => {
  const { owner, other, t } = setup();
  await owner.mutation(api.users.onboarding.save, {
    age: 25,
    heightCm: 175,
    goal: "build",
    experienceLevel: "advanced",
    nutritionGoal: "maintain",
    safetyMode: "habit",
    safetyFlags: [],
    occupationActivity: "manual",
    cookingSkill: "experienced",
    budget: "low",
    consent: {
      dataUse: true,
      weightData: false,
      foodLogging: true,
      wearableIntegrations: false,
    },
  });
  const before = await owner.query(api.users.onboarding.get, {});
  await t.run((ctx) =>
    ctx.db.patch("onboardingProfiles", before!._id, {
      shownTooltips: [1],
    }),
  );
  await other.mutation(api.users.onboarding.saveNutritionProfile, {
    ...profile,
    dietType: "Vegan",
  });
  const saved = await owner.mutation(
    api.users.onboarding.saveNutritionProfile,
    { ...profile, dietType: "Vegetarian", allergies: [" Sesame ", "Sesame"] },
  );
  expect(saved).toMatchObject({
    _id: before!._id,
    goal: "build",
    experienceLevel: "advanced",
    occupationActivity: "manual",
    cookingSkill: "experienced",
    budget: "low",
    consent: before!.consent,
    shownTooltips: [1],
    safetyMode: "standard",
    dietType: "Vegetarian",
    allergies: ["Sesame"],
  });
  expect((await other.query(api.users.onboarding.get, {}))!.dietType).toBe(
    "Vegan",
  );
  expect(
    (await owner.query(api.nutritionProgrammes.getEligibility, {})).eligible,
  ).toBe(true);
});
test("protected answers derive a protected mode even when standard is selected", async () => {
  const { owner } = setup();
  const cases = [
    { change: { age: 17 }, mode: "habit" },
    { change: { safetyFlags: ["under_18"] }, mode: "habit" },
    { change: { safetyFlags: ["none", "diabetes"] }, mode: "clinician" },
    { change: { safetyFlags: ["eating_disorder_history"] }, mode: "recovery" },
    { change: { nutritionGoal: "medical" as const }, mode: "clinician" },
    { change: { trackingMode: "recovery" as const }, mode: "recovery" },
    { change: { trackingMode: "habit" as const }, mode: "habit" },
    { change: { safetyMode: "clinician" as const }, mode: "clinician" },
  ];
  for (const { change, mode } of cases) {
    const saved = await owner.mutation(
      api.users.onboarding.saveNutritionProfile,
      { ...profile, ...change },
    );
    expect(saved!.safetyMode).toBe(mode);
    if (change.safetyFlags)
      expect(saved!.safetyFlags).toEqual(change.safetyFlags);
    expect(
      (await owner.query(api.nutritionProgrammes.getEligibility, {})).eligible,
    ).toBe(false);
  }
});
test("protected programme generation exposes an actionable public error without spending credits", async () => {
  const { owner } = setup();
  await owner.mutation(api.users.onboarding.saveNutritionProfile, {
    ...profile,
    safetyFlags: ["diabetes"],
  });
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings: defaultProgrammeSettings(),
  });
  const error = await owner
    .action(api.ai.guidedProgramme.generate, { id, requestId: "protected" })
    .catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<string>).data).toContain(
    "Your nutrition profile requires an individual plan with a qualified professional. You can review your nutrition profile here if any answers are out of date.",
  );
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(0);
  expect(
    (await owner.query(api.guidedProgrammes.get, { id })).generationStatus,
  ).toBeUndefined();
});
test("legacy medical goals and protected tracking remain restricted even with inconsistent saved safety mode", async () => {
  const { owner } = setup();
  await owner.mutation(api.users.onboarding.save, {
    age: 25,
    heightCm: 175,
    goal: "health",
    safetyMode: "standard",
    nutritionGoal: "medical",
  });
  expect(
    (await owner.query(api.nutritionProgrammes.getEligibility, {})).eligible,
  ).toBe(false);
  await owner.mutation(api.users.onboarding.save, {
    age: 25,
    heightCm: 175,
    goal: "health",
    safetyMode: "standard",
    nutritionGoal: "maintain",
    trackingMode: "habit",
  });
  expect(
    (await owner.query(api.nutritionProgrammes.getEligibility, {})).eligible,
  ).toBe(false);
});
test("nutrition profile editing validates age, measurements, quantities, strings, and authentication", async () => {
  const { owner, t } = setup();
  for (const change of [
    { age: 15 },
    { age: 121 },
    { age: 22.5 },
    { heightCm: 0 },
    { heightCm: 251 },
    { heightCm: Infinity },
    { mealFrequency: 0 },
    { mealFrequency: 7 },
    { mealFrequency: 2.5 },
    { dietType: "" },
    { allergies: [" "] },
    { safetyFlags: Array.from({ length: 31 }, () => "flag") },
  ]) {
    await expect(
      owner.mutation(api.users.onboarding.saveNutritionProfile, {
        ...profile,
        ...change,
      }),
    ).rejects.toThrow();
  }
  await expect(
    t.mutation(api.users.onboarding.saveNutritionProfile, profile),
  ).rejects.toThrow();
  expect(await owner.query(api.users.onboarding.get, {})).toBeNull();
});
