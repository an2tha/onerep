import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import authConfig from "../auth.config";

type AuthCtx = QueryCtx | MutationCtx | ActionCtx;
export const authComponent = createClient<DataModel>(components.betterAuth);
const siteUrl = process.env.SITE_URL!;
const convexSiteUrl = process.env.CONVEX_SITE_URL!;
export const trustedOrigins = [
  siteUrl,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5177",
  "http://127.0.0.1:5177",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
];

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

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const options = {
    appName: "OneRep",
    baseURL: convexSiteUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
    ],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
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
