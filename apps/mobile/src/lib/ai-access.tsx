import { useCallback, useState } from "react"
import {
  ArrowRight,
  Check,
  CheckCircle,
  ShieldCheck,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { hasOneRepPro, useBilling } from "@/lib/billing"
import { celebrateSubscription } from "@/lib/subscription-celebration"

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

/**
 * Paywall hero (Unsplash, free license). Matches the remote-URL convention
 * already used for recipe imagery in RecipesHub, and falls back to the plain
 * gradient header if the image cannot load offline.
 */
const PAYWALL_HERO_IMAGE =
  "https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=1200&q=80"

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

  const benefits = [
    `${pro} AI credits a month, up from ${free}`,
    "Coach builds routines, recipes, and goals",
    "Food photo analysis and workout generation",
    "Progress insights across your training data",
  ]

  return (
    <div
      className="paywall-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-access-required-title"
    >
      <div className="paywall-glow" aria-hidden="true" />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="paywall-close"
      >
        <X size={17} weight="bold" />
      </button>

      <div className="paywall-scroll">
        <div className="paywall-hero">
          <img
            src={PAYWALL_HERO_IMAGE}
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
            onError={(event) => {
              event.currentTarget.style.display = "none"
            }}
          />
          <span className="paywall-hero-scrim" aria-hidden="true" />
        </div>

        <h2 id="ai-access-required-title" className="paywall-title">
          {spentAllowance ? "You're out of AI this month" : "Unlock OneRep Pro"}
        </h2>
        <p className="paywall-subtitle">
          {spentAllowance
            ? `You've used all ${free} free AI credits. They reset on the 1st.`
            : "Everything else stays free. Pro covers the AI."}
        </p>

        <ul className="paywall-benefits">
          {benefits.map((benefit) => (
            <li key={benefit}>
              <CheckCircle size={19} weight="fill" aria-hidden="true" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <div className="paywall-plan" aria-label={`Monthly plan, ${price}`}>
          <span className="paywall-plan-check" aria-hidden="true">
            <Check size={12} weight="bold" />
          </span>
          <span className="paywall-plan-body">
            <span className="paywall-plan-title">Monthly</span>
            <span className="paywall-plan-detail">Cancel anytime</span>
          </span>
          <span className="paywall-plan-price">{price}</span>
        </div>

        {error && (
          <p className="paywall-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="paywall-footer">
        {isNative ? (
          <p className="paywall-note">
            OneRep Pro is managed on the OneRep website. Subscribe there and
            your access appears here automatically.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenPaywall}
              disabled={busy}
              aria-busy={busy}
              className="paywall-cta"
            >
              {busy ? "Starting checkout…" : "Continue"}
              {!busy && (
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              )}
            </button>

            <p className="paywall-secure">
              <ShieldCheck size={13} weight="fill" aria-hidden="true" />
              Secured with Stripe
            </p>
          </>
        )}

        <div className="paywall-legal">
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
    (cost = 1) => {
      if (hasPro) return true
      if (isLoading) {
        toast.message("Checking your access…")
        return false
      }
      if (freeRequestsLeft >= cost) return true

      setModalOpen(true)
      return false
    },
    [freeRequestsLeft, hasPro, isLoading]
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
            const purchasedCustomerInfo = await billing.purchaseMonthly()
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
    requireAiAccess,
    showAiPaywall,
    aiAccessModal,
  }
}
