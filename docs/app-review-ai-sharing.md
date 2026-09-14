# AI sharing review fix

The app now asks for separate, optional permission before AI sharing. The sheet names OpenRouter and the two model recipients (OpenAI for Default, Venice for Uncensored), lists the data categories, explains the purpose, links the privacy policy, and offers **Allow AI data sharing** and **Not now**. Allowing saves the current disclosure version to the authenticated account; the user then retries their chosen feature. Dismissing does not start a request.

Existing accounts are not opted in. General onboarding consent, Pro access, and a personal API key do not count as AI sharing permission. Settings → Privacy & sync → AI data sharing lets users review the disclosure and withdraw permission. Server quota checks reject requests without current consent before charging usage; scheduled weekly reviews also check consent. Already-started requests cannot be recalled.

OpenRouter requests restrict routing to the named provider for the selected model, disable provider fallbacks, and request `data_collection: "deny"` and `zdr: true`. Unrecognized model providers are disabled. These constraints apply to personal API keys too.

## Release requirements

Deploy the additive schema and backend changes before the mobile bundle. Publish the updated public privacy policy with the release. Confirm that the actual OpenRouter account settings, provider agreements, and selected endpoints satisfy the policy before enabling `AI_PROCESSOR_APPROVED`; code cannot establish that contractual fact. Verify both configured models accept the enforced privacy options. A route that cannot meet them fails closed.

## Device verification

On a fresh account and an existing account, on iPhone and iPad:

1. Open Coach, send a message, and verify the disclosure appears before an AI request. Tap Not now: no request or quota charge; manual tracking remains usable.
2. Repeat and allow sharing. Retry the message and verify a response. Check food-photo analysis, form analysis, setup Coach, and setup import.
3. Open Settings → Privacy & sync, turn AI sharing off, and verify a new AI request asks again. Verify scheduled AI reviews do not send requests for the revoked account.
4. Sign in as a different account and verify consent does not carry over. Verify existing accounts must consent even if onboarding data consent or Pro was already enabled.
5. Check the policy link, phone sheet scrolling, iPad layout, screen-reader button names, and dismissal.

## Suggested App Review response after deployment and device verification

We added a separate AI data-sharing permission before using AI features. It explains what data is shared, names OpenRouter and the receiving providers (OpenAI or Venice, according to the selected model), explains the purpose, and links to our updated privacy policy. Reviewers can decline and continue manual tracking. Existing users must also opt in. Permission can be withdrawn under Settings → Privacy & sync → AI data sharing. The server blocks AI requests, including scheduled reviews, without current permission.

References: [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [OpenRouter zero data retention](https://openrouter.ai/docs/guides/features/zdr).
