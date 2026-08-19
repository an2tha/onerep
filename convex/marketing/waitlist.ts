/**
 * The mobile waitlist: one public endpoint, one table, no session.
 *
 * The marketing site ships no JavaScript, so this has to work as a plain HTML
 * form post. That constrains everything below: the body arrives as
 * `application/x-www-form-urlencoded`, and the answer has to be a redirect,
 * because the browser is going to render whatever comes back.
 */
import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/** Where the browser lands afterwards. Overridable for a staging site. */
const SITE = process.env.MARKETING_SITE_URL ?? "https://onerep.life";

/** Long enough for any real address, short enough to not be a payload. */
const MAX_EMAIL = 254;

const PLATFORMS = new Set(["ios", "android", "either"]);

/**
 * Deliberately not RFC 5322. An address that passes this and does not exist
 * costs nothing; a regex that rejects a real one costs a signup.
 */
function looksLikeEmail(value: string) {
  return (
    value.length > 3 &&
    value.length <= MAX_EMAIL &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export const add = internalMutation({
  args: {
    email: v.string(),
    platform: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    // Signing up twice is a thing people do; it should not create two rows or
    // report an error at somebody trying to be helpful.
    const existing = await ctx.db
      .query("mobileWaitlist")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { platform: args.platform });
      return;
    }
    await ctx.db.insert("mobileWaitlist", { ...args, createdAt: Date.now() });
  },
});

function seeOther(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: `${SITE}${path}` },
  });
}

export const submit = httpAction(async (ctx, request) => {
  const form = await request.formData();

  // Honeypot. A field no human sees and every naive bot fills in. Answered with
  // the success page rather than an error, so the bot has nothing to learn.
  if (String(form.get("company") ?? "").length > 0) {
    return seeOther("/waitlist/confirmed");
  }

  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_EMAIL);
  if (!looksLikeEmail(email)) {
    // Straight back to the form. There is no JavaScript to render a field
    // error, and an error page for a typo is a worse trade than a second try.
    return seeOther("/#waitlist");
  }

  const rawPlatform = String(form.get("platform") ?? "either");
  const platform = PLATFORMS.has(rawPlatform) ? rawPlatform : "either";
  const source = String(form.get("source") ?? "site").slice(0, 64);

  await ctx.runMutation(internal.marketing.waitlist.add, {
    email,
    platform,
    source,
  });
  return seeOther("/waitlist/confirmed");
});
