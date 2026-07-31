import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

test("legacy subscription status endpoint remains available during rollout", async () => {
  const t = convexTest(schema, modules);
  const result = await t.query(api.subscriptions.getStatus, {});

  expect(result).toMatchObject({
    appUserId: null,
    checkoutUrl: null,
    nativeSdkKey: null,
    status: null,
  });
});
