import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the API key for protected routes.
 *
 * It checks the 'x-api-key' header against the DATA_API_KEY environment variable.
 * Uses timingSafeEqual to prevent timing attacks.
 *
 * In development (NODE_ENV === 'development' or INDEV === 'true'),
 * it allows requests without a valid key.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const isDev = process.env.NODE_ENV === "development" || process.env.INDEV === "true";
  const expectedKey = process.env.DATA_API_KEY;

  // In production, we MUST have an API key configured
  if (!isDev && !expectedKey) {
    console.error("[ERR] DATA_API_KEY is not configured in production");
    return res.status(500).json({ error: "Internal server error" });
  }

  // Bypass for development if no key is provided
  if (isDev && !req.headers["x-api-key"]) {
    return next();
  }

  const providedKey = req.headers["x-api-key"] as string;

  if (!providedKey || !expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const providedBuffer = Buffer.from(providedKey);
    const expectedBuffer = Buffer.from(expectedKey);

    if (providedBuffer.length !== expectedBuffer.length) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      return next();
    }
  } catch (err) {
    // Fallback if Buffer creation fails
  }

  res.status(401).json({ error: "Unauthorized" });
};
