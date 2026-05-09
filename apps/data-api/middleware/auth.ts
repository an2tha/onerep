import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the x-api-key header.
 * Performs a timing-safe comparison against the DATA_API_KEY environment variable.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Allow bypass in development if specified
  if (process.env.INDEV === "true" || process.env.NODE_ENV === "development") {
    return next();
  }

  const apiKey = process.env.DATA_API_KEY;
  if (!apiKey) {
    console.error("[AUTH] DATA_API_KEY not configured in environment");
    return res.status(500).json({ error: "Internal server error" });
  }

  const providedKey = req.headers["x-api-key"];
  if (!providedKey || typeof providedKey !== "string") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const keyBuffer = Buffer.from(apiKey);
    const providedBuffer = Buffer.from(providedKey);

    if (keyBuffer.length !== providedBuffer.length) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (crypto.timingSafeEqual(keyBuffer, providedBuffer)) {
      return next();
    }
  } catch (err) {
    console.error("[AUTH] Error during key validation:", err);
  }

  return res.status(401).json({ error: "Unauthorized" });
};
