# iOS subscriptions

Native upgrades are temporarily paused by `apps/mobile/src/lib/billing-policy.ts`. iOS and Android hide upgrade entry points, skip subscription catalogue loading, and block new purchase attempts. The AI limit dialog explains the monthly allowance without offering an upgrade. Web checkout remains available. Where native subscription management is unavailable, Settings displays “Subscription management isn’t available in this app.” without an external purchase link or instruction. Apple subscribers retain the App Store management action and see “Manage your Apple subscription in the App Store.”

Existing entitlements remain valid. iOS users can restore purchases in Settings, and existing Apple subscribers can manage their subscription in the App Store. Convex verifies signed Apple transactions before granting Pro or finishing a transaction.

## Release setup

- App Store Connect must contain the auto-renewable monthly subscription with
  product ID `onerep_pro_monthly`, its pricing, availability, localization, and
  review information.
- The Convex deployment used by the submitted build needs
  `BILLING_APPLE_ISSUER_ID`, `BILLING_APPLE_KEY_ID`,
  `BILLING_APPLE_PRIVATE_KEY`, and `BILLING_APPLE_APP_APPLE_ID` (the numeric app
  Apple ID). These are server credentials, never frontend environment variables.
  `BILLING_APPLE_BUNDLE_ID` defaults to `com.ananthh.onerep` and must match the app.
- Configure App Store Server Notifications V2 for production and sandbox at the
  deployment's `/billing/apple/notifications` HTTP endpoint. The server verifier
  supports both environments, including App Review and TestFlight sandbox sales.
- Build from the internal repository with the payment provider present. Run
  `node scripts/ensure-billing-provider.mjs --require-provider` before building.
  The iOS release workflow already enforces this requirement.
- Submit the subscription and its group with the new app version if this is the
  first auto-renewable subscription submission. See Apple's
  [submission instructions](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase).

## Verification while upgrades are paused

1. On a free native account, confirm Settings has no upgrade banner, price, or purchase button.
2. Reach the AI allowance limit and confirm the notice offers only dismissal. Logging remains available.
3. On iOS, restore an existing purchase from Settings and verify access returns after server verification.
4. As an existing Apple subscriber, verify Manage in App Store remains available.
5. On web, verify the normal upgrade flow remains available.

## Device verification before re-enabling purchases

Use the release build in TestFlight with a free OneRep account:

1. Open Settings, then the OneRep Pro section. Confirm the localized monthly
   price, renewal terms, legal links, Upgrade to Pro, and Restore purchases.
2. Tap Upgrade to Pro. Confirm Apple's payment sheet appears. Cancel once, then
   complete a sandbox purchase. Pro must unlock only after server verification.
3. Reinstall or sign in on another device and tap Restore purchases. Confirm Pro
   returns for the same OneRep account.
4. Open Manage in the App Store as an Apple subscriber.
5. Exercise the AI allowance paywall and its Subscribe with Apple button. Check
   loading, retry, pending approval, and interrupted verification recovery.

Automated coverage uses a mocked native bridge and does not verify live App Store
Connect configuration, Apple payment sheets, or a real sandbox transaction.

## Review notes

Describe the actual submitted build. This temporary UI pause does not establish that Apple's previous rejection is resolved, particularly while externally purchased entitlements remain accessible. Do not reuse review notes claiming native purchases are available until the pause is lifted and the live flow is verified.
