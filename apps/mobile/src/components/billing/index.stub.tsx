import { X } from "@phosphor-icons/react"
import type {
  AiAccessRequiredModalProps,
  BillingSubscriptionPanelProps,
} from "./types"

/**
 * The payment UI that ships with the open repository.
 *
 * There is no checkout in this build, so these components render the honest
 * version of each surface: plan status without a buy button, a paywall that
 * explains itself without asking for a card, and a checkout-return watcher
 * that has nothing to watch. Set `BILLING_COMP_ALL_USERS=true` on the server
 * and the paywall never appears at all.
 *
 * `scripts/ensure-billing-provider.mjs` copies this file to `./index.tsx`
 * when no payment UI is present.
 */

/** Nothing to watch: no checkout can start, so no checkout can return. */
export function CheckoutResultOverlay() {
  return null
}

export function AiAccessRequiredModal({
  open,
  freeLimit,
  proLimit,
  usedCount,
  onClose,
}: AiAccessRequiredModalProps) {
  if (!open) return null

  const free = freeLimit ?? 10
  const pro = proLimit ?? 500
  const spentAllowance = usedCount != null && usedCount >= free

  return (
    <div className="ai-hint-layer" role="presentation">
      <button
        type="button"
        className="ai-hint-scrim"
        aria-label="Close"
        onClick={onClose}
      />

      <div
        className="ai-hint-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-access-required-title"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ai-hint-close"
        >
          <X size={15} weight="bold" />
        </button>

        <h2 id="ai-access-required-title" className="ai-hint-title">
          {spentAllowance
            ? "That’s your free AI for this month"
            : "AI features need Pro access"}
        </h2>

        <p className="ai-hint-body">
          {spentAllowance
            ? `You’ve used all ${free} free AI requests. They come back on the 1st — Pro raises the limit to ${pro} a month.`
            : "This build has no way to sell subscriptions, which is either a bug or a feature depending on who deployed it."}
        </p>
        <p className="ai-hint-note">
          If you run this server, set BILLING_COMP_ALL_USERS=true and every
          account gets Pro. That is the whole checkout flow.
        </p>
      </div>
    </div>
  )
}

export function BillingSubscriptionPanel({
  billing,
}: BillingSubscriptionPanelProps) {
  const active = billing.hasOneRepPro

  return (
    <div
      className="profile-pro-card"
      data-subscription-state={active ? "active" : "free"}
    >
      <div className="profile-pro-content">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="profile-pro-title">OneRep Pro</p>
            <p className="profile-pro-description">
              {active
                ? "AI meal analysis, workout generation, and progress insights are unlocked."
                : "This build doesn’t sell subscriptions. Pro is granted by whoever runs the server — ask them, not us."}
            </p>
          </div>
          <span className="profile-pro-status">
            {active ? "Active" : "Free"}
          </span>
        </div>
      </div>
    </div>
  )
}
