import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx | ActionCtx;

export type CurrentUser = {
  _id: string;
  id: string;
  tokenIdentifier: string;
  subject: string;
  issuer: string;
  email?: string;
  name?: string;
  pictureUrl?: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function safeGetAuthUser(ctx: AuthCtx): Promise<CurrentUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const tokenIdentifier =
    optionalString(identity.tokenIdentifier) ??
    `${identity.issuer}|${identity.subject}`;
  const email = optionalString(identity.email);

  return {
    _id: tokenIdentifier,
    id: tokenIdentifier,
    tokenIdentifier,
    subject: identity.subject,
    issuer: identity.issuer,
    email,
    name: optionalString(identity.name) ?? email,
    pictureUrl: optionalString(identity.pictureUrl),
  };
}

export async function getAuthUser(ctx: AuthCtx) {
  const user = await safeGetAuthUser(ctx);
  if (!user) throw new Error("Unauthenticated");
  return user;
}
