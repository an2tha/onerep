import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { useAction, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  BillingPlugin,
  type BillingProduct,
  type BillingPurchase,
} from "./billing-plugin"

/**
 * Self-owned billing hook for Stripe, App Store, and Google Play purchases.
 *
 * The governing rule is that the client never decides entitlement. A native
 * purchase yields a signed receipt that goes straight to Convex, which
 * validates it with Apple/Google and writes the state; the app then reads that
 * state back through `api.billing.public.getStatus`. The transaction is only
 * finished once the server has accepted it, so an interrupted purchase is
 * recoverable rather than lost.
 */

export const ONEREP_PRO_ENTITLEMENT = "OneRep Pro"
export const MONTHLY_PACKAGE_IDENTIFIER = "monthly"
const BILLING_REQUEST_TIMEOUT_MS = 8000

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

type BillingState = {
  customerInfo: BillingSubscriptionStatus | null
  currentOffering: null
  error: string | null
  isConfigured: boolean
  isNative: boolean
  isWeb: boolean
  monthlyPackage: BillingProduct | null
  status: BillingStatus
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

function shortSubscriptionError(message: string) {
  const compact = message.replace(/\s+/g, " ").trim()
  if (compact.length <= 88) return compact
  return `${compact.slice(0, 85)}...`
}

function subscriptionDiagnosticError(message: string) {
  if (/network|fetch|offline|disconnected|websocket|timed out/i.test(message)) {
    return "Couldn’t reach purchases. Check your connection and retry."
  }
  if (/not configured|unauthorized|forbidden|unavailable/i.test(message)) {
    return "Purchases are temporarily unavailable. Try again later."
  }
  return shortSubscriptionError(message)
}

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
  return "Purchase store"
}

function subscriptionSourceLabel(source: string | undefined) {
  if (source?.startsWith("apple")) return "App Store"
  if (source?.startsWith("google")) return "Google Play"
  if (source?.startsWith("stripe")) return "Stripe"
  if (source === "manual") return "account record"
  return "your account"
}

