import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the x-api-key header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Allow bypass in development mode
  if (process.env.INDEV === "true") {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.DATA_API_KEY;

  if (!expectedKey) {
    console.error("[AUTH] DATA_API_KEY is not set in environment variables");
    return res.status(500).json({ error: "Internal server error" });
  }

  if (!apiKey || typeof apiKey !== "string") {
    return res.status(401).json({ error: "Unauthorized: Missing API key" });
  }

  try {
    const apiKeyBuffer = Buffer.from(apiKey);
    const expectedKeyBuffer = Buffer.from(expectedKey);

    if (
      apiKeyBuffer.length === expectedKeyBuffer.length &&
      crypto.timingSafeEqual(apiKeyBuffer, expectedKeyBuffer)
    ) {
      return next();
    }
  } catch (err) {
    // Fallback if Buffer.from fails or other issues
    console.error("[AUTH] Error validating API key:", err);
  }

  return res.status(401).json({ error: "Unauthorized: Invalid API key" });
};
