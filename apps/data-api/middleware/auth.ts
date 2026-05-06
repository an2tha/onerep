import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the API key from the 'x-api-key' header.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.DATA_API_KEY;

  // Bypass for local development if INDEV is set to true
  if (process.env.INDEV === "true" || process.env.NODE_ENV === "development") {
    return next();
  }

  if (!expectedKey) {
    console.error("[ERR] DATA_API_KEY is not set in the environment.");
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  if (!apiKey || typeof apiKey !== "string") {
    res.status(401).json({ error: "Unauthorized: Missing or invalid API key" });
    return;
  }

  try {
    const apiKeyBuffer = Buffer.from(apiKey);
    const expectedKeyBuffer = Buffer.from(expectedKey);

    if (
      apiKeyBuffer.length === expectedKeyBuffer.length &&
      crypto.timingSafeEqual(apiKeyBuffer, expectedKeyBuffer)
    ) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized: Invalid API key" });
    }
  } catch (error) {
    console.error("[ERR] API key validation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
