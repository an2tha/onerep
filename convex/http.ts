import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

const LOCAL_WEB_ORIGINS = Array.from({ length: 18 }, (_, index) => {
  const port = 5173 + index;
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}).flat();

// Trusted client origins — keep in sync with auth.ts trustedOrigins.
// These are passed explicitly so CORS works even if the staticAuth context
// hasn't fully initialised when the first request arrives.
const ALLOWED_ORIGINS = [
  process.env.SITE_URL ?? "https://app.onerep.life",
  "https://app.onerep.life",
  "https://onerep.life",
  ...LOCAL_WEB_ORIGINS,
  "capacitor://localhost", // iOS Capacitor
  "http://localhost", // Android Capacitor
];

// Better Auth routes (sign-in, sign-up, get-session, etc.)
authComponent.registerRoutes(http, createAuth, {
  cors: { allowedOrigins: ALLOWED_ORIGINS },
});

export default http;
