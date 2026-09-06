import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import authConfig from "../auth.config";
import { sendAuthEmail } from "./authEmail";

type AuthCtx = QueryCtx | MutationCtx | ActionCtx;
export const authComponent = createClient<DataModel>(components.betterAuth);
const siteUrl = process.env.SITE_URL?.trim() || "https://app.onerep.life";
const convexSiteUrl = process.env.CONVEX_SITE_URL!;
export const trustedOrigins = Array.from(
  new Set(
    [
      siteUrl,
      "https://onerep-mobile.pages.dev",
      "https://app.onerep.life",
      "https://onerep-mobile-latest.onrender.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5177",
      "http://127.0.0.1:5177",
      "capacitor://localhost",
      "onerep://auth",
      "http://localhost",
      "https://localhost",
    ].filter((origin) => origin.trim().length > 0),
  ),
);

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

/**
 * Google sign-in only exists when both credentials are set, so a deployment
 * without them keeps working on email and password instead of offering a
 * button that can only fail.
 */
export const googleAuthConfigured = Boolean(
  googleClientId && googleClientSecret,
);

const appleClientId = process.env.APPLE_CLIENT_ID?.trim();
const appleClientSecret = process.env.APPLE_CLIENT_SECRET?.trim();
const appleBundleId = process.env.APPLE_APP_BUNDLE_IDENTIFIER?.trim();

/**
 * Same bargain as Google. Apple wants a Services ID and a client secret that
 * is really a signed JWT with a six month life, so a deployment that has not
 * minted one keeps the button off screen rather than sending people into a
 * dead end. The bundle id is separate and optional: it only matters when an
 * identity token comes from the iOS app itself, and it has to be listed as an
 * audience or Apple's token will not validate.
 */
export const appleAuthConfigured = Boolean(appleClientId && appleClientSecret);

const oidcClientId = process.env.OIDC_CLIENT_ID?.trim();
const oidcClientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
const oidcIssuer = process.env.OIDC_ISSUER?.trim()?.replace(/\/+$/, "");

/**
 * Generic OpenID Connect sign-in for self-hosters who already run an identity
 * provider (Authentik, Keycloak, Pocket ID, ...). Same rule as Google: no
 * credentials, no button. The issuer must serve the standard
 * /.well-known/openid-configuration discovery document.
 */
export const oidcAuthConfigured = Boolean(
  oidcClientId && oidcClientSecret && oidcIssuer,
);

/** Label the login button shows, e.g. "Continue with Authentik". */
export const oidcProviderName = process.env.OIDC_PROVIDER_NAME?.trim() || "SSO";

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

