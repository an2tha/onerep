import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Trusted client origins — keep in sync with auth.ts trustedOrigins.
// These are passed explicitly so CORS works even if the staticAuth context
// hasn't fully initialised when the first request arrives.
const ALLOWED_ORIGINS = [
  process.env.SITE_URL ?? "https://app.onerep.life",
  "https://app.onerep.life",
  "https://onerep.life",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "capacitor://localhost", // iOS Capacitor
  "http://localhost", // Android Capacitor
];

// Better Auth routes (sign-in, sign-up, get-session, etc.)
authComponent.registerRoutes(http, createAuth, {
  cors: { allowedOrigins: ALLOWED_ORIGINS },
});

export default http;
