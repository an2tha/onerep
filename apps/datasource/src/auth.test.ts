import { expect, test } from "bun:test";
import { requireToken } from "./auth.ts";

const TOKEN = "a".repeat(64);

function request(authorization?: string): Request {
  return new Request("http://localhost/v1/stats", {
    headers: authorization ? { authorization } : {},
  });
}

test("accepts the expected bearer token", () => {
  expect(requireToken(request(`Bearer ${TOKEN}`), TOKEN)).toBeNull();
});

test("accepts a case-insensitive scheme", () => {
  expect(requireToken(request(`bearer ${TOKEN}`), TOKEN)).toBeNull();
});

test("rejects a missing header", async () => {
  const response = requireToken(request(), TOKEN);
  expect(response?.status).toBe(401);
  expect(await response?.json()).toEqual({ error: "unauthorized" });
});

test("rejects a wrong token", () => {
  expect(requireToken(request(`Bearer ${"b".repeat(64)}`), TOKEN)?.status).toBe(401);
});

test("rejects a token that is only a prefix of the expected one", () => {
  expect(requireToken(request(`Bearer ${TOKEN.slice(0, 32)}`), TOKEN)?.status).toBe(401);
});

test("rejects a non-bearer scheme", () => {
  expect(requireToken(request(`Basic ${TOKEN}`), TOKEN)?.status).toBe(401);
});
