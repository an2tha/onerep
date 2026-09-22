# Jev preparation before the Coach response

Every accepted `generateCoachChatMessage` request goes through a single Jev preparation stage before image analysis and the main model. This includes chat, chef, personal trainer, onboarding, and active-workout callers of that action. Authentication, sharing consent, and quota checks run first. Other AI features such as background reviews and food scanning keep their existing pipelines.

Jev calls TypeSafe's `POST https://api.typesafe.ai/v1/systemone` using `jev-latest`. One Choice question selects a prepared interface or an immediate handoff reason. The total evaluation budget, including reading the response body, is 500 ms. There are no retries or refinement loops. The request is aborted when the deadline expires. Missing credentials, errors, unknown choices, and timeouts all return `state: "handoff"` and continue to the main model. The existing model picker and provider fallback behavior are preserved; the default remains Luna.

The main model receives the original message, conversation, authoritative workspace, and advisory Jev handoff. Jev cannot execute operations or replace the final answer. Its selection never narrows the context supplied to Luna.

## Interface

The initial catalog contains saved nutrition targets, recent training sessions, and saved meals. Candidates are built from the server-authorized workspace and honor its personalization settings. Jev receives the message, two recent conversation messages, mode, attachment presence, and candidate descriptions. Snapshot values and image contents are not sent to Jev.

The Coach page assigns a unique request ID and subscribes to a user-scoped `coachPreparations` query. The server publishes the handoff before starting the full response. The app assembles the chosen candidate into a fixed JSON spec and renders it with `@json-render/core` and `@json-render/react`. This keeps composition to one evaluation without depending on the experimental multi-pass composer.

Snapshots are explicitly labeled as saved data while Coach prepares the answer. They are read-only and disappear on success or failure. Each new request has a separate subscription, so old turns cannot replace the active preview. Other callers already get Jev-first sequencing but do not yet display this preview.

Preparation rows expire after ten minutes, are scheduled for deletion, and participate in account data export and deletion. Preview publication failure does not block Luna.

## Configuration

Set `TYPESAFE_API_KEY` in the Convex server environment. Keep `AI_PROCESSOR_APPROVED=true` under the existing deployment configuration. Never expose the TypeSafe key to Vite. Without a key, the stage immediately hands off as `unavailable`.

AI sharing disclosure version 3 adds TypeSafe as a recipient. Existing users must accept the updated disclosure through the existing consent flow before any AI data is sent. This is enforced before Jev and before spending quota.

## Validation

Unit tests cover typed selection, invalid output, immediate handoffs, absent configuration, cancellation, late answers, and a hanging response body. Convex tests cover Jev-before-Luna ordering, every exit reason, all coach modes, request and user isolation, expiry, and stale consent. Renderer tests verify actual json-render output and escaped saved text.

Live latency and selection quality still require a configured TypeSafe key and a deployed backend. The 500 ms deadline is a product budget, not a measured latency claim.

References: [TypeSafe API](https://docs.typesafe.ai/api), [json-render quick start](https://json-render.dev/docs/quick-start).
