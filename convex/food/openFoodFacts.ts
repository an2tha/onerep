import { v } from "convex/values";
import { action } from "../_generated/server";
import { getAuthUser } from "../lib/auth";

const DEFAULT_OPENFOODFACTS_URL = "https://world.openfoodfacts.org";

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function isProductPath(path: string) {
  return /^\/api\/v2\/product\/[^/?#]+\.json$/.test(path);
}

function allowedPath(path: string) {
  return path === "/cgi/search.pl" || isProductPath(path);
}

export const proxy = action({
  args: {
    path: v.string(),
    params: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
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

    const language = args.language?.trim().toLowerCase();
    if (path === "/cgi/search.pl" && language) {
      // OFF search supports filtering by taxonomy tags. Restricting the
      // language tag server-side keeps irrelevant localized products out of
      // the client result set instead of merely re-ranking them locally.
      url.searchParams.set("tagtype_0", "languages");
      url.searchParams.set("tag_contains_0", "contains");
      url.searchParams.set("tag_0", language);
      url.searchParams.set("lc", language);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "OneRep/1.0 Convex food proxy",
    };
    const token = process.env.OPENFOODFACTS_AUTH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { headers });
    if (response.status === 404 && isProductPath(path)) {
      console.log("[openfoodfacts:raw]", {
        path,
        status: response.status,
        body: await response.text(),
      });
      return { status: 0, product: null };
    }
    if (!response.ok) {
      throw new Error(`Open Food Facts request failed: ${response.status}`);
    }

    const rawText = await response.text();
    console.log("[openfoodfacts:raw]", {
      path,
      status: response.status,
      body: rawText,
    });
    return JSON.parse(rawText);
  },
});
