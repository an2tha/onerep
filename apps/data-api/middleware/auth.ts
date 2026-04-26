import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the API key provided in the 'x-api-key' header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Bypass validation in development if INDEV is set to 'true'
  if (process.env.INDEV === "true") {
    return next();
  }

  const apiKey = process.env.DATA_API_KEY;
  if (!apiKey) {
    console.error("[CRITICAL] DATA_API_KEY is not set in environment variables");
    return res.status(500).json({ error: "Internal server error" });
  }

  const providedKey = req.headers["x-api-key"];

  if (!providedKey || typeof providedKey !== "string") {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid API key" });
  }

  try {
    // timingSafeEqual requires both buffers to have the same length
    const keyBuf = Buffer.from(apiKey);
    const providedBuf = Buffer.from(providedKey);

    if (keyBuf.length !== providedBuf.length) {
      // Use a dummy comparison to mitigate some timing differences,
      // though length mismatch is still a hint.
      crypto.timingSafeEqual(keyBuf, keyBuf);
      return res.status(401).json({ error: "Unauthorized: Invalid API key" });
    }

    if (crypto.timingSafeEqual(keyBuf, providedBuf)) {
      return next();
    }
  } catch (err) {
    console.error("[ERR] API key validation error:", err);
  }

  return res.status(401).json({ error: "Unauthorized: Invalid API key" });
};
