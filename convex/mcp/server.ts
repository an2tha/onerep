import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { RATE_LIMITED } from "../lib/rateLimits";
import { findTool, toolDescriptors, type ToolScope } from "./tools";
import { sha256Hex } from "./tokens";

/**
 * The MCP endpoint: JSON-RPC 2.0 over a single POST.
 *
 * Streamable HTTP without the streaming — every method here answers in one
 * message, and the spec allows a plain JSON response for exactly that case.
 * When something needs to push (subscriptions, sampling) this grows an SSE
 * branch; inventing one before then is scaffolding nobody uses.
 *
 * Auth is a bearer token, hashed and looked up on every call. There is no
 * anonymous tier: an unauthenticated request is told so and given nothing to
 * enumerate.
 */

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "onerep", version: "1.0.0" };

type JsonRpcId = string | number | null;

function corsHeaders() {
  return new Headers({
    "Content-Type": "application/json",
    // An MCP client is not a browser origin we can enumerate, and the bearer
    // token — not the origin — is what authorizes the call.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, MCP-Protocol-Version",
  });
}

function rpcResult(id: JsonRpcId, result: unknown, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status,
    headers: corsHeaders(),
  });
}

function rpcError(id: JsonRpcId, code: number, message: string, status = 200) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { status, headers: corsHeaders() },
  );
}

/**
 * A failed tool is not a failed request.
 *
 * The protocol wants tool errors inside a successful result with `isError`, so
 * the model can read what went wrong and try something else, rather than the
 * transport swallowing it as a protocol fault.
 */
function toolResult(id: JsonRpcId, payload: unknown, isError = false) {
  return rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  });
}

function bearerToken(request: Request) {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function unauthorized(id: JsonRpcId, message: string) {
  const response = rpcError(id, -32001, message, 401);
  // Points a compliant client at where to get one, rather than leaving it to
  // guess that this is a token endpoint at all.
  response.headers.set(
    "WWW-Authenticate",
    'Bearer realm="OneRep", error="invalid_token"',
  );
  return response;
}

export const mcpEndpoint = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  let body: {
    jsonrpc?: string;
    id?: JsonRpcId;
    method?: string;
    params?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }

  const id = body.id ?? null;
  const method = body.method ?? "";

  // Notifications carry no id and expect no body back.
  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }

  const presented = bearerToken(request);
  if (!presented) {
    return unauthorized(
      id,
      "Missing bearer token. Create one in OneRep → Settings → Data & account.",
    );
  }

  const token = await ctx.runQuery(internal.mcp.tokens.resolve, {
    tokenHash: await sha256Hex(presented),
  });
  if (!token) {
    return unauthorized(id, "That token is not valid, or has been revoked.");
  }
  const scopes = token.scopes as ToolScope[];

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "OneRep is this user's training and nutrition log. Read before you write, prefer get_range over repeated get_day calls, and never invent numbers the user did not give you — an entry logged wrong is worse than one not logged.",
      });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: toolDescriptors(scopes) });

    case "tools/call": {
      const params = body.params ?? {};
      const name = String(params.name ?? "");
      const tool = findTool(name);

      if (!tool) return rpcError(id, -32602, `No such tool: ${name}`);
      if (!scopes.includes(tool.scope)) {
        return toolResult(
          id,
          {
            error: `This token has ${scopes.join(" and ")} access, and ${tool.name} needs ${tool.scope}.`,
          },
          true,
        );
      }

      try {
        await ctx.runMutation(internal.mcp.tokens.touch, {
          id: token.id,
          write: tool.scope === "write",
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message.includes(RATE_LIMITED)
            ? "This token has used its budget for the hour. Try later."
            : "Could not authorize that call.";
        return toolResult(id, { error: message }, true);
      }

      try {
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        const result = await tool.run(ctx, token.userId, args);
        return toolResult(id, result);
      } catch (error) {
        // The model gets the reason, not a stack: these messages are written
        // to be acted on ("use YYYY-MM-DD"), which is the whole point.
        return toolResult(
          id,
          { error: error instanceof Error ? error.message : "Tool failed" },
          true,
        );
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
});
