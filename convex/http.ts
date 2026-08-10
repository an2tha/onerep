import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { stripeWebhook } from "./billing/webhooks";
import { mcpEndpoint } from "./mcp/server";
import {
  authorize,
  authorizationServerMetadata,
  preflight,
  protectedResourceMetadata,
  register,
  revoke,
  token,
} from "./mcp/oauthServer";
import { restApi } from "./api/rest";
import {
  authComponent,
  createAuth,
  googleAuthConfigured,
  trustedOrigins,
} from "./lib/auth";

const http = httpRouter();

/**
 * Which social sign-in buttons the login screen should render. This has to be
 * an HTTP route rather than a query: the Convex client runs with
 * `expectAuth: true`, so it holds queries until a session exists, and the
 * login screen by definition has none. Reports configuration only, never a
 * credential.
 */
function socialProvidersCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({ Vary: "Origin" });
  if (origin && trustedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

http.route({
  path: "/auth-providers",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const headers = socialProvidersCorsHeaders(request);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(null, { status: 204, headers });
  }),
});

http.route({
  path: "/auth-providers",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const headers = socialProvidersCorsHeaders(request);
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "public, max-age=300");
    return new Response(JSON.stringify({ google: googleAuthConfigured }), {
      headers,
    });
  }),
});

authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: trustedOrigins,
  },
});

http.route({
  path: "/billing/stripe/webhook",
  method: "POST",
  handler: stripeWebhook,
});

// The MCP endpoint. Authorized by bearer token rather than a session, so it
// deliberately sits outside the auth component's CORS-scoped routes.
http.route({ path: "/mcp", method: "POST", handler: mcpEndpoint });
http.route({ path: "/mcp", method: "OPTIONS", handler: mcpEndpoint });

/**
 * OAuth 2.1, so a client can get a token by asking the user rather than by
 * having one pasted into it.
 *
 * The two well-known paths are how a client finds any of the rest, and both
 * spellings of the protected-resource path are served: the specification
 * appends the resource path, older clients do not, and being right about which
 * is not worth a support thread.
 */
http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: protectedResourceMetadata,
});
http.route({
  path: "/.well-known/oauth-protected-resource/mcp",
  method: "GET",
  handler: protectedResourceMetadata,
});
http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: authorizationServerMetadata,
});

http.route({ path: "/oauth/authorize", method: "GET", handler: authorize });

for (const [path, handler] of [
  ["/oauth/register", register],
  ["/oauth/token", token],
  ["/oauth/revoke", revoke],
] as const) {
  http.route({ path, method: "POST", handler });
  http.route({ path, method: "OPTIONS", handler: preflight });
}

// The REST API, same keys and the same reasoning about CORS. The bare "/v1"
// has to be spelled out separately: a prefix route only matches what comes
// after the slash, and the index would otherwise 404.
for (const method of ["GET", "POST", "OPTIONS"] as const) {
  http.route({ path: "/v1", method, handler: restApi });
  http.route({ pathPrefix: "/v1/", method, handler: restApi });
}

export default http;
