import { tr, translateError } from "@repo/ui/i18n"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { Browser } from "@capacitor/browser"
import { useAction, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { loadStoreProduct } from "@/lib/billing-catalogue"
import { trackUmami } from "@/lib/analytics"
import { billingPeriodLabel } from "@/lib/billing-period"
import { canOfferProUpgrade } from "@/lib/billing-policy"
import {
  currentStoreEntitlements,
  finishStoreTransaction,
  onStoreTransaction,
  purchaseStoreProduct,
  restoreStorePurchases,
  storeKitSupported,
  type SignedTransaction,
  type StoreProduct,
} from "@/lib/billing-plugin"

/**
 * Billing hook for OneRep Pro, sold through Stripe on the web and StoreKit in
 * the iOS app.
 *
 * Which one a person used is not a distinction the rest of the app is allowed
 * to care about. Both produce a row on the server, the server reduces every
 * row to one entitlement, and this hook reports that entitlement. Someone who
 * subscribed in a browser opens the phone and has Pro; someone who bought it on
 * the phone opens a browser and has Pro.
 *
 * The governing rule is unchanged, and StoreKit does not weaken it: the client
 * never decides entitlement. The most a purchase can do here is hand Convex a
 * payload Apple signed and then re-read what Convex made of it through
 * `api.billing.public.getStatus`.
 */

export const NATIVE_SUBSCRIPTION_MESSAGE = tr(
  "Subscriptions can't be managed on this device."
)

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

/**
 * Open a billing URL outside the app.
 *
 * `window.open` inside the Capacitor WKWebView is not reliably a navigation —
 * it can return null and do nothing, which turns "Manage in the App Store"
 * into a button that visibly does nothing. That is a worse bug than it sounds
 * on the one screen where somebody is trying to stop paying us. The Browser
 * plugin hands the URL to the system, which is also what makes
 * apps.apple.com/account/subscriptions bounce into Settings rather than
 * rendering a web page about subscriptions.
 */
async function openExternally(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url })
    return
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer")
  if (!opened) window.location.assign(url)
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
    return tr("Couldn’t reach billing. Check your connection and retry.")
  }
  if (/not configured|unauthorized|forbidden|unavailable/i.test(message)) {
    return tr("Billing is temporarily unavailable. Try again later.")
  }
  return tr(
    "We couldn’t confirm your subscription. Retry, and contact support if it keeps happening."
  )
}

/**
 * Where an existing subscription was bought.
 *
 * Worth naming precisely, because it decides where the user has to go to
 * cancel. `play_store` is the one dead end left: Play billing was removed and
 * those rows grant nothing, but the label stays so somebody looking at an
 * unexplained charge can at least tell who is charging them.
 */
function subscriptionStoreLabel(store: string | null | undefined) {
  const normalized = store?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes("app_store") || normalized.includes("apple")) {
    return tr("App Store")
  }
  if (normalized.includes("play_store") || normalized.includes("google")) {
    return tr("Google Play")
  }
  if (normalized === "rc_billing" || normalized.includes("stripe")) {
    return tr("Web checkout")
  }
  return tr("your store")
}

