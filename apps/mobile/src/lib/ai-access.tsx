import { useCallback, useState } from "react"
import { Aperture, Barbell, ChartLineUp, Sparkle, X } from "@phosphor-icons/react"
import { toast } from "sonner"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { useRevenueCat } from "@/lib/revenuecat"

export function useAiAccessSubscription() {
  const { user, userId } = useAppAuth()
  const revenueCat = useRevenueCat({
    email: user?.email,
    name: user?.name,
    userId,
  })

  return {
    hasAiAccess: revenueCat.hasOneRepPro,
    isLoading: revenueCat.status === "loading" || revenueCat.status === "idle",
    subscription: revenueCat.customerInfo,
    revalidate: revenueCat.refresh,
  }
}

export function AiAccessRequiredModal({
  open,
  busy,
  price,
  error,
  onClose,
  onOpenPaywall,
  onRestore,
  onOpenSettings,
}: {
  open: boolean
  busy: boolean
  price: string
  error: string | null
  onClose: () => void
  onOpenPaywall: () => void
  onRestore: () => void
  onOpenSettings: () => void
}) {
  if (!open) return null

  const features = [
    {
      icon: Aperture,
      title: "Food photo analysis",
      body: "Turn meal photos into editable nutrition logs.",
    },
    {
      icon: Barbell,
      title: "Workout generation",
      body: "Build routines from goals, equipment, and time.",
    },
    {
      icon: ChartLineUp,
      title: "Progress insights",
      body: "Ask for trends across training, body metrics, and nutrition.",
    },
  ]

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-background/70 px-4 py-6 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-access-required-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[27rem] overflow-hidden rounded-[24px] border border-border/55 bg-card text-left shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close paywall"
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 text-muted-foreground ring-1 ring-border/55 backdrop-blur transition-colors active:bg-muted active:text-foreground"
        >
          <X size={15} weight="bold" />
        </button>

        <div className="border-b border-border/45 bg-muted/25 px-5 pt-5 pb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-background">
            <Sparkle size={18} weight="fill" />
          </div>
          <p className="mt-4 text-[10px] font-bold tracking-[0.18em] text-muted-foreground/58 uppercase">
            OneRep Pro
          </p>
          <h2
            id="ai-access-required-title"
            className="mt-1 max-w-[18rem] text-[24px] leading-tight font-semibold tracking-tight text-foreground"
          >
            Unlock optional AI tools
          </h2>
          <p className="mt-2 max-w-[22rem] text-[13px] leading-relaxed text-muted-foreground/68">
            Core tracking stays free. Pro covers the AI features that have real
            inference costs.
          </p>
        </div>

        <div className="px-5 py-4">
          <div className="grid gap-2.5">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="flex gap-3 rounded-[14px] border border-border/40 bg-background/45 p-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/78">
                    <Icon size={16} weight="bold" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-foreground/88">
                      {feature.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground/62">
                      {feature.body}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 rounded-[16px] border border-foreground/10 bg-foreground/[0.035] p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-bold text-foreground/88">
                Monthly
              </p>
              <p className="text-[18px] font-bold tracking-tight text-foreground">
                {price}
              </p>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground/55">
              Cancel anytime. Your subscription unlocks Pro on desktop and
              mobile with the same account.
            </p>
          </div>

          {error && (
            <p className="mt-3 rounded-[12px] border border-destructive/20 bg-destructive/8 px-3 py-2 text-[11.5px] font-medium text-destructive">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onOpenPaywall}
            disabled={busy}
            aria-busy={busy}
            className="mt-4 min-h-12 w-full rounded-[14px] bg-foreground px-4 text-[14px] font-bold text-background transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {busy ? "Starting checkout..." : `Continue for ${price}`}
          </button>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRestore}
              disabled={busy}
              className="min-h-10 rounded-xl bg-muted px-3 text-[12px] font-bold text-foreground/70 transition-opacity active:opacity-75 disabled:opacity-50"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-10 rounded-xl bg-muted px-3 text-[12px] font-bold text-foreground/70 transition-opacity active:opacity-75"
            >
              Settings
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 min-h-9 w-full px-3 text-[12px] font-semibold text-muted-foreground/55 transition-colors active:text-foreground"
          >
            Keep using the free app
          </button>
        </div>
      </div>
    </div>
  )
}

export function useAiFeatureGate() {
  const { user, userId } = useAppAuth()
  const revenueCat = useRevenueCat({
    email: user?.email,
    name: user?.name,
    userId,
  })
  const hasAiAccess = revenueCat.hasOneRepPro
  const isLoading = revenueCat.status === "loading" || revenueCat.status === "idle"
  const [modalOpen, setModalOpen] = useState(false)
  const [paywallBusy, setPaywallBusy] = useState(false)
  const navigate = useSmoothNavigate()

  const requireAiAccess = useCallback(() => {
    if (hasAiAccess) return true
    if (isLoading) {
      toast.message("Checking AI Access…")
      return false
    }

    setModalOpen(true)
    return false
  }, [hasAiAccess, isLoading])

  const aiAccessModal = (
    <AiAccessRequiredModal
      open={modalOpen}
      busy={paywallBusy}
      price={revenueCat.monthlyPrice ?? "Monthly"}
      error={revenueCat.error}
      onClose={() => setModalOpen(false)}
      onOpenPaywall={() => {
        if (paywallBusy) return
        setPaywallBusy(true)
        void revenueCat
          .purchaseMonthly()
          .then(() => revenueCat.refresh())
          .then(() => setModalOpen(false))
          .catch((error) => {
            const message =
              error instanceof Error && error.message
                ? error.message
                : "Could not open the paywall"
            if (message !== "Purchase canceled") toast.error(message)
          })
          .finally(() => setPaywallBusy(false))
      }}
      onRestore={() => {
        if (paywallBusy) return
        setPaywallBusy(true)
        void revenueCat
          .restorePurchases()
          .then(() => revenueCat.refresh())
          .catch((error) => {
            const message =
              error instanceof Error && error.message
                ? error.message
                : "Could not restore purchases"
            if (message !== "Purchase canceled") toast.error(message)
          })
          .finally(() => setPaywallBusy(false))
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
    aiAccessModal,
  }
}
