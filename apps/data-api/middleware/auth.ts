import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the x-api-key header.
 * It checks the header against the DATA_API_KEY environment variable.
 * If INDEV is true, it allows bypassing the check for development convenience.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.DATA_API_KEY;

  // Allow bypass in development if INDEV is true
  if (process.env.INDEV === "true") {
    return next();
  }

  if (!expectedKey) {
    console.error("[WARN] DATA_API_KEY is not set in environment variables");
    return res.status(500).json({ error: "Internal server error" });
  }

  if (typeof apiKey !== "string") {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid API key" });
  }

  try {
    // Constant-time comparison to prevent timing attacks
    const apiKeyBuffer = Buffer.from(apiKey);
    const expectedKeyBuffer = Buffer.from(expectedKey);

    if (
      apiKeyBuffer.length === expectedKeyBuffer.length &&
      crypto.timingSafeEqual(apiKeyBuffer, expectedKeyBuffer)
    ) {
      return next();
    }
  } catch (err) {
    // Fallback or error handling
  }

  return res.status(401).json({ error: "Unauthorized: Invalid API key" });
};
