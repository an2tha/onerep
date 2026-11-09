// Pages serves the console at / and reuses OneRep's existing sign-in pages.
import { cpSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
const dist = path.resolve("apps/mobile/dist");
const out = path.resolve(process.argv[2]);
mkdirSync(out, { recursive: true });
for (const name of [
  "assets",
  "sdk",
  "licenses",
  "developers.html",
  "app-icon.svg",
  "favicon.svg",
  "favicon.ico",
  "_headers",
]) {
  cpSync(path.join(dist, name), path.join(out, name), { recursive: true });
}
cpSync(path.join(dist, "developer-home.html"), path.join(out, "index.html"));
// Pages exposes each .html file at its extensionless URL. React Router must
// see /login and /sso-callback throughout the authentication handoff.
for (const route of ["login", "sso-callback", "verify-email-required", "email-verified", "reset-password", "onboarding"]) {
  cpSync(path.join(dist, "index.html"), path.join(out, route + ".html"));
}
appendFileSync(path.join(out, "_headers"), "\n/*\n  Content-Security-Policy: frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n");
