import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Middleware to validate the API key provided in the 'x-api-key' header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = process.env.DATA_API_KEY;
  const requestKey = req.headers["x-api-key"] as string;

  // Allow bypass in development mode
  if (process.env.NODE_ENV === "development" || process.env.INDEV === "true") {
    return next();
  }

  if (!apiKey) {
    console.error("[ERROR] DATA_API_KEY is not set in environment variables");
    // Return generic error to avoid leaking configuration issues to clients
    return res.status(500).json({ error: "Internal server error" });
  }

  if (!requestKey) {
    return res.status(401).json({ error: "Unauthorized: Missing API key" });
  }

  try {
    const apiKeyBuffer = Buffer.from(apiKey);
    const requestKeyBuffer = Buffer.from(requestKey);

    // timingSafeEqual requires buffers of the same length.
    // To prevent length leaking, we could pad them, but for standard API keys,
    // comparing lengths first is a common trade-off.
    // We use a double-HMAC or fixed-length comparison if absolute length secrecy is needed.
    if (apiKeyBuffer.length === requestKeyBuffer.length &&
        crypto.timingSafeEqual(apiKeyBuffer, requestKeyBuffer)) {
      return next();
    }
  } catch (error) {
    console.error("[ERROR] API key validation error:", error);
  }

  return res.status(401).json({ error: "Unauthorized: Invalid API key" });
};
