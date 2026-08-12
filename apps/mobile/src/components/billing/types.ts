import type { useBilling } from "@/lib/billing"

/**
 * Prop contracts for the payment UI seam.
 *
 * The components behind `./index` come in two builds: the private one that
 * sells subscriptions, and the stub that ships in the open repository and
 * sells nothing to nobody. Both must satisfy these types, which is the only
 * reason either can be trusted to slot into the same call sites.
 */

export interface BillingSubscriptionPanelProps {
  billing: ReturnType<typeof useBilling>
}

export interface AiAccessRequiredModalProps {
  open: boolean
  busy: boolean
  price: string
  error: string | null
  /** Free monthly allowance; present when the viewer is not on Pro. */
  freeLimit?: number | null
  proLimit?: number | null
  usedCount?: number | null
  /** Native builds cannot buy: Pro is sold on the web only. */
  isNative?: boolean
  onClose: () => void
  onOpenPaywall: () => void
  onOpenSettings: () => void
}
