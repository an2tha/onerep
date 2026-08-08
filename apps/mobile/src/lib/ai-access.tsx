import { useCallback, useState } from "react"
import { ArrowRight, ShieldCheck, X } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { hasOneRepPro, useBilling } from "@/lib/billing"
import { celebrateSubscription } from "@/lib/subscription-celebration"
import { trackUmami } from "@/lib/analytics"

export function useAiAccessSubscription() {
  const { user, userId } = useAppAuth()
  const billing = useBilling({
    email: user?.email,
    name: user?.name,
    userId,
  })

  return {
    hasAiAccess: billing.hasOneRepPro,
    isLoading: billing.status === "loading" || billing.status === "idle",
    subscription: billing.customerInfo,
    revalidate: billing.refresh,
  }
}

const PRIVACY_URL = "https://onerep.life/privacy"
const TERMS_URL = "https://onerep.life/terms"

export function AiAccessRequiredModal({
  open,
  busy,
  price,
  error,
  freeLimit,
  proLimit,
  usedCount,
  isNative,
  onClose,
  onOpenPaywall,
  onOpenSettings,
}: {
  open: boolean
  busy: boolean
  price: string
  error: string | null
  /** Free monthly allowance; present when the viewer is not on Pro. */
  freeLimit?: number | null
  proLimit?: number | null
  usedCount?: number | null
  /** Native builds cannot buy: Pro is sold on the web through Stripe only. */
  isNative?: boolean
  onClose: () => void
  onOpenPaywall: () => void
  onOpenSettings: () => void
}) {
  if (!open) return null

  const free = freeLimit ?? 10
  const pro = proLimit ?? 500
  const spentAllowance = usedCount != null && usedCount >= free
  // `price` falls back to a bare "Monthly" while billing is still loading its
  // label, which would read as "Monthly · cancel anytime" — drop it instead.
  const hasPriceLabel = /\d/.test(price)

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
            : "The AI bit costs us money"}
        </h2>

        <p className="ai-hint-body">
          {spentAllowance
            ? `You’ve used all ${free} free AI requests. They come back on the 1st — or Pro raises the limit to ${pro} a month.`
            : "Every Coach answer, food photo, and generated workout runs on models we pay for by the request. We’d hand them out for free if we could, but they need a subscription to stay switched on."}
        </p>
        <p className="ai-hint-body">
          Everything else in OneRep — logging, progress, recipes you write
          yourself — stays free.
        </p>

        <p className="ai-hint-price">
          {hasPriceLabel ? `${price} · cancel anytime` : "Cancel anytime"}
        </p>

        {error && (
          <p className="ai-hint-error" role="alert">
            {error}
          </p>
        )}

        {isNative ? (
          <p className="ai-hint-note">
            Pro is managed on the OneRep website. Subscribe there and your
            access appears here automatically.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenPaywall}
              disabled={busy}
              aria-busy={busy}
              className="ai-hint-cta"
            >
              {busy ? "Starting checkout…" : "Continue"}
              {!busy && (
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              )}
            </button>

            <p className="ai-hint-secure">
              <ShieldCheck size={13} weight="fill" aria-hidden="true" />
              Secured with Stripe
            </p>
          </>
        )}

        <div className="ai-hint-legal">
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
            Privacy
          </a>
          <span aria-hidden="true">|</span>
          <a href={TERMS_URL} target="_blank" rel="noreferrer">
            Terms
          </a>
          <span aria-hidden="true">|</span>
          <button type="button" onClick={onOpenSettings}>
            Settings
          </button>
        </div>
      </div>
    </div>
  )
}

export function useAiFeatureGate() {
  const { user, userId } = useAppAuth()
  const billing = useBilling({
    email: user?.email,
    name: user?.name,
    userId,
  })
  const hasPro = billing.hasOneRepPro
  const usage = useQuery(api.ai.usage.getMonthlyUsage, {})
  // Free accounts get a monthly AI allowance before the paywall appears; the
  // server enforces the real limit, so this only decides when to interrupt.
  const freeRequestsLeft = usage && !usage.isPro ? usage.remaining : 0
  const hasAiAccess = hasPro || freeRequestsLeft > 0
  const isLoading =
    billing.status === "loading" ||
    billing.status === "idle" ||
    usage === undefined
  const [modalOpen, setModalOpen] = useState(false)
  const [paywallBusy, setPaywallBusy] = useState(false)
  const navigate = useSmoothNavigate()

  /**
   * `cost` is how many monthly requests the feature about to run will spend —
   * form analysis costs more than one. Checking it here means a user short of
   * the full price is stopped before doing the work, rather than by the server
   * after they have already filmed and processed a clip.
   */
  const requireAiAccess = useCallback(
    (cost = 1, feature = "unknown") => {
      if (hasPro) return true
      if (isLoading) {
        toast.message("Checking your access…")
        return false
      }
      if (freeRequestsLeft >= cost) return true

      // The one place a free account is turned away from AI, so it is the one
      // honest measure of how often the allowance is what stops people.
      trackUmami("ai_paywall_shown", {
        feature,
        cost,
        used: usage?.count ?? 0,
        limit: usage?.limit ?? 0,
      })
      setModalOpen(true)
      return false
    },
    [freeRequestsLeft, hasPro, isLoading, usage?.count, usage?.limit]
  )

  // Lets Developer settings preview the paywall without spending an allowance.
  const showAiPaywall = useCallback(() => setModalOpen(true), [])

  const aiAccessModal = (
    <AiAccessRequiredModal
      open={modalOpen}
      busy={paywallBusy}
      price={billing.monthlyPrice ?? "Monthly"}
      error={billing.error}
      freeLimit={usage && !usage.isPro ? usage.limit : null}
      proLimit={usage?.proLimit ?? null}
      usedCount={usage?.count ?? null}
      isNative={billing.isNative}
      onClose={() => setModalOpen(false)}
      onOpenPaywall={() => {
        if (paywallBusy) return
        setPaywallBusy(true)
        void (async () => {
          try {
            const purchasedCustomerInfo =
            await billing.purchaseMonthly("ai_paywall")
            const customerInfo =
              purchasedCustomerInfo ?? (await billing.refresh())
            if (hasOneRepPro(customerInfo)) {
              celebrateSubscription()
              setModalOpen(false)
            } else {
              toast.message("Subscription is pending. Refreshing access...")
              void billing.refresh()
            }
          } catch (error) {
            const message =
              error instanceof Error && error.message
                ? error.message
                : "We couldn’t start your subscription. Try again."
            if (message !== "Purchase canceled") toast.error(message)
          } finally {
            setPaywallBusy(false)
          }
        })()
      }}
      onOpenSettings={() => {
        setModalOpen(false)
        navigate("/settings", { motion: "switch" })
      }}
    />
  )

  return {
    hasAiAccess,
    aiAccessLoading: isLoading,
    aiUsage: usage ?? null,
    requireAiAccess,
    showAiPaywall,
    aiAccessModal,
  }
}
