import { useCallback, useState } from "react"
import { useQuery } from "convex/react"
import { toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { hasOneRepPro, useBilling } from "@/lib/billing"
import { celebrateSubscription } from "@/lib/subscription-celebration"
import { AiAccessRequiredModal } from "@/components/billing"
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

export function useAiFeatureGate() {
  const { user, userId } = useAppAuth()
  const billing = useBilling({
    email: user?.email,
    name: user?.name,
    userId,
  })
  const hasPro = billing.hasOneRepPro
  const usage = useQuery(api.ai.usage.getMonthlyUsage, {})
  // A user on their own OpenRouter key (BYOK) has no monthly cap to hit, so
  // the paywall never applies to them. Same for an uncapped self-hosted
  // deployment (AI_USAGE_UNLIMITED=true).
  const hasByok = usage?.byok === true || usage?.unlimited === true
  // Free accounts get a monthly AI allowance before the paywall appears; the
  // server enforces the real limit, so this only decides when to interrupt.
  const freeRequestsLeft = usage && !usage.isPro ? usage.remaining : 0
  const hasAiAccess = hasPro || hasByok || freeRequestsLeft > 0
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
      if (hasPro || hasByok) return true
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
      canPurchase={billing.canPurchase}
      canRestore={billing.canRestore}
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
      onRestore={() => {
        if (paywallBusy) return
        setPaywallBusy(true)
        void (async () => {
          try {
            const { restored } = await billing.restorePurchases()
            if (restored > 0) {
              await billing.refresh()
              celebrateSubscription()
              setModalOpen(false)
            }
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
