import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth/minimal";
import authConfig from "./auth.config";

// Primary app origin — set SITE_URL in Convex env vars / .env.local
const siteUrl = process.env.SITE_URL ?? "https://app.onerep.life";

// All origins the client may run from:
//   • Vite dev server (web)
//   • Capacitor iOS  (capacitor://localhost)
//   • Capacitor Android (http://localhost)
const trustedOrigins = [
  siteUrl,
  "https://app.onerep.life",
  "https://onerep.life",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "capacitor://localhost",
  "http://localhost",
].filter((o, i, arr) => o && arr.indexOf(o) === i); // unique, non-empty

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Password reset email is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) throw new Error("Failed to send password reset email");
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        if (!user.email) return;
        await sendEmail({
          to: user.email,
          subject: "Reset your OneRep password",
          text: `Reset your OneRep password here:\n\n${url}\n\nIf you did not ask for this, ignore this email.`,
        });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});
