import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  ACCESS_TOKEN_TTL_MS,
  CLIENT_ID_PREFIX,
  CLIENT_SECRET_PREFIX,
  REFRESH_TOKEN_PREFIX,
  parseScopes,
  type RedeemResult,
  type RefreshResult,
} from "./oauth";
import {
  mintToken,
  randomSecret,
  secretPrefix,
  sha256Base64Url,
  sha256Hex,
  TOKEN_PREFIX,
} from "./tokens";

/**
 * The OAuth 2.1 endpoints a client actually talks to.
 *
 * There is no login form here. `/oauth/authorize` checks the request is
 * coherent and then hands the browser to the app, which already knows how to
 * sign somebody in and is the only place a session exists. What comes back is
 * an authorization code, and this file turns that into the same bearer token
 * the settings screen has always produced.
 *
 * Everything below is deliberately boring and to the letter: discovery at the
 * well-known paths, PKCE required and only S256, exact redirect matching,
 * rotation on refresh. Clients are unforgiving about the details and there is
 * no upside in being clever with them.
 */

const siteUrl = process.env.SITE_URL?.trim() || "https://app.onerep.life";
const convexSiteUrl = process.env.CONVEX_SITE_URL ?? "";

const RESOURCE_URL = `${convexSiteUrl}/mcp`;
export const RESOURCE_METADATA_URL = `${convexSiteUrl}/.well-known/oauth-protected-resource`;

function cors(extra?: Record<string, string>) {
  return new Headers({
    "Content-Type": "application/json",
    // Discovery and token exchange are performed by clients we cannot
    // enumerate, and neither carries a cookie. The credential in the body is
    // what authorizes; the origin is not load bearing.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extra,
  });
}

function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: cors(extra) });
}

/** RFC 6749 §5.2. `error` is what clients branch on; the description is for us. */
function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status, {
    "Cache-Control": "no-store",
  });
}

export const preflight = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: cors({ "Access-Control-Max-Age": "86400" }),
  });
});

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * RFC 9728. The 401 from `/mcp` points here, and this points at the
 * authorization server — which happens to be the same deployment, but a client
 * is not entitled to assume that.
 */
