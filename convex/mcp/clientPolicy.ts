import type { QueryCtx } from "../_generated/server";

export async function activeClient(
  ctx: Pick<QueryCtx, "db">,
  clientId: string,
) {
  const client = await ctx.db
    .query("mcpOauthClients")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .unique();
  return client && client.revokedAt === undefined ? client : null;
}

export function validCallback(uri: string) {
  if (uri.length > 2048 || uri.includes("#") || /[\s\\]/.test(uri))
    return false;
  try {
    const url = new URL(uri);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:")
      return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    // RFC 8252 private-use schemes use a reverse-domain name.
    return /^[a-z][a-z0-9+-]*(?:\.[a-z0-9+-]+)+:$/.test(url.protocol);
  } catch {
    return false;
  }
}
