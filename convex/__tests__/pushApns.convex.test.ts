/**
 * The APNs transport, with Apple replaced by a stub that says what Apple says.
 *
 * The interesting behaviour here is not "does a notification arrive" — nothing
 * in a test suite can answer that — but which failures are allowed to delete a
 * user's device registration. Getting that wrong empties the table.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  hasApnsCredentials,
  resolveApnsConfig,
  resetApnsTokenCache,
  sendApnsPush,
} from "../push/apns";

/**
 * A throwaway P-256 key in PKCS#8 PEM, because the signing path is the one
 * part of this that a hand-written fixture cannot fake.
 */
async function generatePem() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  let binary = "";
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

const MESSAGE = {
  title: "Your week, reviewed",
  body: "Four sessions, up from two.",
  link: "onerep://coach/review",
  data: { kind: "weekly_review", dedupeKey: "2026-W32" },
};

let pem: string;

beforeEach(async () => {
  pem ??= await generatePem();
  resetApnsTokenCache();
  vi.stubEnv("APNS_KEY_ID", "ABC1234567");
  vi.stubEnv("APNS_TEAM_ID", "TEAM123456");
  vi.stubEnv("APNS_BUNDLE_ID", "com.ananthh.onerep");
  vi.stubEnv("APNS_PRIVATE_KEY", pem.replace(/\n/g, "\\n"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubApple(status: number, body = "") {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("configuration", () => {
  test("reports itself unavailable rather than half-configured", () => {
    vi.stubEnv("APNS_PRIVATE_KEY", "");
    expect(hasApnsCredentials()).toBe(false);
    expect(resolveApnsConfig()).toBeNull();
  });

  test("takes production unless sandbox is asked for by name", () => {
    expect(resolveApnsConfig()?.host).toBe("https://api.push.apple.com");
    vi.stubEnv("APNS_ENVIRONMENT", "sandbox");
    expect(resolveApnsConfig()?.host).toBe(
      "https://api.sandbox.push.apple.com",
    );
  });

  test("repairs the escaped newlines Convex stores PEMs with", () => {
    expect(resolveApnsConfig()?.privateKey).toContain(
      "-----BEGIN PRIVATE KEY-----\n",
    );
  });
});

describe("sending", () => {
  test("addresses the device and signs the request", async () => {
    const fetchMock = stubApple(200);
    const config = resolveApnsConfig()!;

    const result = await sendApnsPush(config, "devicetoken123", MESSAGE);
    expect(result.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.push.apple.com/3/device/devicetoken123");
    const headers = init.headers as Record<string, string>;
    expect(headers["apns-topic"]).toBe("com.ananthh.onerep");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);

    const payload = JSON.parse(init.body as string);
    expect(payload.aps.alert).toEqual({
      title: MESSAGE.title,
      body: MESSAGE.body,
    });
    // The tap target and the dedupe key ride alongside `aps`, where the
    // JavaScript listener reads them as notification data.
    expect(payload.link).toBe("onerep://coach/review");
    expect(payload.kind).toBe("weekly_review");
  });

  test("signs once for a sweep, not once per device", async () => {
    const fetchMock = stubApple(200);
    const config = resolveApnsConfig()!;
    await sendApnsPush(config, "one", MESSAGE);
    await sendApnsPush(config, "two", MESSAGE);

    const bearers = fetchMock.mock.calls.map(
      (call) =>
        ((call[1] as RequestInit).headers as Record<string, string>)
          .authorization,
    );
    expect(bearers[0]).toBe(bearers[1]);
  });

  test("treats a rejected device token as dead", async () => {
    stubApple(400, JSON.stringify({ reason: "BadDeviceToken" }));
    const result = await sendApnsPush(resolveApnsConfig()!, "stale", MESSAGE);
    expect(result).toMatchObject({ ok: false, retriable: false });
  });

  test("treats 410 as dead whatever the body says", async () => {
    stubApple(410, "");
    const result = await sendApnsPush(resolveApnsConfig()!, "gone", MESSAGE);
    expect(result.retriable).toBe(false);
  });

  test("keeps the token when the payload is what Apple objected to", async () => {
    // A sender bug must never be allowed to look like a thousand dead phones.
    stubApple(413, JSON.stringify({ reason: "PayloadTooLarge" }));
    const result = await sendApnsPush(resolveApnsConfig()!, "fine", MESSAGE);
    expect(result).toMatchObject({ ok: false, retriable: true });
  });

  test("keeps the token when Apple itself is having a day", async () => {
    stubApple(503, JSON.stringify({ reason: "ServiceUnavailable" }));
    const result = await sendApnsPush(resolveApnsConfig()!, "fine", MESSAGE);
    expect(result.retriable).toBe(true);
  });

  test("re-signs after Apple refuses the provider token", async () => {
    const rejecting = stubApple(
      403,
      JSON.stringify({ reason: "ExpiredProviderToken" }),
    );
    const config = resolveApnsConfig()!;
    await sendApnsPush(config, "one", MESSAGE);
    const first = (
      (rejecting.mock.calls[0][1] as RequestInit).headers as Record<
        string,
        string
      >
    ).authorization;

    const accepting = stubApple(200);
    await sendApnsPush(config, "one", MESSAGE);
    const second = (
      (accepting.mock.calls[0][1] as RequestInit).headers as Record<
        string,
        string
      >
    ).authorization;
    expect(second).not.toBe(first);
  });
});