function subscriptionSourceLabel(source: string | undefined) {
  if (source?.startsWith("apple")) return tr("App Store")
  if (source?.startsWith("google")) return tr("Google Play")
  if (source?.startsWith("stripe")) return tr("Stripe")
  return tr("your OneRep account")
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
  // Naming where a subscription is billed is useful to somebody who has one.
  // Naming it to somebody on iOS who has *not* bought anything is a sentence
  // that reads "there is a web checkout, go and find it" — which is the thing
  // guideline 3.1.1 exists to stop. Telling a subscriber who charges them
  // stays; advertising a till they are not standing at does not.
  const namesAnotherTill = isNative && !/App Store/.test(origin)

  if (error) {
    return {
      title: tr("Subscription needs attention"),
      detail: subscriptionDiagnosticError(error),
      tone: "attention",
      canRetry,
    }
  }

  if (status === "loading") {
    return {
      title: tr("Checking subscription"),
      detail: tr("Your current access stays available while we check."),
      tone: "pending",
      canRetry: false,
    }
  }

  if (status === "unsupported") {
    return {
      title: tr("Subscription unavailable"),
      detail: tr("Open OneRep in a browser to manage OneRep Pro."),
      tone: "muted",
      canRetry: false,
    }
  }

  if (!isConfigured) {
    return {
      title: tr("Connecting subscriptions"),
      detail: tr(
        "Status will update automatically when your account is ready."
      ),
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
      title: tr("Payment needs attention"),
      detail: tr("Update your payment method to keep Pro."),
      tone: "attention",
      canRetry,
    }
  }

  if (hasOneRepPro(customerInfo)) {
    return {
      title: tr("Pro active"),
      detail:
        customerInfo?.state === "canceled"
          ? tr("Pro stays active until the end of your current period.")
          : tr("Your subscription is confirmed with {{value0}}.", {
              value0: origin,
            }),
      tone: "success",
      canRetry: false,
    }
  }

  return {
    title: tr("Free plan"),
    detail: namesAnotherTill
      ? tr("No active subscription on this account.")
      : tr("No active subscription found with {{value0}}.", { value0: origin }),
    tone: "muted",
    canRetry: false,
  }
}