// Verification is opt-in: a fresh deployment has no Resend key, and requiring
// a verification email nobody can send would lock every new account out at
// the door. Production sets EMAIL_VERIFICATION_REQUIRED=true.
const emailVerificationRequired =
  process.env.EMAIL_VERIFICATION_REQUIRED === "true";

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const options = {
    appName: "OneRep",
    baseURL: convexSiteUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: emailVerificationRequired,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail({
          kind: "password-reset",
          to: user.email,
          name: user.name,
          url,
        });
      },
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: emailVerificationRequired,
      sendOnSignIn: emailVerificationRequired,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail({
          kind: "verification",
          to: user.email,
          name: user.name,
          url,
        });
      },
    },
    socialProviders: {
      ...(googleAuthConfigured
        ? {
            google: {
              clientId: googleClientId!,
              clientSecret: googleClientSecret!,
              prompt: "select_account",
            },
          }
        : {}),
      ...(appleAuthConfigured
        ? {
            apple: {
              clientId: appleClientId!,
              clientSecret: appleClientSecret!,
              // Apple only returns a name and email on the very first consent,
              // and only if we ask for them by name.
              scope: ["name", "email"],
              ...(appleBundleId
                ? {
                    appBundleIdentifier: appleBundleId,
                    audience: [appleClientId!, appleBundleId],
                  }
                : {}),
            },
          }
        : {}),
    },
    account: {
      accountLinking: {
        // Google verifies the address it hands us, so an existing email and
        // password account keeps its user id (and everything keyed by it)
        // instead of forking into a second account.
        enabled: true,
        // The OIDC issuer is configured by whoever runs the deployment, so an
        // email it asserts is trusted the same way Google's is.
        // Apple verifies the address it asserts too, private relay included.
        trustedProviders: [
          "google",
          ...(appleAuthConfigured ? ["apple" as const] : []),
          ...(oidcAuthConfigured ? ["oidc"] : []),
        ],
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        /**
         * The rest of the account, once the login is gone.
         *
         * Better Auth's own `deleteUser` clears the component's `session`,
         * `account` and `user` rows, and stops there — everything OneRep
         * stores lives in app tables it has never heard of. Those used to be
         * the client's job, wiped in a loop before this endpoint was even
         * called, which put the destructive half first and the half that
         * could fail second. Here it runs after, server side, and cannot be
         * abandoned halfway by a phone that locked.
         *
         * `afterDelete` rather than `beforeDelete` on purpose: a purge that
         * ran and then watched the deletion fail would be the same bug wearing
         * a different hat.
         *
         * The id is Convex's token identifier, `issuer|subject`, which is what
         * `safeGetAuthUser` writes onto every row. The issuer is this
         * deployment's site URL and the subject is Better Auth's user id, so
         * the two halves are both already here.
         */
        afterDelete: async (user) => {
          // Queries have no scheduler. Deletion only ever arrives through the
          // HTTP action that serves the auth routes, and an action context
          // carries both a scheduler and runMutation, so this is a type guard
          // rather than a real branch.
          if (!("scheduler" in ctx)) return;
          // Scheduled, not awaited inline: the purge self-reschedules in
          // batches, so it outlives this request no matter how many rows the
          // account owns. Awaiting it here would hold the response open and
          // let a heavy account turn a completed deletion into a timeout.
          try {
            await ctx.scheduler.runAfter(
              0,
              internal.users.users.purgeDeletedUserData,
              { userId: `${convexSiteUrl}|${user.id}` },
            );
          } catch (error) {
            // The login, its OAuth links and its sessions are already gone at
            // this point. Throwing would turn a completed deletion into a
            // client-visible failure and strand the user on an error toast
            // for an account that no longer exists, so log loudly instead.
            console.error("Failed to schedule purgeDeletedUserData", error);
          }
        },
      },
    },
    // Account deletion, and only account deletion, turns on this dial.
    //
    // `/delete-user` takes a password instead of a fresh session, and falls
    // back to demanding one when no password is sent. Better Auth's default
    // freshness window is 24 hours, so a session older than that gets
    // SESSION_EXPIRED. Someone who signed in with Google or Apple has no
    // credential account and therefore no password to send — sending one
    // earns CREDENTIAL_ACCOUNT_NOT_FOUND — which left them with no way at all
    // to delete their account the day after they signed in. Apple requires
    // that path to work, and it was silently dead.
    //
    // The two endpoints that read freshness through the other middleware are
    // /unlink-account and /list-sessions, and this app calls neither. What
    // still guards deletion: a valid session, and the word DELETE typed by
    // hand in Settings.
    session: {
      freshAge: 0,
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
      ...(oidcAuthConfigured
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "oidc",
                  clientId: oidcClientId!,
                  clientSecret: oidcClientSecret!,
                  discoveryUrl: `${oidcIssuer}/.well-known/openid-configuration`,
                  scopes: ["openid", "profile", "email"],
                  pkce: true,
                },
              ],
            }),
          ]
        : []),
    ],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
};

export async function safeGetAuthUser(
  ctx: AuthCtx,
): Promise<CurrentUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const tokenIdentifier =
    optionalString(identity.tokenIdentifier) ??
    `${identity.issuer}|${identity.subject}`;
  const email = optionalString(identity.email);

  return {
    _id: tokenIdentifier,
    id: identity.subject,
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
