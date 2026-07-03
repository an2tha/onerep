import { useCallback, useState } from "react"
import { Sparkle } from "@phosphor-icons/react"
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
  onClose,
  onOpenSettings,
}: {
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/60 px-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-access-required-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-[24px] border border-border/45 bg-card p-4 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background">
          <Sparkle size={16} weight="fill" />
        </div>
        <h2
          id="ai-access-required-title"
          className="mt-3 text-[17px] font-bold tracking-tight"
        >
          AI Access needed
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground/68">
          Unfortunately, because AI requests have real costs, we can't provide
          AI access for free. Core tracking stays free, and you can subscribe
          from Settings whenever it makes sense.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl bg-muted px-3 text-[13px] font-bold text-foreground/75 transition-opacity active:opacity-75"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-11 rounded-xl bg-foreground px-3 text-[13px] font-bold text-background transition-opacity active:opacity-80"
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  )
}

export function useAiFeatureGate() {
  const { hasAiAccess, isLoading } = useAiAccessSubscription()
  const [modalOpen, setModalOpen] = useState(false)
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
      onClose={() => setModalOpen(false)}
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
