# AI sharing behavior

AI features are on by default for accounts without an explicit opt-out. Existing opt-outs remain off, regardless of disclosure version. The default is evaluated without creating a record that claims the user granted permission.

Settings → Privacy & sync → AI data sharing shows the current setting, describes the providers and shared data, and lets users turn sharing off or back on directly. The providers are TypeSafe AI for guided workout questions, and OpenRouter routing to Microsoft Azure or Venice for other AI requests. The disabled-feature sheet appears only after a user has turned AI off. Dismissing it keeps AI off and does not start a request.

The server blocks new AI requests and scheduled reviews after an opt-out, before charging usage. Subscription access and personal API keys do not bypass an opt-out. Already-started requests cannot be recalled. Manual tracking stays available.

## Release checks

Ship the backend, updated mobile bundle, onboarding disclosure, and public privacy page together. Older installed bundles may still show their original permission sheet until updated, but their on/off mutations remain supported. Existing provider configuration and routing protections are unchanged.

## Device verification

1. On a fresh account and an existing account without an AI choice, confirm an AI feature runs without an initial permission sheet, subject to its normal allowance.
2. Turn AI sharing off in Settings and confirm new requests and scheduled reviews stop without spending quota. Manual tracking must remain usable.
3. Tap an AI feature while it is off. Dismiss the re-enable sheet and confirm it remains off. Turn AI back on and retry the feature.
4. Sign in on a second device and confirm the saved choice follows the account. Sign in as a different account and confirm the first account's opt-out does not carry over.
5. While preferences load, verify AI requests wait for the saved setting. Check failed saves, retry, keyboard access, phone and tablet layouts, and the privacy link.
