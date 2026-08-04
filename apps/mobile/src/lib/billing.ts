import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { useAction, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"

/**
 * Billing hook for OneRep Pro, which is sold on the web through Stripe only.
 *
 * There is no in-app purchase path on any platform: native builds cannot start
 * a purchase, cannot restore one, and carry no store SDK. They read the same
 * server-owned entitlement as the web app and can manage or cancel an existing
 * subscription, but a native user who wants Pro subscribes from the OneRep
 * website in their own browser.
 *
 * The governing rule is unchanged: the client never decides entitlement. Convex
 * owns it and the app reads it back through `api.billing.public.getStatus`.
 */

export const ONEREP_PRO_ENTITLEMENT = "OneRep Pro"
export const MONTHLY_PACKAGE_IDENTIFIER = "monthly"

export type BillingStatus =
  "idle" | "loading" | "ready" | "unsupported" | "error"

export type SubscriptionDiagnosticTone =
  "success" | "pending" | "attention" | "muted"

export type SubscriptionDiagnostic = {
  title: string
  detail: string
  tone: SubscriptionDiagnosticTone
  canRetry: boolean
}

export type BillingSubscriptionStatus = {
  activeSubscriptions: string[]
  autoRenew: boolean | null
  expiresAt: string | null
  fetchedAt: number
  hasActiveSubscription: boolean
  isActive: boolean
  managementUrl: string | null
  productIdentifier: string | null
  source: string
  state: string | null
  store: string | null
  updatedAt?: number
}

type UseBillingOptions = {
  email?: string | null
  name?: string | null
  userId?: string | null
}

function isNativePurchasesAvailable() {
  return Capacitor.isNativePlatform()
}

function isWebPurchasesAvailable() {
  return typeof window !== "undefined" && !Capacitor.isNativePlatform()
}

export function hasHydratedWebSubscription(isNative: boolean, status: unknown) {
  return !isNative && Boolean(status)
}

export function hasOneRepPro(status: BillingSubscriptionStatus | null) {
  return status?.isActive === true
}

export function hasActiveSubscription(
  status: BillingSubscriptionStatus | null
) {
  if (hasOneRepPro(status)) return true
  if (status?.hasActiveSubscription === true) return true
  return (status?.activeSubscriptions?.length ?? 0) > 0
}

export function billingErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as { message?: unknown; errorMessage?: unknown }
    const message = maybeError.message ?? maybeError.errorMessage
    if (typeof message === "string" && message.trim().length > 0) {
      return message
    }
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/**
 * The incoming message is raw Stripe or network error text, so it is only ever
 * matched against, never shown. Every branch returns written product copy.
 */
function subscriptionDiagnosticError(message: string) {
  if (/network|fetch|offline|disconnected|websocket|timed out/i.test(message)) {
    return "Couldn’t reach billing. Check your connection and retry."
  }
  if (/not configured|unauthorized|forbidden|unavailable/i.test(message)) {
    return "Billing is temporarily unavailable. Try again later."
  }
  return "We couldn’t confirm your subscription. Retry, and contact support if it keeps happening."
}

/**
 * Where an existing subscription was bought.
 *
 * `app_store` and `play_store` only appear for rows predating the removal of
 * in-app purchases, which no longer grant access; they are still labelled so a
 * user who recognises the origin knows where their old charge came from.
 */
function subscriptionStoreLabel(store: string | null | undefined) {
  const normalized = store?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes("app_store") || normalized.includes("apple")) {
    return "App Store"
  }
  if (normalized.includes("play_store") || normalized.includes("google")) {
    return "Google Play"
  }
  if (normalized === "rc_billing" || normalized.includes("stripe")) {
    return "Web checkout"
  }
  return "your store"
}

function subscriptionSourceLabel(source: string | undefined) {
  if (source?.startsWith("apple")) return "App Store"
  if (source?.startsWith("google")) return "Google Play"
  if (source?.startsWith("stripe")) return "Stripe"
  return "your OneRep account"
}

/**
 * Small, user-facing subscription health copy for Settings. It deliberately
 * avoids product internals while exposing enough state to recover from a
 * delayed webhook, a failed payment, or a configuration issue.
 */
export function subscriptionDiagnosticCopy({
  customerInfo,
  error,
  isConfigured,
  isNative,
  isWeb,
  status,
}: {
  customerInfo: BillingSubscriptionStatus | null
  error: string | null
  isConfigured: boolean
  isNative: boolean
  isWeb: boolean
  status: BillingStatus
}): SubscriptionDiagnostic {
  const canRetry = isNative || isWeb
  const store = subscriptionStoreLabel(customerInfo?.store)
  const source = subscriptionSourceLabel(customerInfo?.source)
  const origin = store ? `${source} · ${store}` : source

  if (error) {
    return {
      title: "Subscription needs attention",
      detail: subscriptionDiagnosticError(error),
      tone: "attention",
      canRetry,
    }
  }

  if (status === "loading") {
    return {
      title: "Checking subscription",
      detail: "Your current access stays available while we check.",
      tone: "pending",
      canRetry: false,
    }
  }

  if (status === "unsupported") {
    return {
      title: "Subscription unavailable",
      detail: "Open OneRep in a browser to manage OneRep Pro.",
      tone: "muted",
      canRetry: false,
    }
  }

  if (!isConfigured) {
    return {
      title: "Connecting subscriptions",
      detail: "Status will update automatically when your account is ready.",
      tone: "pending",
      canRetry,
    }
  }

  // A subscription in grace or billing retry still grants access, but the user
  // needs to know their payment failed or they will be surprised when it ends.
  if (
    customerInfo?.state === "grace_period" ||
    customerInfo?.state === "billing_retry"
  ) {
    return {
      title: "Payment needs attention",
      detail: "Update your payment method to keep Pro.",
      tone: "attention",
      canRetry,
    }
  }

  if (hasOneRepPro(customerInfo)) {
    return {
      title: "Pro active",
      detail:
        customerInfo?.state === "canceled"
          ? "Pro stays active until the end of your current period."
          : `Your subscription is confirmed with ${origin}.`,
      tone: "success",
      canRetry: false,
    }
  }

  // Native builds have no way to buy, so the free-plan copy has to say where
  // Pro actually comes from rather than implying a purchase is a tap away.
  if (isNative) {
    return {
      title: "Free plan",
      detail: "OneRep Pro is managed on the OneRep website.",
      tone: "muted",
      canRetry: false,
    }
  }

  return {
    title: "Free plan",
    detail: `No active subscription found with ${origin}.`,
    tone: "muted",
    canRetry: false,
  }
}