/**
 * Small, user-facing purchase health copy for Settings. It deliberately avoids
 * product internals while exposing enough state to recover from a delayed
 * restore, a disconnected billing service, or a configuration issue.
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
      title: "Purchases unavailable",
      detail: "Use web, iOS, or Android to manage OneRep Pro.",
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
      detail: `Update your payment method in ${store ?? "your store"} to keep Pro.`,
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
          : `Status confirmed via ${origin}.`,
      tone: "success",
      canRetry: false,
    }
  }

  if (hasActiveSubscription(customerInfo)) {
    return {
      title: "Restoring Pro access",
      detail: "A purchase was found. Refresh to finish checking access.",
      tone: "attention",
      canRetry,
    }
  }

  return {
    title: "Free plan",
    detail: `Status checked via ${origin}.`,
    tone: "muted",
    canRetry: false,
  }
}

function withTimeout<T>(promise: Promise<T>, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} timed out`))
    }, BILLING_REQUEST_TIMEOUT_MS)

    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

export function useBilling({ userId }: UseBillingOptions) {
  const isNative = isNativePurchasesAvailable()
  const isWeb = isWebPurchasesAvailable()

  const subscriptionQuery = useQuery(api.billing.public.getStatus, {})
  const getPurchaseContext = useAction(api.billing.public.getPurchaseContext)
  const redeemPurchase = useAction(api.billing.public.redeemPurchase)
  const refreshStatus = useAction(api.billing.public.refreshStatus)
  const restoreAction = useAction(api.billing.public.restorePurchases)
  const cancelAction = useAction(api.billing.public.cancelSubscription)
  const createCheckout = useAction(api.billing.public.createCheckout)

  const [monthlyProduct, setMonthlyProduct] = useState<BillingProduct | null>(
    null
  )
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
  const offering = subscriptionQuery?.offering ?? null
  const isConfigured = Boolean(userId) && subscriptionQuery !== undefined

  /**
   * A minimal status reflecting a verdict the server just gave us.
   *
   * `serverStatus` comes from a reactive query and still holds the pre-purchase
   * value at the moment an action resolves, so returning it would make callers
   * miss a successful purchase.
   */
  const grantedStatus = useCallback(
    (granted: boolean): BillingSubscriptionStatus =>
      ({
        ...(serverStatus ?? {
          activeSubscriptions: [],
          autoRenew: null,
          expiresAt: null,
          fetchedAt: Date.now(),
          managementUrl: null,
          productIdentifier: null,
          source: "manual",
          state: null,
          store: null,
        }),
        hasActiveSubscription: granted,
        isActive: granted,
      }) as BillingSubscriptionStatus,
    [serverStatus]
  )

  /** Send a store receipt to Convex, then finish the transaction. */
  const redeemAndFinish = useCallback(
    async (purchase: BillingPurchase) => {
      const platform = Capacitor.getPlatform() === "ios" ? "apple" : "google"
      const result = await redeemPurchase({
        platform,
        receipt: purchase.receipt,
        productId: purchase.productId,
      })

      // Only finish once the server has recorded it. On iOS an unfinished
      // transaction is replayed on next launch; on Android the server has
      // already acknowledged, so this is belt-and-braces.
      if (result.granted) {
        await BillingPlugin.finishTransaction({
          transactionId: purchase.transactionId,
        }).catch(() => undefined)
      }
      return result
    },
    [redeemPurchase]
  )

  // Load the store product so the paywall can show a real localized price.
  useEffect(() => {
    if (!isNative || !offering?.monthlyProductId) return
    let cancelled = false

    void withTimeout(
      BillingPlugin.getProducts({
        productIds: [offering.monthlyProductId],
      }),
      "Loading products"
    )
      .then(({ products }) => {
        if (cancelled || !mounted.current) return
        setMonthlyProduct(products[0] ?? null)
      })
      .catch((cause) => {
        if (cancelled || !mounted.current) return
        setError(billingErrorMessage(cause, "Could not load products"))
      })

    return () => {
      cancelled = true
    }
  }, [isNative, offering?.monthlyProductId])

  // Renewals, refunds, and deferred (Ask-to-Buy) approvals arrive out of band.
  // Redeem them so an offline renewal is not missed.
  useEffect(() => {
    if (!isNative || !userId) return
    let removeListener: (() => Promise<void>) | null = null

    void BillingPlugin.addListener("purchasesUpdated", (event) => {
      for (const purchase of event.purchases) {
        void redeemAndFinish(purchase).catch(() => undefined)
      }
    }).then((handle) => {
      removeListener = handle.remove
    })

    return () => {
      void removeListener?.()
    }
  }, [isNative, userId, redeemAndFinish])

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

  const purchaseMonthly = useCallback(async () => {
    setError(null)
    setIsBusy(true)
    try {
      if (!isNative) {
        // Web goes through Stripe Checkout, which navigates away.
        const { url } = await createCheckout({})
        window.location.assign(url)
        return null
      }

      const context = await getPurchaseContext({})
      const result = await BillingPlugin.purchase({
        productId: context.monthlyProductId,
        appAccountToken: context.appAccountToken,
      })

      if (result.status === "cancelled") return null
      if (result.status === "pending") {
        // Ask-to-Buy / SCA: the listener redeems it when it completes.
        if (mounted.current) {
          setError(
            "Purchase is pending approval. We'll unlock Pro once it clears."
          )
        }
        return null
      }
      if (!result.purchase) return null

      const redeemed = await redeemAndFinish(result.purchase)
      if (!redeemed.granted && mounted.current) {
        setError(
          redeemed.error === "SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT"
            ? "That subscription belongs to a different OneRep account. Contact support to move it."
            : "We couldn't verify the purchase. Try Restore purchases."
        )
      }
      // Report what the server just decided rather than `serverStatus`, which
      // is the reactive query's *previous* value and will not have caught up
      // yet — callers use this return value to decide whether to celebrate.
      return grantedStatus(redeemed.granted)
    } catch (cause) {
      if (mounted.current) {
        setError(billingErrorMessage(cause, "Purchase failed"))
      }
      return null
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [
    createCheckout,
    getPurchaseContext,
    grantedStatus,
    isNative,
    redeemAndFinish,
  ])

  const restorePurchases = useCallback(async () => {
    setError(null)
    setIsBusy(true)
    try {
      if (!isNative) {
        // Nothing to replay on web; the server already owns the truth.
        await refreshStatus({})
        return serverStatus
      }

      const { purchases } = await withTimeout(
        BillingPlugin.getPurchases(),
        "Restoring purchases"
      )
      const result = await restoreAction({
        platform: Capacitor.getPlatform() === "ios" ? "apple" : "google",
        receipts: purchases.map((purchase) => ({
          receipt: purchase.receipt,
          productId: purchase.productId,
        })),
      })

      if (result.restored === 0 && mounted.current) {
        setError(
          result.conflicts > 0
            ? "That subscription belongs to a different OneRep account. Contact support to move it."
            : "No previous purchases were found for this store account."
        )
      }
      return grantedStatus(result.restored > 0)
    } catch (cause) {
      if (mounted.current) {
        setError(billingErrorMessage(cause, "Restore failed"))
      }
      return null
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [grantedStatus, isNative, refreshStatus, restoreAction, serverStatus])

  const cancelSubscription = useCallback(async () => {
    setError(null)
    setIsBusy(true)
    try {
      const result = await cancelAction({})
      if (!result.canceled) {
        // Apple and Google only let the account holder cancel, in their own UI.
        // `in` rather than a discriminant check because Convex widens the
        // literal `canceled` type across the action's return union.
        const managementUrl =
          "managementUrl" in result ? result.managementUrl : null
        if (isNative) {
          await BillingPlugin.openManagementUrl({
            productId: serverStatus?.productIdentifier ?? undefined,
          }).catch(() => undefined)
        } else if (managementUrl) {
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
  }, [cancelAction, isNative, serverStatus])

  const status: BillingStatus = useMemo(() => {
    if (!isNative && !isWeb) return "unsupported"
    if (error) return "error"
    if (subscriptionQuery === undefined || isBusy) return "loading"
    if (!userId) return "idle"
    return "ready"
  }, [error, isBusy, isNative, isWeb, subscriptionQuery, userId])

  const customerInfo = serverStatus as BillingSubscriptionStatus | null
  const managementUrl = customerInfo?.managementUrl ?? null
  const subscriptionStore = customerInfo?.store?.toLowerCase()
  // A web subscription cannot be cancelled from inside a native app store
  // build; the user has to do it on the web.
  const requiresWebCancellation =
    isNative &&
    (subscriptionStore === "rc_billing" ||
      subscriptionStore?.includes("stripe") === true)
  const cancelOpensManagement = !requiresWebCancellation && isNative

  return useMemo(
    () => ({
      customerInfo,
      currentOffering: null,
      error,
      isConfigured,
      isNative,
      isWeb,
      monthlyPackage: monthlyProduct,
      status,
      cancelOpensManagement,
      cancelSubscription,
      requiresWebCancellation,
      canPurchase: isNative
        ? status !== "loading" &&
          status !== "unsupported" &&
          Boolean(monthlyProduct)
        : isWeb && subscriptionQuery?.webProvider === "stripe",
      hasActiveSubscription: hasActiveSubscription(customerInfo),
      hasOneRepPro: hasOneRepPro(customerInfo),
      monthlyPrice:
        monthlyProduct?.displayPrice ??
        subscriptionQuery?.monthlyPriceLabel ??
        null,
      purchaseMonthly,
      refresh,
      restorePurchases,
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
      cancelOpensManagement,
      cancelSubscription,
      customerInfo,
      error,
      isConfigured,
      isNative,
      isWeb,
      managementUrl,
      monthlyProduct,
      purchaseMonthly,
      refresh,
      requiresWebCancellation,
      restorePurchases,
      status,
      subscriptionQuery?.monthlyPriceLabel,
      subscriptionQuery?.webProvider,
    ]
  )
}
