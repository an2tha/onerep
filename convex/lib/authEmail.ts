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

/**
 * Copy per kind. Written like a short letter, not a product announcement:
 * no logo lockup, no uppercase label, one sentence of context, one action.
 */
function authEmailCopy(kind: AuthEmailKind, name?: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";
  if (kind === "verification") {
    return {
      subject: "Confirm your OneRep email",
      title: "Confirm your email",
      preview: "One tap and your OneRep account is done.",
      greeting,
      body: "Someone typed this address into OneRep — presumably you. Confirm it and the account is yours.",
      action: "Confirm email",
      aside:
        "The link works for an hour. If you didn't sign up for OneRep, ignore this and nothing happens.",
    };
  }
  return {
    subject: "Reset your OneRep password",
    title: "Reset your password",
    preview: "Use this link to choose a new password.",
    greeting,
    body: "Someone — hopefully you — asked to reset the password on your OneRep account. This link lets you choose a new one.",
    action: "Choose a new password",
    aside:
      "The link works for an hour and signs out every other session once used. If you didn't ask for this, your password is unchanged — delete this email and move on.",
  };
}

export function authEmailHtml({ kind, name, url }: AuthEmail) {
  const copy = authEmailCopy(kind, name);
  const safeUrl = escapeHtml(url);

  // A letter, not a marketing card: one narrow column of text on the page
  // background, a single dark button, and a quiet footer. No images — a
  // blocked logo renders as a broken box and adds nothing here.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${copy.title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f0;color:#171714;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${copy.preview}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f0"><tr><td align="center" style="padding:48px 20px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:460px;text-align:left">
<tr><td style="padding-bottom:28px;font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#171714">OneRep</td></tr>
<tr><td style="font-size:21px;font-weight:700;letter-spacing:-0.01em;line-height:1.3;padding-bottom:14px">${copy.title}</td></tr>
<tr><td style="font-size:15px;line-height:1.65;color:#3d3d38;padding-bottom:6px">${escapeHtml(copy.greeting)}</td></tr>
<tr><td style="font-size:15px;line-height:1.65;color:#3d3d38;padding-bottom:26px">${copy.body}</td></tr>
<tr><td style="padding-bottom:26px"><a href="${safeUrl}" style="display:inline-block;background:#171714;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:10px">${copy.action}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#77776f;padding-bottom:22px">${copy.aside}</td></tr>
<tr><td style="border-top:1px solid #deded8;padding-top:18px;font-size:12px;line-height:1.6;color:#8f8f86">If the button does nothing, paste this into your browser:<br><a href="${safeUrl}" style="color:#8f8f86;word-break:break-all">${safeUrl}</a></td></tr>
</table>
</td></tr></table></body></html>`;
}

/** Plain-text alternative — better deliverability, honest fallback. */
export function authEmailText({ kind, name, url }: AuthEmail) {
  const copy = authEmailCopy(kind, name);
  return [
    copy.title,
    "",
    copy.greeting,
    copy.body,
    "",
    `${copy.action}: ${url}`,
    "",
    copy.aside,
    "",
    "— OneRep",
  ].join("\n");
}

// ── diary invite ──────────────────────────────────────────────────────────────

type DiaryInviteEmail = {
  to: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  acceptUrl: string;
};

export function diaryInviteEmailCopy({
  ownerName,
  ownerEmail,
}: Pick<DiaryInviteEmail, "ownerName" | "ownerEmail">) {
  const who = ownerName?.trim() || ownerEmail?.trim() || "Someone you know";
  return {
    subject: `${who} shared their OneRep food diary with you`,
    title: "You've been given a diary to read",
    preview: `${who} wants you to see what they eat. Their idea, not ours.`,
    body: `${who} is sharing their OneRep food diary with you — read-only, on their terms, revocable whenever they like. Open the invitation to accept or decline it.`,
    action: "See the invitation",
    aside:
      "You'll need a OneRep account on this email address. If you don't know who this is, ignore it and the invitation quietly expires from relevance.",
  };
}

export function diaryInviteEmailHtml(email: DiaryInviteEmail) {
  const copy = diaryInviteEmailCopy(email);
  const safeUrl = escapeHtml(email.acceptUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${escapeHtml(copy.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f0;color:#171714;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(copy.preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f0"><tr><td align="center" style="padding:48px 20px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:460px;text-align:left">
<tr><td style="padding-bottom:28px;font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#171714">OneRep</td></tr>
<tr><td style="font-size:21px;font-weight:700;letter-spacing:-0.01em;line-height:1.3;padding-bottom:14px">${escapeHtml(copy.title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.65;color:#3d3d38;padding-bottom:26px">${escapeHtml(copy.body)}</td></tr>
<tr><td style="padding-bottom:26px"><a href="${safeUrl}" style="display:inline-block;background:#171714;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(copy.action)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#77776f;padding-bottom:22px">${escapeHtml(copy.aside)}</td></tr>
<tr><td style="border-top:1px solid #deded8;padding-top:18px;font-size:12px;line-height:1.6;color:#8f8f86">If the button does nothing, paste this into your browser:<br><a href="${safeUrl}" style="color:#8f8f86;word-break:break-all">${safeUrl}</a></td></tr>
</table>
</td></tr></table></body></html>`;
}

export function diaryInviteEmailText(email: DiaryInviteEmail) {
  const copy = diaryInviteEmailCopy(email);
  return [
    copy.title,
    "",
    copy.body,
    "",
    `${copy.action}: ${email.acceptUrl}`,
    "",
    copy.aside,
    "",
    "— OneRep",
  ].join("\n");
}

/**
 * Best-effort, unlike the auth emails: an invite already works through the
 * in-app link and the invitee's /shared list, so a missing key or a Resend
 * outage must not fail the mutation that created it.
 */
export async function sendDiaryInviteEmail(email: DiaryInviteEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const copy = diaryInviteEmailCopy(email);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM || "OneRep <support@onerep.life>",
      to: [email.to],
      subject: copy.subject,
      html: diaryInviteEmailHtml(email),
      text: diaryInviteEmailText(email),
    }),
  });
  return response.ok;
}

export async function sendAuthEmail(email: AuthEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const copy = authEmailCopy(email.kind, email.name);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM || "OneRep <support@onerep.life>",
      to: [email.to],
      subject: copy.subject,
      html: authEmailHtml(email),
      text: authEmailText(email),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status})`);
  }
}