export function useBilling({ userId }: UseBillingOptions) {
  const isNative = isNativePurchasesAvailable()
  const isWeb = isWebPurchasesAvailable()

  const subscriptionQuery = useQuery(api.billing.public.getStatus, {})
  const refreshStatus = useAction(api.billing.public.refreshStatus)
  const cancelAction = useAction(api.billing.public.cancelSubscription)
  const manageAction = useAction(api.billing.public.createManagementSession)
  const createCheckout = useAction(api.billing.public.createCheckout)

  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const serverStatus = subscriptionQuery?.status ?? null
  const isConfigured = Boolean(userId) && subscriptionQuery !== undefined

  const refresh = useCallback(async () => {
    if (!userId) return serverStatus
    try {
      await refreshStatus({})
      if (mounted.current) setError(null)
    } catch (cause) {
      if (mounted.current) {
        setError(billingErrorMessage(cause, "Could not refresh subscription"))
      }
    }
    // The Convex query is reactive, so the fresh value arrives on its own.
    return serverStatus
  }, [refreshStatus, serverStatus, userId])

  /**
   * Start Stripe Checkout, which navigates away.
   *
   * Native builds never reach the Stripe branch: they render no purchase
   * control, and the guard here keeps that true even if one is added by
   * mistake.
   */
  const purchaseMonthly = useCallback(async () => {
    if (isNative) return null
    setError(null)
    setIsBusy(true)
    try {
      const { url } = await createCheckout({})
      window.location.assign(url)
      return null
    } catch (cause) {
      if (mounted.current) {
        setError(billingErrorMessage(cause, "Could not start checkout"))
      }
      return null
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [createCheckout, isNative])

  /**
   * Hands the user to Stripe's Customer Portal, where cancelling, resuming,
   * swapping payment method, and invoices all live.
   *
   * Preferred over `cancelSubscription`: it keeps every billing surface on
   * Stripe rather than reimplementing a subset in-app.
   */
  const openBillingManagement = useCallback(async () => {
    setError(null)
    setIsBusy(true)
    try {
      const result = await manageAction({})
      if (result.kind === "none") {
        setError(result.reason)
        return false
      }
      const opened = window.open(result.url, "_blank", "noopener,noreferrer")
      if (!opened) window.location.assign(result.url)
      return true
    } catch (cause) {
      if (mounted.current) {
        setError(
          billingErrorMessage(cause, "Could not open subscription management")
        )
      }
      return false
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [manageAction])

  const cancelSubscription = useCallback(async () => {
    setError(null)
    setIsBusy(true)
    try {
      const result = await cancelAction({})
      if (!result.canceled) {
        // `in` rather than a discriminant check because Convex widens the
        // literal `canceled` type across the action's return union.
        const managementUrl =
          "managementUrl" in result ? result.managementUrl : null
        if (managementUrl) {
          const opened = window.open(
            managementUrl,
            "_blank",
            "noopener,noreferrer"
          )
          if (!opened) window.location.assign(managementUrl)
        }
      }
      return serverStatus
    } catch (cause) {
      if (mounted.current) {
        setError(billingErrorMessage(cause, "Could not cancel subscription"))
      }
      return null
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [cancelAction, serverStatus])

  const status: BillingStatus = useMemo(() => {
    if (!isNative && !isWeb) return "unsupported"
    if (error) return "error"
    if (subscriptionQuery === undefined || isBusy) return "loading"
    if (!userId) return "idle"
    return "ready"
  }, [error, isBusy, isNative, isWeb, subscriptionQuery, userId])

  const customerInfo = serverStatus as BillingSubscriptionStatus | null
  const managementUrl = customerInfo?.managementUrl ?? null

  return useMemo(
    () => ({
      customerInfo,
      currentOffering: null,
      error,
      isConfigured,
      isNative,
      isWeb,
      status,
      cancelSubscription,
      openBillingManagement,
      // Buying is web-only. Native builds render no purchase control at all.
      canPurchase: isWeb && subscriptionQuery?.webProvider === "stripe",
      hasActiveSubscription: hasActiveSubscription(customerInfo),
      hasOneRepPro: hasOneRepPro(customerInfo),
      monthlyPrice: subscriptionQuery?.monthlyPriceLabel ?? null,
      purchaseMonthly,
      refresh,
      subscriptionDiagnostic: subscriptionDiagnosticCopy({
        customerInfo,
        error,
        isConfigured,
        isNative,
        isWeb,
        status,
      }),
      subscriptionManagementUrl: managementUrl,
    }),
    [
      cancelSubscription,
      openBillingManagement,
      customerInfo,
      error,
      isConfigured,
      isNative,
      isWeb,
      managementUrl,
      purchaseMonthly,
      refresh,
      status,
      subscriptionQuery?.monthlyPriceLabel,
      subscriptionQuery?.webProvider,
    ]
  )
}
