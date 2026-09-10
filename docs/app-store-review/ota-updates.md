# OneRep web-bundle update policy

This document is both the operator policy and the text to disclose to App
Review. It applies to the iOS and Android Capacitor applications.

## App Review Notes

OneRep includes a web-bundle repair mechanism implemented with
`@capgo/capacitor-updater`. The mechanism is enabled in this review build and
is not enabled or altered based on reviewer identity, account, location, or
approval state.

The app checks the following first-party endpoint for a release signed by a
key whose public half is embedded in the native application:

`https://app.onerep.life/ota/channels/ios/<native-version>/manifest.json`

The channel is restricted to copy/content updates, security repairs, and bug
fixes that restore functionality already present in the reviewed app. It is
not used to introduce screens, product capabilities, payments, subscriptions,
permissions, entitlements, native plugins, HealthKit behavior, or new uses of
native APIs. Those changes are submitted in a new App Store binary.

The native shell verifies the RSA-SHA256 manifest signature before JavaScript
parses it. The manifest pins the source range, release classification, reviewed
feature set, native API level, exact compatible native version, artifact
SHA-256, and rollout percentage. Updates are staged and apply only after an
explicit Update action or a later cold launch. A failed launch rolls back to
the previous bundle. Installing a new App Store version clears downloaded web
bundles and restores its reviewed built-in bundle.

Reviewers can inspect the currently active and staged bundle versions in the
app's About screen under update diagnostics. A demo account supplied in App
Store Connect has access to the same mechanism as every production account.

## Permitted release matrix

| Change | Delivery path |
| --- | --- |
| Copy, translations, static content, remote data | Content/config or OTA |
| CSS/layout correction | OTA `content` or `bugfix` |
| JavaScript repair restoring reviewed behavior | OTA `bugfix` |
| Emergency security repair | OTA `security` plus immediate store submission |
| New screen, workflow, route, or product capability | Store release |
| Native code, plugin, configuration, entitlement, or permission | Store release |
| Billing, subscription, HealthKit/writeback, or new native bridge use | Store release |

When uncertain, use a store release.

## Release procedure

1. Configure the GitHub `ota-production` environment with required reviewers
   (environment protection rules need a Team plan; until then the manual
   dispatch with its explicit inputs is the human gate, and the environment
   still scopes who can reach the signing secret).
2. Store the PEM private key in the environment secret
   `OTA_SIGNING_PRIVATE_KEY`. Never commit or paste it into workflow inputs.
3. Pushes to `main` auto-deploy Convex, the PWA, and marketing through
   **Deploy production**, which carries the live signed OTA release forward
   untouched. Pushing never publishes an OTA release.
4. Run **OTA release** manually, from `main` after the repair has merged and
   the push is green. Supply:
   - the permitted release kind;
   - the last reviewed source commit;
   - an approval or incident ticket;
   - an initial rollout percentage (normally 1 or 10);
   - the exact native application version receiving the update.
5. The workflow runs the OTA test gate and rejects native, billing,
   health-provider, OTA infrastructure, dependency, new-screen, and new-route
   changes. (The full suite already ran on the repair in Deploy production.)
6. Observe crash-free launches and rollback reports before increasing rollout.
   Republish the same source range with a higher bundle version and increased
   percentage. Never mutate a published signed manifest in place outside CI.
7. For a bad release, publish a higher bundle version containing the last good
   reviewed code. Devices also locally block a bundle after repeated failed
   starts.

The signing private key exists only as the `ota-production` environment
secret `OTA_SIGNING_PRIVATE_KEY` (plus a gitignored local backup,
`.ota-signing-private.pem`, that is never committed). Rotating it means
changing the embedded native public key and key ID through a store release.

## Policy references

- Apple App Review Guidelines 2.3.1, 2.5.2, and 4.2:
  <https://developer.apple.com/app-store/review/guidelines/>
- Google Play Device and Network Abuse:
  <https://support.google.com/googleplay/android-developer/answer/16559646>
