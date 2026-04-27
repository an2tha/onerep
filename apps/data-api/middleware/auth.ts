import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the x-api-key header.
 * Uses a timing-safe comparison to prevent timing attacks.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Allow bypass in development mode if explicitly set
  if (process.env.INDEV === "true") {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.DATA_API_KEY;

  if (!expectedKey) {
    console.error("[SECURITY] DATA_API_KEY is not configured");
    // Don't leak configuration issues to the client
    return res.status(500).json({ error: "Internal server error" });
  }

  if (typeof apiKey !== "string") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Use SHA-256 to hash the keys before comparison.
  // This ensures both buffers have the same length for timingSafeEqual
  // and protects against timing attacks regardless of the input length.
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest();
  const expectedKeyHash = crypto.createHash("sha256").update(expectedKey).digest();

  try {
    if (crypto.timingSafeEqual(apiKeyHash, expectedKeyHash)) {
      return next();
    }
  } catch (err) {
    // Should not happen as hashes are same length, but fail securely
    console.error("[SECURITY] API key validation error:", err);
  }

  return res.status(401).json({ error: "Unauthorized" });
};
