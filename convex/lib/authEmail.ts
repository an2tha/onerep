type AuthEmailKind = "verification" | "password-reset";

type AuthEmail = {
  kind: AuthEmailKind;
  to: string;
  name?: string | null;
  url: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function authEmailHtml({ kind, name, url }: AuthEmail) {
  const isVerification = kind === "verification";
  const title = isVerification ? "Confirm your email" : "Reset your password";
  const preview = isVerification
    ? "Confirm your email to finish setting up OneRep."
    : "Use this secure link to choose a new OneRep password.";
  const action = isVerification ? "Confirm email" : "Reset password";
  const safeName = escapeHtml(name?.trim() || "there");
  const safeUrl = escapeHtml(url);
  const logoUrl = escapeHtml(
    process.env.AUTH_EMAIL_LOGO_URL || "https://app.onerep.life/app-icon.svg",
  );

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="margin:0;background:#f4f4f0;color:#171714;font-family:Inter,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${preview}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f0;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #deded8;border-radius:20px;overflow:hidden">
<tr><td style="padding:30px 34px 12px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td><img src="${logoUrl}" width="38" height="38" alt="OneRep" style="display:block;border-radius:10px"></td><td style="padding-left:12px;font-size:20px;font-weight:700">OneRep</td></tr></table></td></tr>
<tr><td style="padding:22px 34px 34px"><p style="margin:0 0 10px;color:#696961;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Account security</p><h1 style="margin:0 0 16px;font-size:30px;line-height:1.15">${title}</h1><p style="margin:0 0 24px;color:#55554f;font-size:16px;line-height:1.6">Hi ${safeName}, ${isVerification ? "confirm that this email belongs to you to finish creating your OneRep account." : "we received a request to change your OneRep password. Use the secure link below to continue."}</p>
<a href="${safeUrl}" style="display:inline-block;background:#171714;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 22px;border-radius:12px">${action}</a>
<p style="margin:26px 0 0;color:#77776f;font-size:13px;line-height:1.6">This link expires in one hour. If you didn’t request this, you can safely ignore this email.</p><p style="margin:14px 0 0;color:#77776f;font-size:12px;line-height:1.5;word-break:break-all">Button not working? ${safeUrl}</p></td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendAuthEmail(email: AuthEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const subject =
    email.kind === "verification"
      ? "Confirm your OneRep email"
      : "Reset your OneRep password";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM || "OneRep <support@onerep.life>",
      to: [email.to],
      subject,
      html: authEmailHtml(email),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status})`);
  }
}
