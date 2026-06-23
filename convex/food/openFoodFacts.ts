import { v } from "convex/values";
import { action } from "../_generated/server";
import { authComponent } from "../auth";

const DEFAULT_OPENFOODFACTS_URL = "https://world.openfoodfacts.org";

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function allowedPath(path: string) {
  return (
    path === "/cgi/search.pl" ||
    /^\/api\/v2\/product\/[^/?#]+\.json$/.test(path)
  );
}

export const proxy = action({
  args: {
    path: v.string(),
    params: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const path = normalizePath(args.path);
    if (!allowedPath(path)) throw new Error("Unsupported Open Food Facts path");

    const baseUrl = (
      process.env.OPENFOODFACTS_URL ?? DEFAULT_OPENFOODFACTS_URL
    ).replace(/\/+$/, "");
    const url = new URL(`${baseUrl}${path}`);
    for (const { key, value } of args.params ?? []) {
      url.searchParams.append(key, value);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "OneRep/1.0 Convex food proxy",
    };
    const token = process.env.OPENFOODFACTS_AUTH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Open Food Facts request failed: ${response.status}`);
    }

    return await response.json();
  },
});
