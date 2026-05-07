import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-api-key"] as string;
  const expectedApiKey = process.env.DATA_API_KEY;

  if (!expectedApiKey) {
    console.error("[CRITICAL] DATA_API_KEY is not set in environment variables");
    return res.status(500).json({ error: "Internal server error" });
  }

  // Allow bypassing in development if INDEV is true
  if (process.env.INDEV === "true" || process.env.NODE_ENV === "development") {
    return next();
  }

  if (!apiKey) {
    return res.status(401).json({ error: "Unauthorized: API key required" });
  }

  try {
    const apiKeyBuffer = Buffer.from(apiKey);
    const expectedApiKeyBuffer = Buffer.from(expectedApiKey);

    if (apiKeyBuffer.length !== expectedApiKeyBuffer.length) {
      return res.status(401).json({ error: "Unauthorized: Invalid API key" });
    }

    if (crypto.timingSafeEqual(apiKeyBuffer, expectedApiKeyBuffer)) {
      return next();
    }
  } catch (err) {
    // Fallback if Buffer.from fails or other errors
  }

  res.status(401).json({ error: "Unauthorized: Invalid API key" });
};
