import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
const modules = import.meta.glob("../**/*.ts");
const draft = {
  name: "Ridge walk",
  description: "Meet at the trailhead",
  points: [
    { latitude: 48, longitude: 11 },
    { latitude: 48.01, longitude: 11.01 },
  ],
};
describe("hiking trails", () => {
  test("private by default, owner only, revocable public links without account data", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|trail-owner" });
    const other = t.withIdentity({ tokenIdentifier: "test|other-hiker" });
    await expect(t.mutation(api.hikingTrails.create, draft)).rejects.toThrow();
    const id = await owner.mutation(api.hikingTrails.create, draft);
    expect(await owner.query(api.hikingTrails.list, {})).toHaveLength(1);
    expect(await other.query(api.hikingTrails.list, {})).toEqual([]);
    expect(await other.query(api.hikingTrails.get, { id })).toBeNull();
    await expect(
      other.mutation(api.hikingTrails.setSharing, { id, enabled: true }),
    ).rejects.toThrow();
    await expect(
      other.mutation(api.hikingTrails.remove, { id }),
    ).rejects.toThrow();
    const token = await owner.mutation(api.hikingTrails.setSharing, {
      id,
      enabled: true,
    });
    expect(token).toBeTruthy();
    const shared = await t.query(api.hikingTrails.shared, { token: token! });
    expect(shared).toMatchObject(draft);
    expect(shared).not.toHaveProperty("userId");
    expect(shared).not.toHaveProperty("_id");
    expect(
      await owner.mutation(api.hikingTrails.setSharing, { id, enabled: true }),
    ).toBe(token);
    await owner.mutation(api.hikingTrails.setSharing, { id, enabled: false });
    expect(
      await t.query(api.hikingTrails.shared, { token: token! }),
    ).toBeNull();
    const newToken = await owner.mutation(api.hikingTrails.setSharing, {
      id,
      enabled: true,
    });
    expect(newToken).not.toBe(token);
    await owner.mutation(api.hikingTrails.remove, { id });
    expect(
      await t.query(api.hikingTrails.shared, { token: newToken! }),
    ).toBeNull();
  });
  test("rejects invalid route data and computes distance server-side", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "test|trail-validate",
    });
    await expect(
      t.mutation(api.hikingTrails.create, { ...draft, name: " " }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.hikingTrails.create, {
        ...draft,
        points: [draft.points[0]!],
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.hikingTrails.create, {
        ...draft,
        points: [draft.points[0]!, { latitude: 91, longitude: 0 }],
      }),
    ).rejects.toThrow();
    const id = await t.mutation(api.hikingTrails.create, draft);
    expect(
      (await t.query(api.hikingTrails.get, { id }))?.distanceMeters,
    ).toBeGreaterThan(1000);
  });
  test("saves new sport types, private workout geometry, and hike goals", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|hike-workout" });
    const other = t.withIdentity({ tokenIdentifier: "test|other" });
    for (const sport of ["hike", "walk", "trail_run", "row"] as const) {
      await owner.mutation(api.logs.healthWorkouts.recordEnduranceWorkout, {
        externalId: sport,
        sport,
        date: "2026-09-12",
        startedAt: 100000,
        endedAt: 200000,
        durationSeconds: 100,
        totalDistanceMeters: 1000,
        hasRoute: true,
        routePoints: draft.points,
        elevationGainMeters: 20,
      });
    }
    const rows = await owner.query(api.logs.healthWorkouts.list, {});
    expect(rows).toHaveLength(4);
    const route = await owner.query(api.logs.healthWorkouts.getRoute, {
      workoutId: rows[0]!._id,
    });
    expect(route).toMatchObject({
      points: draft.points,
      elevationGainMeters: 20,
    });
    expect(
      await other.query(api.logs.healthWorkouts.getRoute, {
        workoutId: rows[0]!._id,
      }),
    ).toBeNull();
    await owner.mutation(api.users.users.setEnduranceGoals, {
      sport: "hike",
      distanceMeters: 10000,
    });
    expect(
      (await owner.query(api.users.users.getPreferences, {}))?.enduranceGoals
        ?.hike?.distanceMeters,
    ).toBe(10000);
  });
  test("account deletion removes trails, share links, and stored workout routes", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|trail-delete" });
    const id = await owner.mutation(api.hikingTrails.create, draft);
    const token = await owner.mutation(api.hikingTrails.setSharing, {
      id,
      enabled: true,
    });
    await owner.mutation(api.logs.healthWorkouts.recordEnduranceWorkout, {
      externalId: "delete-route",
      sport: "hike",
      date: "2026-09-12",
      startedAt: 100000,
      endedAt: 200000,
      durationSeconds: 100,
      totalDistanceMeters: 1000,
      hasRoute: true,
      routePoints: draft.points,
    });
    const result = await owner.mutation(api.users.users.deleteMyDataBatch, {
      batchSize: 50,
    });
    expect(result.remaining).toBe(false);
    expect(
      await t.query(api.hikingTrails.shared, { token: token! }),
    ).toBeNull();
    await t.run(async (ctx) => {
      expect(await ctx.db.query("hikingTrailRoutes").take(1)).toEqual([]);
      expect(await ctx.db.query("healthWorkoutRoutes").take(1)).toEqual([]);
    });
  });
});
