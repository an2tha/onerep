// Read-only App Store Connect catalogue diagnostics. Credentials stay in memory.
import { sign } from "node:crypto";

const origin = "https://api.appstoreconnect.apple.com";
const bundleId = "com.ananthh.onerep";
const expectedProduct = "onerep_pro_monthly";
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function main() {
  const keyId = required("APP_STORE_CONNECT_KEY_ID");
  const issuer = required("APP_STORE_CONNECT_ISSUER_ID");
  const key = required("APP_STORE_CONNECT_PRIVATE_KEY").replace(/\\n/g, "\n");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({ iss: issuer, iat: now, exp: now + 600, aud: "appstoreconnect-v1" })}`;
  const token = `${payload}.${sign("sha256", Buffer.from(payload), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;

  async function get(path) {
    const url = new URL(path, origin);
    if (url.origin !== origin) throw new Error("Unexpected App Store API origin");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`${url.pathname}: HTTP ${response.status}: ${body.errors?.map((e) => `${e.code}: ${e.detail ?? e.title}`).join("; ")}`);
    }
    return body;
  }

  async function list(path) {
    const data = [];
    while (path) {
      const page = await get(path);
      data.push(...page.data);
      path = page.links?.next;
    }
    return data;
  }

  const apps = await list(`/v1/apps?filter[bundleId]=${bundleId}&limit=10`);
  if (apps.length !== 1) throw new Error(`Expected one app for ${bundleId}, found ${apps.length}`);
  const app = apps[0];
  console.log(JSON.stringify({ appId: app.id, bundleId: app.attributes.bundleId, name: app.attributes.name, expectedProduct }, null, 2));
  const groups = await list(`/v1/apps/${app.id}/subscriptionGroups?limit=200`);
  let matched;
  for (const group of groups) {
    const subscriptions = await list(`/v1/subscriptionGroups/${group.id}/subscriptions?limit=200`);
    console.log(JSON.stringify({ groupId: group.id, name: group.attributes.referenceName, subscriptions: subscriptions.map(({ id, attributes }) => ({ id, ...attributes })) }, null, 2));
    matched ??= subscriptions.find((s) => s.attributes.productId === expectedProduct);
  }
  if (!matched) throw new Error(`App Store Connect has no subscription matching ${expectedProduct} for ${bundleId}`);

  const details = await get(`/v1/subscriptions/${matched.id}`);
  for (const relation of ["subscriptionLocalizations", "prices", "subscriptionAvailability", "appStoreReviewScreenshot"]) {
    const path = details.data.relationships?.[relation]?.links?.related;
    if (!path) continue;
    try {
      const value = await get(path);
      console.log(JSON.stringify({ relation, data: value.data, paging: value.meta?.paging }, null, 2));
    } catch (error) {
      console.log(`${relation}: ${error.message}`);
    }
  }
  console.log("Catalogue inspection complete. StoreKit device testing and the Paid Apps Agreement must also be checked.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
