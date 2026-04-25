import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the x-api-key header against the configured DATA_API_KEY.
 * Uses timing-safe comparison to prevent timing attacks.
 * Allows bypass if INDEV environment variable is set to "true".
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.INDEV === "true") {
    return next();
  }

  const apiKey = req.headers["x-api-key"] as string;
  const expectedKey = process.env.DATA_API_KEY;

  if (!expectedKey) {
    console.error("[AUTH] DATA_API_KEY not configured");
    return res.status(500).json({ error: "Internal server error" });
  }

  if (!apiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const apiKeyBuffer = Buffer.from(apiKey);
    const expectedKeyBuffer = Buffer.from(expectedKey);

    // timingSafeEqual requires buffers of the same length
    if (apiKeyBuffer.length !== expectedKeyBuffer.length) {
      // Perform a dummy comparison to maintain consistent timing
      crypto.timingSafeEqual(apiKeyBuffer, apiKeyBuffer);
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (crypto.timingSafeEqual(apiKeyBuffer, expectedKeyBuffer)) {
      return next();
    }
  } catch (err) {
    // Log the actual error internally, but return generic response
    console.error("[AUTH] Error validating API key:", err);
  }

  return res.status(401).json({ error: "Unauthorized" });
};
