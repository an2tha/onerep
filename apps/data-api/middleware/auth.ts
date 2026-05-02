import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the API key for protected routes.
 *
 * Compares the 'x-api-key' header against the 'DATA_API_KEY' environment variable
 * using a timing-safe comparison to prevent side-channel attacks.
 *
 * Bypasses validation if INDEV=true or NODE_ENV=development.
 * Fails with 500 if DATA_API_KEY is not configured in the environment.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const isDev = process.env.INDEV === "true" || process.env.NODE_ENV === "development";
  if (isDev) {
    return next();
  }

  const apiKey = process.env.DATA_API_KEY;
  if (!apiKey) {
    console.error("[ERR] DATA_API_KEY is not set in environment");
    return res.status(500).json({ error: "Internal server error" });
  }

  const providedKey = req.headers["x-api-key"];

  if (typeof providedKey !== "string") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Use timingSafeEqual to prevent timing attacks
    const keyBuffer = Buffer.from(apiKey);
    const providedBuffer = Buffer.from(providedKey);

    if (keyBuffer.length !== providedBuffer.length) {
      // Even if lengths differ, we should ideally spend similar time,
      // but timingSafeEqual requires equal length.
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (crypto.timingSafeEqual(keyBuffer, providedBuffer)) {
      return next();
    }
  } catch (err) {
    console.error("[ERR] API key validation error:", err);
  }

  return res.status(401).json({ error: "Unauthorized" });
};
