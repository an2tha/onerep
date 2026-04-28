import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the x-api-key header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Allow bypass in local development
  if (process.env.INDEV === "true" || process.env.NODE_ENV === "development") {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.DATA_API_KEY;

  if (!expectedKey) {
    console.error("[AUTH] DATA_API_KEY is not set");
    return res.status(500).json({ error: "Internal server error" });
  }

  if (typeof apiKey !== "string") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKeyBuffer = Buffer.from(apiKey);
  const expectedKeyBuffer = Buffer.from(expectedKey);

  if (
    apiKeyBuffer.length === expectedKeyBuffer.length &&
    crypto.timingSafeEqual(apiKeyBuffer, expectedKeyBuffer)
  ) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized" });
};