export const protectedResourceMetadata = httpAction(async () => {
  return json(
    {
      resource: RESOURCE_URL,
      authorization_servers: [convexSiteUrl],
      scopes_supported: ["read", "write"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://onerep.life/mcp",
    },
    200,
    { "Cache-Control": "public, max-age=3600" },
  );
});

/** RFC 8414. */
export const authorizationServerMetadata = httpAction(async () => {
  return json(
    {
      issuer: convexSiteUrl,
      authorization_endpoint: `${convexSiteUrl}/oauth/authorize`,
      token_endpoint: `${convexSiteUrl}/oauth/token`,
      registration_endpoint: `${convexSiteUrl}/oauth/register`,
      revocation_endpoint: `${convexSiteUrl}/oauth/revoke`,
      scopes_supported: ["read", "write"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // S256 only. `plain` is in the spec for clients that cannot hash, and
      // there are none of those left worth supporting.
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
    },
    200,
    { "Cache-Control": "public, max-age=3600" },
  );
});

// ---------------------------------------------------------------------------
// Dynamic client registration (RFC 7591)
// ---------------------------------------------------------------------------

export const register = httpAction(async (ctx, request) => {
  let body: {
    client_name?: unknown;
    redirect_uris?: unknown;
    client_uri?: unknown;
    token_endpoint_auth_method?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON.");
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter(
        (uri): uri is string => typeof uri === "string" && uri.length > 0,
      )
    : [];
  if (redirectUris.length === 0) {
    return oauthError(
      "invalid_redirect_uri",
      "At least one redirect_uri is required.",
    );
  }
  if (redirectUris.length > 10) {
    return oauthError("invalid_redirect_uri", "Too many redirect URIs.");
  }

  for (const uri of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return oauthError("invalid_redirect_uri", `Not a URL: ${uri}`);
    }
    const loopback =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]";
    // https everywhere, except loopback — which is where a desktop client
    // parks its callback listener and is not a network hop at all — and
    // private schemes, which are how a native app gets called back.
    const privateScheme = parsed.protocol !== "http:" && parsed.protocol !== "https:";
    if (parsed.protocol === "http:" && !loopback) {
      return oauthError(
        "invalid_redirect_uri",
        `Redirect URIs must use https unless they are loopback: ${uri}`,
      );
    }
    if (privateScheme && !/^[a-z][a-z0-9+.-]*:$/.test(parsed.protocol)) {
      return oauthError("invalid_redirect_uri", `Unsupported scheme: ${uri}`);
    }
  }

  // A client that says it will authenticate gets a secret; one that says it
  // cannot keep one gets PKCE alone, which is the correct answer for anything
  // running on somebody's laptop.
  const wantsSecret = body.token_endpoint_auth_method !== "none";

  const clientId = randomSecret(CLIENT_ID_PREFIX, 16);
  const clientSecret = wantsSecret
    ? randomSecret(CLIENT_SECRET_PREFIX)
    : undefined;

  try {
    await ctx.runMutation(internal.mcp.oauth.storeClient, {
      clientId,
      clientSecretHash: clientSecret
        ? await sha256Hex(clientSecret)
        : undefined,
      clientName:
        typeof body.client_name === "string" ? body.client_name : "MCP client",
      redirectUris,
      clientUri:
        typeof body.client_uri === "string" ? body.client_uri : undefined,
      registration: "dynamic",
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("REGISTRATION_RATE_LIMITED")) {
      return oauthError(
        "temporarily_unavailable",
        "Too many registrations right now. Try again shortly.",
        503,
      );
    }
    throw error;
  }

  return json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      // No expiry: the registration lasts until the user removes the
      // connection, which is the only event that should end it.
      ...(clientSecret ? { client_secret_expires_at: 0 } : {}),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: wantsSecret ? "client_secret_post" : "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
    { "Cache-Control": "no-store" },
  );
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** Shown only when we cannot safely redirect the error back to the client. */
function errorPage(title: string, detail: string) {
  const escape = (value: string) =>
    value.replace(/[&<>"]/g, (character) =>
      character === "&"
        ? "&amp;"
        : character === "<"
          ? "&lt;"
          : character === ">"
            ? "&gt;"
            : "&quot;",
    );
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escape(title)}</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100dvh;padding:2rem;color:#111}` +
      `main{max-width:32rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#555}</style>` +
      `<main><h1>${escape(title)}</h1><p>${escape(detail)}</p></main>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/**
 * Validates the request, then hands the browser to the app to ask the human.
 *
 * Anything wrong with `client_id` or `redirect_uri` stops here with a page,
 * because bouncing an error to an address the client did not register is
 * precisely the open redirect this endpoint exists to avoid. Everything else
 * is reported to the client the way the spec asks.
 */
export const authorize = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const params = url.searchParams;

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";

  if (!clientId || !redirectUri) {
    return errorPage(
      "That request is incomplete",
      "The app did not send a client_id and redirect_uri. Nothing to do here.",
    );
  }

  const client = await ctx.runQuery(internal.mcp.oauth.clientByClientId, {
    clientId,
  });
  if (!client) {
    return errorPage(
      "Unknown app",
      "That client is not registered with OneRep, or its registration was removed.",
    );
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return errorPage(
      "That redirect is not allowed",
      "The app asked to be sent to an address it never registered. This is refused on purpose.",
    );
  }

  const fail = (error: string, description: string) => {
    const target = new URL(redirectUri);
    target.searchParams.set("error", error);
    target.searchParams.set("error_description", description);
    const state = params.get("state");
    if (state !== null) target.searchParams.set("state", state);
    return Response.redirect(target.toString(), 302);
  };

  if ((params.get("response_type") ?? "") !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }

  const challenge = params.get("code_challenge") ?? "";
  const method = params.get("code_challenge_method") ?? "";
  if (!challenge) {
    return fail("invalid_request", "PKCE is required: send a code_challenge.");
  }
  if (method !== "S256") {
    return fail(
      "invalid_request",
      "Only code_challenge_method=S256 is supported.",
    );
  }

  const scopes = parseScopes(params.get("scope"));
  if (scopes === null) {
    return fail("invalid_scope", "Scopes must be some of: read, write.");
  }

  // The consent screen lives in the app, which is where a session already is.
  // The parameters are re-encoded rather than forwarded wholesale so nothing
  // the client invented rides along into our own origin.
  const consent = new URL("/oauth/consent", siteUrl);
  consent.searchParams.set("client_id", clientId);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("scope", scopes.join(" "));
  consent.searchParams.set("code_challenge", challenge);
  const state = params.get("state");
  if (state !== null) consent.searchParams.set("state", state);

  return Response.redirect(consent.toString(), 302);
});

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

/** Reads client credentials from either place the spec allows them to be. */
function clientCredentials(request: Request, form: URLSearchParams) {
  const header = request.headers.get("Authorization") ?? "";
  const basic = /^Basic\s+(.+)$/i.exec(header.trim());
  if (basic) {
    try {
      const decoded = atob(basic[1].trim());
      const separator = decoded.indexOf(":");
      if (separator > 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, separator)),
          clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
        };
      }
    } catch {
      // Falls through to the body, which is the more common shape anyway.
    }
  }
  return {
    clientId: form.get("client_id") ?? "",
    clientSecret: form.get("client_secret"),
  };
}

export const token = httpAction(async (ctx, request) => {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return oauthError("invalid_request", "Body must be form-encoded.");
  }

  const { clientId, clientSecret } = clientCredentials(request, form);
  if (!clientId) {
    return oauthError("invalid_client", "Missing client_id.", 401);
  }

  const client = await ctx.runQuery(internal.mcp.oauth.clientByClientId, {
    clientId,
  });
  if (!client) {
    return oauthError("invalid_client", "Unknown client.", 401);
  }

  // A confidential client must prove it is itself. A public one has no secret
  // to prove anything with, and PKCE carries the weight instead.
  if (client.clientSecretHash !== null) {
    if (!clientSecret) {
      return oauthError("invalid_client", "Missing client_secret.", 401);
    }
    const presented = await sha256Hex(clientSecret);
    if (presented !== client.clientSecretHash) {
      return oauthError("invalid_client", "Bad client_secret.", 401);
    }
  }

  const grantType = form.get("grant_type") ?? "";

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    const verifier = form.get("code_verifier") ?? "";

    if (!code || !redirectUri || !verifier) {
      return oauthError(
        "invalid_request",
        "code, redirect_uri and code_verifier are all required.",
      );
    }

    const redeemed: RedeemResult = await ctx.runMutation(
      internal.mcp.oauth.redeemAuthCode,
      { codeHash: await sha256Hex(code), clientId, redirectUri },
    );
    // Tested with `in` rather than the `ok` flag: this project compiles
    // without strictNullChecks, and a boolean discriminant does not narrow a
    // union there. Presence of the property does.
    if ("reason" in redeemed) {
      return oauthError("invalid_grant", redeemed.reason);
    }

    if ((await sha256Base64Url(verifier)) !== redeemed.codeChallenge) {
      return oauthError(
        "invalid_grant",
        "The code_verifier does not match the challenge from the authorization request.",
      );
    }

    return issue(ctx, {
      userId: redeemed.userId,
      clientId,
      clientName: client.clientName,
      scopes: redeemed.scopes,
    });
  }

  if (grantType === "refresh_token") {
    const presented = form.get("refresh_token") ?? "";
    if (!presented) {
      return oauthError("invalid_request", "Missing refresh_token.");
    }

    const existing: RefreshResult = await ctx.runQuery(
      internal.mcp.oauth.resolveRefreshToken,
      { tokenHash: await sha256Hex(presented), clientId },
    );
    if ("reason" in existing) {
      return oauthError("invalid_grant", existing.reason);
    }

    // A refresh may narrow the grant but never widen it.
    const requested = parseScopes(form.get("scope"));
    if (requested === null) {
      return oauthError("invalid_scope", "Scopes must be some of: read, write.");
    }
    const explicit = (form.get("scope") ?? "").trim().length > 0;
    const scopes = explicit
      ? requested.filter((scope) => existing.scopes.includes(scope))
      : existing.scopes;
    if (scopes.length === 0) {
      return oauthError(
        "invalid_scope",
        "None of the requested scopes were part of the original grant.",
      );
    }

    return issue(ctx, {
      userId: existing.userId,
      clientId,
      clientName: client.clientName,
      scopes,
      supersedes: existing.id,
    });
  }

  return oauthError(
    "unsupported_grant_type",
    "Supported grants are authorization_code and refresh_token.",
  );
});

async function issue(
  ctx: ActionCtx,
  args: {
    userId: string;
    clientId: string;
    clientName: string;
    scopes: ("read" | "write")[];
    supersedes?: Id<"mcpRefreshTokens">;
  },
) {
  const accessToken = mintToken();
  const refreshToken = randomSecret(REFRESH_TOKEN_PREFIX);

  try {
    await ctx.runMutation(internal.mcp.oauth.issueGrant, {
      userId: args.userId,
      clientId: args.clientId,
      clientName: args.clientName,
      scopes: args.scopes,
      accessTokenHash: await sha256Hex(accessToken),
      accessTokenPrefix: secretPrefix(accessToken, TOKEN_PREFIX),
      refreshTokenHash: await sha256Hex(refreshToken),
      supersedes: args.supersedes,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("CONNECTION_LIMIT")) {
      return oauthError(
        "access_denied",
        "This account has too many connected apps. Remove one in OneRep → Settings → API & MCP.",
        403,
      );
    }
    throw error;
  }

  return json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: args.scopes.join(" "),
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

// ---------------------------------------------------------------------------
// Revocation (RFC 7009)
// ---------------------------------------------------------------------------

/**
 * Always answers 200, even for a token that was never real. The spec asks for
 * that, and it is right: telling a caller which of its guesses existed is a
 * free oracle over other people's credentials.
 */
export const revoke = httpAction(async (ctx, request) => {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return json({}, 200, { "Cache-Control": "no-store" });
  }

  const presented = form.get("token");
  if (presented) {
    await ctx.runMutation(internal.mcp.oauth.revokeByToken, {
      tokenHash: await sha256Hex(presented),
    });
  }

  return json({}, 200, { "Cache-Control": "no-store" });
});
