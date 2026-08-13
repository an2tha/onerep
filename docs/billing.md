# Billing

OneRep Pro is a monthly subscription, sold on the web only. This document
explains how entitlement works, what is and isn't in this repository, and what
to do about it — which for most deployments is one environment variable and
then never thinking about billing again.

## The zero-variable answer

Do nothing. Every signed-in account is treated as Pro by default: the paywall
never renders, the subscription card in Settings shows a complimentary plan,
and no payment code runs. If you are self-hosting for yourself, your family,
or your gym, this is the whole document. The rest is for people who want to
charge money — which starts with

```bash
bunx convex env set BILLING_COMP_ALL_USERS false
```

## How entitlement works

Billing is split into two layers, and only one of them is interesting:

1. **Entitlement and state** — checked in, fully functional. The schema
   (`billingSubscriptions`, `billingEvents`, `subscriptionStates`), the rollup
   logic (`convex/billing/entitlement.ts`, `store.ts`), the client-facing API
   (`convex/billing/public.ts`), reconciliation crons, and the single
   server-side gate everything else calls:

   ```ts
   hasActiveProEntitlement(ctx, userId);
   ```

   Features never ask "does this user pay?"; they ask that function, which
   answers from stored subscription rows and the comp flag. AI quota
   (`convex/ai/usage.ts`) is the main consumer.

2. **The payment provider** — not in this repository. Checkout, the customer
   portal, cancellation, and webhook verification are calls into a module at
   `convex/billing/provider.ts` that satisfies the `BillingProvider` interface
   in `convex/billing/providerTypes.ts`. What ships here is
   `provider.stub.ts`: checkout and management throw a clear error, webhooks
   fail verification with a 401, refresh reports there was nothing to refresh.

The same split exists in the client. The subscription card, the paywall
modal, and the checkout-return handling live behind
`apps/mobile/src/components/billing/index.tsx`, generated from
`index.stub.tsx` with the prop contracts in `types.ts`. The stub renders plan
status without a buy button and a paywall that explains itself without asking
for a card.

`scripts/ensure-billing-provider.mjs` copies both stubs into place when the
generated files are missing. It runs automatically from `build`, `dev`,
`typecheck`, and `test`, so a fresh clone works without reading this far.

## Putting a real provider behind the seam

If you want to sell subscriptions from your own deployment:

1. Write a module exporting `provider: BillingProvider` — five async
   functions: `createCheckoutSession`, `createPortalSession`,
   `cancelSubscription`, `refreshSubscription`, `handleWebhook`. The
   interface's doc comments in `providerTypes.ts` state the contract each one
   must honor.
2. Point `convex/billing/provider.ts` at it. The file is gitignored, so your
   implementation stays yours.
3. Persist state through the internal mutations in `convex/billing/store.ts`
   (`upsertPlatformSubscription`, `claimEvent`/`finishEvent` for webhook
   idempotency, `recordCheckout`). If your provider writes through those, the
   rollups, crons, and client all work without modification.
4. Replace the payment UI the same way if the stub's honesty is not the tone
   you want at checkout.

Design notes your implementation should respect, learned the usual way:

- **Verify webhooks over raw bytes, then re-read state from the provider's
  API.** Never trust the notification body for state — re-reading makes
  out-of-order delivery harmless.
- **Claim event ids before processing.** Webhooks get redelivered; the
  `billingEvents` table exists so replays are free.
- **Map "payment is being retried" to `billing_retry`, not revocation.**
  Cutting access mid-dunning churns customers who would have recovered.
- **Cancel at period end.** The customer keeps what they paid for.

## Environment variables

| Variable                                                                | Purpose                                                                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BILLING_COMP_ALL_USERS`                                                | Unset or `true`: every account has Pro (the default). `false`: entitlement comes from stored subscriptions. The comp wins over lapsed real subscriptions. |
| `BILLING_MONTHLY_PRICE_LABEL`                                           | The price string the client displays.                                                                                                                     |
| `BILLING_CHECKOUT_SUCCESS_URL` / `..._CANCEL_URL`                       | Where checkout returns to. The app watches for `#success` / `#failed` on the Settings page.                                                               |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY` | Used only by a Stripe-backed provider; the stub ignores them.                                                                                             |

All are Convex deployment variables. None are exposed to the client bundle.

## Why it is built this way

The production deployment uses a private provider implementation. Keeping the
seam narrow — five functions and two React components — means the open
codebase is the real codebase, not a demo: everything except the money-moving
itself is here, tested, and identical to what runs in production.
