/**
 * Mints APPLE_CLIENT_SECRET for Sign in with Apple.
 *
 * Apple's "client secret" is not a secret they issue — it is a short-lived
 * ES256 JWT you sign with the .p8 key from the developer portal, and it dies
 * after six months whether or not anyone is paying attention. When it dies the
 * login button stops working with `invalid_client` and no other explanation,
 * so this script exists to be run again in six months by someone who has
 * forgotten every detail of today.
 *
 *   bun scripts/mint-apple-client-secret.ts ~/Downloads/AuthKey_ABC1234DEF.p8
 *
 * Prints the JWT. Pipe it straight into convex, or read it and despair.
 */

const APPLE_AUDIENCE = "https://appleid.apple.com"
const TEAM_ID = process.env.APPLE_TEAM_ID?.trim() || "4DURGSKS8J"
const SERVICES_ID =
  process.env.APPLE_CLIENT_ID?.trim() || "com.ananthh.onerep-apple-oauth"

/** Apple's ceiling is six months. Anything longer is rejected outright. */
const LIFETIME_SECONDS = 60 * 60 * 24 * 180

const keyPath = process.argv[2]
if (!keyPath) {
  console.error(
    "usage: bun scripts/mint-apple-client-secret.ts <path to AuthKey_*.p8>",
  )
  process.exit(1)
}

/**
 * The Key ID lives in the filename and nowhere else inside the key, which is
 * Apple's idea of metadata. `AuthKey_ABC1234DEF.p8` -> `ABC1234DEF`.
 */
const keyId =
  process.env.APPLE_KEY_ID?.trim() ||
  keyPath.match(/AuthKey_([A-Z0-9]+)\.p8$/i)?.[1]

if (!keyId) {
  console.error(
    "Could not read the Key ID off the filename. Keep Apple's original name, or set APPLE_KEY_ID.",
  )
  process.exit(1)
}

const pem = await Bun.file(keyPath).text()

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

const encode = (value: unknown) =>
  base64url(new TextEncoder().encode(JSON.stringify(value)))

const der = Uint8Array.from(
  atob(pem.replace(/-----[^-]+-----|\s/g, "")),
  (character) => character.charCodeAt(0),
)

const key = await crypto.subtle.importKey(
  "pkcs8",
  der,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"],
)

const issuedAt = Math.floor(Date.now() / 1000)
const expiresAt = issuedAt + LIFETIME_SECONDS

const body = [
  encode({ alg: "ES256", kid: keyId }),
  encode({
    iss: TEAM_ID,
    iat: issuedAt,
    exp: expiresAt,
    aud: APPLE_AUDIENCE,
    sub: SERVICES_ID,
  }),
].join(".")

const signature = await crypto.subtle.sign(
  { name: "ECDSA", hash: "SHA-256" },
  key,
  new TextEncoder().encode(body),
)

console.log(`${body}.${base64url(new Uint8Array(signature))}`)
console.error(
  `\nsub ${SERVICES_ID} · iss ${TEAM_ID} · kid ${keyId}\nexpires ${new Date(expiresAt * 1000).toISOString().slice(0, 10)} — set a reminder, Apple will not.\n`,
)
