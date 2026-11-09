# OneRep SDK

Install the versioned archive from the developer console with npm, pnpm or Bun. The package ships ESM and TypeScript declarations, has no runtime dependencies and uses Fetch and Web Crypto.

```sh
npm install https://developers.onerep.life/sdk/onerep-sdk-0.1.1.tgz
```

Register an application in the console. Register the precise callback URL. Choose a public client for mobile or browser applications. A confidential application exchanges codes on its server and keeps its client secret there.

```ts
import { OneRep, OneRepOAuth } from "@onerep/sdk";

const oauth = new OneRepOAuth({
  clientId: process.env.ONEREP_CLIENT_ID!,
  clientSecret: process.env.ONEREP_CLIENT_SECRET!,
  redirectUri: "https://example.org/oauth/callback",
});

// In the start handler, save transaction in the initiating user's session
// with a short expiry, then redirect their browser to url.
const { url, transaction } = await oauth.authorize(["read"]);

// In the callback handler, take and remove that session's saved transaction.
// callbackUrl is the incoming callback URL, including its query string.
const tokens = await oauth.exchange(callbackUrl, transaction);
const oneRep = new OneRep({ accessToken: tokens.access_token });
const goals = await oneRep.call("get_goals");
const workouts = await oneRep.call("list_workouts", { limit: 5 });
```

Request write access explicitly to log meals, workouts or water. Read includes health data. OAuth grants support read and write. Delete operations require a personal key with delete permission. Users can disconnect a grant in OneRep Settings under API & MCP.

Keep tokens per user. Store refresh tokens in secure server storage or an OS credential store. Serialize refreshes for each grant and persist the replacement pair returned by `oauth.refresh(tokens.refresh_token)`. Use `oauth.revoke(tokens.refresh_token)` when disconnecting. Handle `OneRepError.code` for denied consent, insufficient scope and expired grants. A rate limit includes `retryAfter` in seconds. Writes are never automatically retried.

The exported `operations` catalogue describes every endpoint and scope. TypeScript checks operation names and inputs. Call `list_routes` to discover the subset available to the current token. Dates use YYYY-MM-DD. Self-hosted applications can pass their Convex HTTP actions origin as `origin` to both constructors.
