import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

/**
 * Compares two secrets without leaking their contents through timing. Lengths
 * are hashed first so that a length mismatch costs the same as a value
 * mismatch.
 */
function secretEquals(a: string, b: string): boolean {
  const left = Bun.SHA256.hash(encoder.encode(a));
  const right = Bun.SHA256.hash(encoder.encode(b));
  return timingSafeEqual(left, right);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

/**
 * Returns null when the request carries the expected token, or a 401 response
 * to return to the caller when it does not.
 */
export function requireToken(request: Request, expected: string): Response | null {
  const presented = bearerToken(request);
  if (presented && secretEquals(presented, expected)) return null;
  return Response.json(
    { error: "unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}
