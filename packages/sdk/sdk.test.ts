import { test, expect } from "bun:test";
import { OneRep, OneRepError, OneRepOAuth } from "./src/index";

test("routes encode IDs, separate query and body, and retain DELETE payloads", async () => {
  const requests: Request[] = [];
  const api = new OneRep({
    accessToken: "test",
    fetch: (async (url, init) => {
      requests.push(new Request(url, init));
      return Response.json({});
    }) as typeof fetch,
  });
  await api.call("update_recipe", { id: "a/b", name: "Soup" });
  await api.call("get_range", { start: "2026-11-01", end: "2026-11-09" });
  await api.call("unmark_rest_days", { dates: ["2026-11-01"] });
  expect(new URL(requests[0].url).pathname).toBe("/v1/recipes/a%2Fb");
  expect(await requests[0].json()).toEqual({ name: "Soup" });
  expect(requests[1].url).toEndWith("?start=2026-11-01&end=2026-11-09");
  expect(await requests[2].json()).toEqual({ dates: ["2026-11-01"] });
  expect(requests[2].headers.get("authorization")).toBe("Bearer test");
});

test("OAuth binds state and PKCE to the callback, preserves server errors", async () => {
  let sent = 0;
  const oauth = new OneRepOAuth({
    clientId: "test",
    redirectUri: "https://example.org/callback",
    fetch: (async () => {
      sent++;
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }) as typeof fetch,
  });
  const { url, transaction } = await oauth.authorize();
  const challenge = new URL(url).searchParams.get("code_challenge");
  expect(challenge).toBe(
    Buffer.from(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(transaction.verifier),
      ),
    ).toString("base64url"),
  );
  await expect(
    oauth.exchange(
      "https://example.org/callback?state=wrong&code=x",
      transaction,
    ),
  ).rejects.toBeInstanceOf(OneRepError);
  expect(sent).toBe(0);
  await expect(
    oauth.exchange(
      "https://example.org/callback?state=" + transaction.state + "&code=x",
      transaction,
    ),
  ).rejects.toMatchObject({ code: "invalid_grant" });
  expect(sent).toBe(1);
});

test("callback query parameters must match the registration", async () => {
  const oauth = new OneRepOAuth({
    clientId: "test",
    redirectUri: "https://example.org/callback?tenant=alice",
  });
  const { transaction } = await oauth.authorize();
  for (const query of ["tenant=bob", "tenant=alice&tenant=bob", ""]) {
    await expect(
      oauth.exchange(
        "https://example.org/callback?state=" +
          transaction.state +
          "&code=x&" +
          query,
        transaction,
      ),
    ).rejects.toMatchObject({ code: "invalid_callback" });
  }
});
