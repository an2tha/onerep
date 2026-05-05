import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.DATA_API_KEY;

  // Bypass authentication in development mode if explicitly requested
  if (process.env.NODE_ENV === "development" || process.env.INDEV === "true") {
    return next();
  }

  if (!expectedKey) {
    console.error("[AUTH] DATA_API_KEY is not configured in environment");
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
    // Fallback if buffers have different lengths or other issues
  }

  return res.status(401).json({ error: "Unauthorized: Invalid API key" });
};
