import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalAction, query } from "./_generated/server";
import { betterAuth } from "better-auth";
import authConfig from "./auth.config";

// Primary app origin — set SITE_URL in Convex env vars / .env.local
const siteUrl = process.env.SITE_URL ?? "https://app.onerep.life";
const authBaseUrl = process.env.BETTER_AUTH_URL ?? process.env.CONVEX_SITE_URL;
const authSecret =
  process.env.BETTER_AUTH_SECRET ??
  process.env.AUTH_SECRET ??
  (process.env.VITEST || process.env.NODE_ENV === "test"
    ? "test-better-auth-secret-12345678901234567890"
    : undefined);

if (!authSecret) {
  throw new Error(
    "BETTER_AUTH_SECRET or AUTH_SECRET must be set for Better Auth. Generate one with `openssl rand -base64 32` and set it in Convex env vars.",
  );
}

const localWebOrigins = Array.from({ length: 18 }, (_, index) => {
  const port = 5173 + index;
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}).flat();

// All origins the client may run from:
//   • Vite dev server (web, including fallback ports when 5173 is busy)
//   • Capacitor iOS  (capacitor://localhost)
//   • Capacitor Android (http://localhost)
const trustedOrigins = [
  siteUrl,
  "https://app.onerep.life",
  "https://onerep.life",
  ...localWebOrigins,
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
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Auth email is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Resend email failed", {
      status: response.status,
      body,
    });
    throw new Error("Failed to send auth email");
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function renderAuthEmail({
  title,
  preview,
  body,
  actionLabel,
  actionUrl,
  footer,
}: {
  title: string;
  preview: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  footer: string;
}) {
  const safeTitle = escapeHtml(title);
  const safePreview = escapeHtml(preview);
  const safeBody = escapeHtml(body);
  const safeActionLabel = escapeHtml(actionLabel);
  const safeActionUrl = escapeHtml(actionUrl);
  const safeFooter = escapeHtml(footer);
  const iconUrl = escapeHtml(`${siteUrl}/icon-192.png`);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;background:#f7f8f5;color:#151712;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreview}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f8f5;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:440px;border:1px solid #dde0d8;border-radius:28px;background:#ffffff;box-shadow:0 24px 70px rgba(15,23,42,0.08);overflow:hidden;">
            <tr>
              <td style="padding:24px 22px 22px;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                  <tr>
                    <td style="padding-right:10px;">
                      <img src="${iconUrl}" width="34" height="34" alt="" style="display:block;border-radius:999px;" />
                    </td>
                    <td style="font-size:14px;font-weight:700;letter-spacing:-0.01em;color:#151712;">OneRep</td>
                  </tr>
                </table>
                <p style="margin:0 0 10px;font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#7a7f72;">Account</p>
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.08;font-weight:760;letter-spacing:-0.03em;color:#151712;">${safeTitle}</h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.55;font-weight:520;color:#5c6256;">${safeBody}</p>
                <a href="${safeActionUrl}" style="display:block;border-radius:22px;background:#151712;color:#ffffff;text-decoration:none;text-align:center;padding:15px 18px;font-size:15px;font-weight:760;letter-spacing:-0.01em;">${safeActionLabel}</a>
                <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#7a7f72;">If the button does not open, paste this link into your browser:<br /><a href="${safeActionUrl}" style="color:#151712;word-break:break-all;">${safeActionUrl}</a></p>
              </td>
            </tr>
          </table>
          <p style="max-width:420px;margin:18px auto 0;font-size:12px;line-height:1.5;color:#8a8f83;">${safeFooter}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: authBaseUrl,
    secret: authSecret,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        if (!user.email) return;
        await sendEmail({
          to: user.email,
          subject: "Reset your OneRep password",
          text: `Reset your OneRep password here:\n\n${url}\n\nIf you did not ask for this, ignore this email.`,
          html: renderAuthEmail({
            title: "Reset your password.",
            preview: "Use this OneRep link to choose a new password.",
            body: "Use this secure link to choose a new OneRep password. It expires in one hour.",
            actionLabel: "Reset password",
            actionUrl: url,
            footer:
              "If you did not request a password reset, you can ignore this email.",
          }),
        });
      },
    },
    emailVerification: {
      sendOnSignIn: true,
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        if (!user.email) return;
        await sendEmail({
          to: user.email,
          subject: "Verify your OneRep email",
          text: `Verify your OneRep email here:\n\n${url}\n\nIf you did not create a OneRep account, ignore this email.`,
          html: renderAuthEmail({
            title: "Verify your email.",
            preview: "Confirm this email address for your OneRep account.",
            body: "Confirm this email address so your OneRep account stays private and recoverable.",
            actionLabel: "Verify email",
            actionUrl: url,
            footer:
              "If you did not create a OneRep account, you can ignore this email.",
          }),
        });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});

export const rotateAuthKeys = internalAction({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx);
    const jwks = await auth.api.rotateKeys();
    return {
      rotated: true,
      keyCount: Array.isArray(jwks) ? jwks.length : 0,
    };
  },
});
