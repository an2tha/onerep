import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the x-api-key header.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = process.env.DATA_API_KEY;
  const providedKey = req.headers["x-api-key"] as string;

  // Allow bypass in development mode
  if (process.env.NODE_ENV === "development" || process.env.INDEV === "true") {
    return next();
  }

  if (!apiKey) {
    console.error("[SECURITY] DATA_API_KEY is not set in environment");
    return res.status(500).json({ error: "Internal server error" });
  }

  if (!providedKey) {
    return res.status(401).json({ error: "API key is required" });
  }

  try {
    const keyBuffer = Buffer.from(apiKey);
    const providedBuffer = Buffer.from(providedKey);

    if (
      keyBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(keyBuffer, providedBuffer)
    ) {
      return next();
    }
  } catch (err) {
    console.error("[SECURITY] Error during API key validation", err);
  }

  return res.status(401).json({ error: "Invalid API key" });
};