export function useBilling({ userId }: UseBillingOptions) {
  const isNative = isNativePurchasesAvailable()
  const canUpgrade = canOfferProUpgrade(isNative)
  const isIos = isNative && Capacitor.getPlatform() === "ios"
  const isWeb = isWebPurchasesAvailable()
  const storeKit = storeKitSupported()

  const subscriptionQuery = useQuery(api.billing.public.getStatus, {})
  const subscriptionLoaded = subscriptionQuery !== undefined
  const refreshStatus = useAction(api.billing.public.refreshStatus)
  const cancelAction = useAction(api.billing.public.cancelSubscription)
  const manageAction = useAction(api.billing.public.createManagementSession)
  const createCheckout = useAction(api.billing.public.createCheckout)
  const getStoreIdentity = useAction(api.billing.public.getStoreIdentity)
  const redeemTransaction = useAction(api.billing.public.redeemAppleTransaction)

  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null)
  const purchaseInFlight = useRef(false)
  const [storeProduct, setStoreProduct] = useState<StoreProduct | null>(null)
  const [storeReady, setStoreReady] = useState(false)
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  const catalogueRequest = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const monthlyProductId =
    subscriptionQuery?.offering?.monthlyProductId ?? undefined
  const appleProvider = subscriptionQuery?.appleProvider ?? false

  /**
   * Redeem one signed transaction, then finish it.
   *
   * Order matters and only in this direction: StoreKit keeps re-offering an
   * unfinished transaction on every launch, which is the recovery mechanism
   * for a purchase whose server round trip died on a train. Finishing before
   * the server has agreed throws that mechanism away to save a few hundred
   * milliseconds.
   */
  const redeem = useCallback(
    async (transaction: SignedTransaction) => {
      const result = await redeemTransaction({
        signedTransaction: transaction.signedTransaction,
      })
      if (result.redeemed) {
        await finishStoreTransaction(transaction.transactionId)
      }
      return result
    },
    [redeemTransaction]
  )

  const reloadProducts = useCallback(async () => {
    const request = ++catalogueRequest.current
    setStoreProduct(null)
    setStoreReady(false)
    setCatalogueError(null)

    if (!canUpgrade) {
      setCatalogueLoading(false)
      return
    }
    if (!isIos || !storeKit || !appleProvider || !monthlyProductId) {
      setCatalogueLoading(false)
      if (isIos && subscriptionLoaded) {
        setCatalogueError(
          translateError(
            tr(
              "App Store subscriptions are unavailable right now. Please retry."
            )
          )
        )
      }
      return
    }
    setCatalogueLoading(true)
    try {
      const product = await loadStoreProduct(monthlyProductId)
      if (!mounted.current || request !== catalogueRequest.current) return
      setStoreProduct(product)
      setStoreReady(true)
    } catch (cause) {
      if (!mounted.current || request !== catalogueRequest.current) return
      setCatalogueError(
        billingErrorMessage(
          cause,
          tr("Could not load subscription plans. Please retry.")
        )
      )
    } finally {
      if (mounted.current && request === catalogueRequest.current)
        setCatalogueLoading(false)
    }
  }, [
    appleProvider,
    canUpgrade,
    isIos,
    monthlyProductId,
    storeKit,
    subscriptionLoaded,
  ])

  useEffect(() => {
    void reloadProducts()
    const retry = () => {
      void reloadProducts()
    }
    const resume = () => {
      if (document.visibilityState === "visible") retry()
    }
    window.addEventListener("online", retry)
    document.addEventListener("visibilitychange", resume)
    return () => {
      catalogueRequest.current += 1
      window.removeEventListener("online", retry)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [reloadProducts])

  /**
   * Catch up on anything StoreKit is still holding.
   *
   * Runs on sign-in rather than on launch: a transaction has to belong to
   * somebody, and before the user is known the server has nobody to attribute
   * it to. This is what rescues a purchase that completed while the app was
   * being force-quit, and what carries a subscription onto a reinstall without
   * anyone tapping Restore.
   */
  useEffect(() => {
    if (!storeKit || !appleProvider || !userId) return
    let cancelled = false

    void (async () => {
      const transactions = await currentStoreEntitlements()
      for (const transaction of transactions) {
        if (cancelled) return
        try {
          await redeem(transaction)
        } catch {
          // Offline, or the server said no. The cron and the next launch both
          // get another go, and a failed redemption must not surface as an
          // error on a screen the user did not ask for.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [appleProvider, redeem, storeKit, userId])

  /** Renewals and Ask to Buy approvals that land while the app is open. */
  useEffect(() => {
    if (!storeKit || !userId) return
    return onStoreTransaction((transaction) => {
      void redeem(transaction).catch(() => {})
    })
  }, [redeem, storeKit, userId])

  const serverStatus = subscriptionQuery?.status ?? null
  const isConfigured = Boolean(userId) && subscriptionQuery !== undefined

  const refresh = useCallback(async () => {
    if (!userId) return serverStatus
    try {
      await Promise.all([refreshStatus({}), reloadProducts()])
      if (mounted.current) setError(null)
    } catch (cause) {
      if (mounted.current) {
        setError(
          translateError(
            billingErrorMessage(cause, tr("Could not refresh subscription"))
          )
        )
      }
    }
    // The Convex query is reactive, so the fresh value arrives on its own.
    return serverStatus
  }, [refreshStatus, reloadProducts, serverStatus, userId])

  /**
   * Restore Purchases.
   *
   * Required by App Review, and genuinely needed: a reinstall, a new phone, or
   * a second OneRep account on the same Apple Account all end up here. It
   * prompts for the Apple Account password, so it only ever runs from a tap.
   */
  const restorePurchases = useCallback(async () => {
    if (!storeKit) return { restored: 0, status: null }
    setError(null)
    setIsBusy(true)
    try {
      const transactions = await restoreStorePurchases()
      let restored = 0
      let status: BillingSubscriptionStatus | null = null
      for (const transaction of transactions) {
        const redemption = await redeem(transaction)
        if (!redemption.redeemed) {
          throw new Error(
            "Could not verify this purchase. Please retry restoring purchases."
          )
        }
        restored += 1
        status = redemption.status ?? status
      }
      if (restored === 0) {
        setError(
          translateError(
            tr("No previous purchases were found on this Apple Account.")
          )
        )
      }
      return { restored, status }
    } catch (cause) {
      if (mounted.current) {
        setError(
          translateError(
            billingErrorMessage(cause, tr("Could not restore purchases"))
          )
        )
      }
      return { restored: 0, status: null }
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [redeem, storeKit])

  /**
   * Start Stripe Checkout, which navigates away.
   *
   * Web only. Native apps display subscription status without managing it.
   */
  const purchaseWeb = useCallback(
    async (source = "unknown") => {
      if (isNative) return null
      setError(null)
      setIsBusy(true)
      try {
        const { url } = await createCheckout({})
        // Fired before the redirect: once `assign` lands there is no page left
        // to fire from, and this is the top of the only funnel that earns money.
        trackUmami("checkout_started", { source })
        window.location.assign(url)
        return null
      } catch (cause) {
        trackUmami("checkout_start_failed", { source })
        if (mounted.current) {
          setError(
            translateError(
              billingErrorMessage(cause, tr("Could not start checkout"))
            )
          )
        }
        return null
      } finally {
        if (mounted.current) setIsBusy(false)
      }
    },
    [createCheckout, isNative]
  )

  const purchaseMonthly = useCallback(
    async (source = "unknown") => {
      if (!canOfferProUpgrade(isNative))
        throw new Error(tr("Upgrade unavailable"))
      if (!isNative) return await purchaseWeb(source)
      if (!storeKit) throw new Error(NATIVE_SUBSCRIPTION_MESSAGE)
      if (!userId || !appleProvider || !storeReady || !storeProduct) {
        throw new Error(
          "The subscription is not ready yet. Please retry loading plans."
        )
      }
      if (purchaseInFlight.current) return null
      purchaseInFlight.current = true
      setError(null)
      setPurchaseNotice(null)
      setIsBusy(true)
      try {
        const { appAccountToken } = await getStoreIdentity({})
        const outcome = await purchaseStoreProduct({
          productId: storeProduct.id,
          appAccountToken,
        })
        if (outcome.status === "cancelled") throw new Error("Purchase canceled")
        if (outcome.status === "pending") {
          setPurchaseNotice(
            tr(
              "Your purchase is awaiting Apple approval. Pro will unlock after approval and verification."
            )
          )
          return null
        }
        if (outcome.status !== "purchased") {
          throw new Error(
            "The App Store could not complete your purchase. Please try again."
          )
        }
        const result = await redeem(outcome)
        if (!result.redeemed) {
          throw new Error(
            "Your purchase could not be verified yet. Use Restore purchases to try again."
          )
        }
        return result.status ?? null
      } catch (cause) {
        const message = billingErrorMessage(
          cause,
          tr("Could not complete your purchase")
        )
        if (mounted.current && message !== "Purchase canceled")
          setError(translateError(message))
        throw cause
      } finally {
        purchaseInFlight.current = false
        if (mounted.current) setIsBusy(false)
      }
    },
    [
      appleProvider,
      getStoreIdentity,
      isNative,
      purchaseWeb,
      redeem,
      storeKit,
      storeProduct,
      storeReady,
      userId,
    ]
  )

  /**
   * Hands the user to Stripe's Customer Portal, where cancelling, resuming,
   * swapping payment method, and invoices all live.
   *
   * Preferred over `cancelSubscription`: it keeps every billing surface on
   * Stripe rather than reimplementing a subset in-app.
   */
  const openBillingManagement = useCallback(async () => {
    if (isNative) {
      if (!isIos || serverStatus?.store !== "app_store") {
        throw new Error(NATIVE_SUBSCRIPTION_MESSAGE)
      }
      await openExternally("https://apps.apple.com/account/subscriptions")
      return true
    }
    setError(null)
    setIsBusy(true)
    try {
      const result = await manageAction({})
      if (result.kind === "none") {
        setError(translateError(result.reason))
        return false
      }
      trackUmami("billing_portal_opened")
      await openExternally(result.url)
      return true
    } catch (cause) {
      if (mounted.current) {
        setError(
          translateError(
            billingErrorMessage(
              cause,
              tr("Could not open subscription management")
            )
          )
        )
      }
      return false
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [isIos, isNative, manageAction, serverStatus?.store])

  const cancelSubscription = useCallback(async () => {
    if (isNative) {
      await openBillingManagement()
      return serverStatus
    }
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
        setError(
          translateError(
            billingErrorMessage(cause, tr("Could not cancel subscription"))
          )
        )
      }
      return null
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [cancelAction, isNative, openBillingManagement, serverStatus])

  const status: BillingStatus = useMemo(() => {
    if (!isNative && !isWeb) return "unsupported"
    if (error || catalogueError) return "error"
    if (subscriptionQuery === undefined || isBusy || catalogueLoading)
      return "loading"
    if (!userId) return "idle"
    return "ready"
  }, [
    error,
    catalogueError,
    catalogueLoading,
    isBusy,
    isNative,
    isWeb,
    subscriptionQuery,
    userId,
  ])

  const customerInfo = serverStatus as BillingSubscriptionStatus | null
  const managementUrl = customerInfo?.managementUrl ?? null

  return useMemo(
    () => ({
      customerInfo,
      currentOffering: null,
      error: error ?? catalogueError,
      catalogueLoading,
      reloadProducts,
      isConfigured,
      isNative,
      isIos,
      isWeb,
      status,
      cancelSubscription,
      openBillingManagement,
      canPurchase:
        canUpgrade &&
        Boolean(userId) &&
        (isNative
          ? storeKit && appleProvider && storeReady
          : isWeb && subscriptionQuery?.webProvider === "stripe"),
      canRestore: storeKit && Boolean(userId),
      canUpgrade,
      purchaseNotice: hasOneRepPro(customerInfo) ? null : purchaseNotice,
      hasActiveSubscription: hasActiveSubscription(customerInfo),
      hasOneRepPro: hasOneRepPro(customerInfo),
      // StoreKit's price wins where there is one: it is localised, in the
      // right currency, and reflects whatever regional price Apple set. The
      // server label is a single number that is correct in one country.
      //
      // `displayPrice` is the amount and nothing else — "€3.99" — so the
      // renewal period gets glued back on. App Review reads a bare amount as
      // a one-off purchase, and so, more to the point, does everybody else.
      //
      // And on iOS the server label is not a fallback, it is a lie waiting to
      // happen: it is one hardcoded euro figure, while the App Store charges
      // whatever Apple set for the buyer's storefront. Better to show no price
      // and let the purchase sheet quote it than to show the wrong one to
      // everybody outside the eurozone.
      monthlyPrice: storeProduct
        ? storeProduct.period
          ? `${storeProduct.displayPrice} / ${billingPeriodLabel(storeProduct.period)}`
          : storeProduct.displayPrice
        : isNative
          ? null
          : (subscriptionQuery?.monthlyPriceLabel ?? null),
      purchaseMonthly,
      restorePurchases,
      refresh,
      subscriptionDiagnostic:
        purchaseNotice &&
        !hasOneRepPro(customerInfo) &&
        !error &&
        !catalogueError
          ? {
              title: tr("Awaiting approval"),
              detail: purchaseNotice,
              tone: "pending" as const,
              canRetry: false,
            }
          : subscriptionDiagnosticCopy({
              customerInfo,
              error: error ?? catalogueError,
              isConfigured,
              isNative,
              isWeb,
              status,
            }),
      subscriptionManagementUrl: managementUrl,
    }),
    [
      appleProvider,
      canUpgrade,
      catalogueError,
      catalogueLoading,
      reloadProducts,
      cancelSubscription,
      openBillingManagement,
      customerInfo,
      error,
      isConfigured,
      isNative,
      isIos,
      userId,
      purchaseNotice,
      isWeb,
      managementUrl,
      purchaseMonthly,
      restorePurchases,
      refresh,
      status,
      storeKit,
      storeProduct,
      storeReady,
      subscriptionQuery?.monthlyPriceLabel,
      subscriptionQuery?.webProvider,
    ]
  )
}
