import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the API key provided in the 'x-api-key' header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const isDev = process.env.INDEV === "true" || process.env.NODE_ENV === "development";

  // Allow bypass in development environments
  if (isDev) {
    return next();
  }

  const apiKey = process.env.DATA_API_KEY;
  if (!apiKey) {
    // Fail securely if the key is missing from the environment
    console.error("[CRITICAL] DATA_API_KEY is not set in environment variables");
    return res.status(500).json({ error: "Internal server error" });
  }

  const providedKey = req.headers["x-api-key"] as string;
  if (!providedKey) {
    return res.status(401).json({ error: "Unauthorized: Missing API key" });
  }

  // Use timingSafeEqual to prevent timing attacks
  const apiKeyBuffer = Buffer.from(apiKey);
  const providedKeyBuffer = Buffer.from(providedKey);

  if (
    apiKeyBuffer.length === providedKeyBuffer.length &&
    crypto.timingSafeEqual(apiKeyBuffer, providedKeyBuffer)
  ) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized: Invalid API key" });
};
