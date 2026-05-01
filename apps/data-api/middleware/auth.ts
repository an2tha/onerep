import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the API key provided in the 'x-api-key' header.
 * Performs a timing-safe comparison against the DATA_API_KEY environment variable.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const isDev = process.env.NODE_ENV === "development" || process.env.INDEV === "true";
  if (isDev) {
    return next();
  }

  const apiKey = process.env.DATA_API_KEY;
  if (!apiKey) {
    console.error("[ERROR] DATA_API_KEY is not set in environment variables");
    return res.status(500).json({ error: "Internal server error" });
  }

  const providedKey = req.headers["x-api-key"] as string;
  if (!providedKey) {
    return res.status(401).json({ error: "Unauthorized: Missing API key" });
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
    console.error("[ERROR] API key validation error:", err);
  }

  return res.status(401).json({ error: "Unauthorized: Invalid API key" });
};
