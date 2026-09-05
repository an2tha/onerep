import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { Browser } from "@capacitor/browser"
import { useAction, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { trackUmami } from "@/lib/analytics"
import {
  currentStoreEntitlements,
  fetchStoreProducts,
  finishStoreTransaction,
  onStoreTransaction,
  purchaseStoreProduct,
  restoreStorePurchases,
  storeKitAvailable,
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
 * Worth naming precisely, because it decides where the user has to go to
 * cancel. `play_store` is the one dead end left: Play billing was removed and
 * those rows grant nothing, but the label stays so somebody looking at an
 * unexplained charge can at least tell who is charging them.
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
  // Naming where a subscription is billed is useful to somebody who has one.
  // Naming it to somebody on iOS who has *not* bought anything is a sentence
  // that reads "there is a web checkout, go and find it" — which is the thing
  // guideline 3.1.1 exists to stop. Telling a subscriber who charges them
  // stays; advertising a till they are not standing at does not.
  const namesAnotherTill = isNative && !/App Store/.test(origin)

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

  return {
    title: "Free plan",
    detail: namesAnotherTill
      ? "No active subscription on this account."
      : `No active subscription found with ${origin}.`,
    tone: "muted",
    canRetry: false,
  }
}

export function useBilling({ userId }: UseBillingOptions) {
  const isNative = isNativePurchasesAvailable()
  const isWeb = isWebPurchasesAvailable()
  const storeKit = storeKitSupported()

  const subscriptionQuery = useQuery(api.billing.public.getStatus, {})
  const refreshStatus = useAction(api.billing.public.refreshStatus)
  const cancelAction = useAction(api.billing.public.cancelSubscription)
  const manageAction = useAction(api.billing.public.createManagementSession)
  const createCheckout = useAction(api.billing.public.createCheckout)
  const storeIdentity = useAction(api.billing.public.getStoreIdentity)
  const redeemTransaction = useAction(api.billing.public.redeemAppleTransaction)

  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [storeProduct, setStoreProduct] = useState<StoreProduct | null>(null)
  const [storeReady, setStoreReady] = useState(false)
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

  /** Load the catalogue once, and only where there is a catalogue to load. */
  useEffect(() => {
    if (!storeKit || !appleProvider || !monthlyProductId) return
    let cancelled = false

    void (async () => {
      const available = await storeKitAvailable()
      const products = available
        ? await fetchStoreProducts([monthlyProductId])
        : []
      if (cancelled || !mounted.current) return
      setStoreProduct(products[0] ?? null)
      setStoreReady(available)
    })()

    return () => {
      cancelled = true
    }
  }, [appleProvider, monthlyProductId, storeKit])

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
   * Buy the monthly plan, through whichever till this platform has.
   *
   * On iOS that is StoreKit and nothing else — no link out, no web checkout in
   * a browser sheet, no mention of a cheaper price elsewhere. Apple's cut is
   * the cost of the button being there at all, and the alternative is a review
   * rejection rather than a saving.
   */
  const purchaseNative = useCallback(
    async (source: string) => {
      setError(null)
      setIsBusy(true)
      try {
        if (!monthlyProductId) {
          setError("Subscriptions are unavailable right now. Try again later.")
          return null
        }

        // Minted server-side and attached before the sheet opens, so even a
        // purchase whose confirmation never reaches us is attributable later.
        let appAccountToken: string | undefined
        try {
          appAccountToken = (await storeIdentity({})).appAccountToken
        } catch {
          // Not fatal. Attribution falls back to this same signed-in user
          // redeeming the transaction, which is the common case anyway.
        }

        trackUmami("checkout_started", { source, store: "app_store" })
        const outcome = await purchaseStoreProduct({
          productId: monthlyProductId,
          appAccountToken,
        })

        if (outcome.status === "cancelled") {
          trackUmami("checkout_abandoned", { store: "app_store" })
          return null
        }
        if (outcome.status === "pending") {
          // Ask to Buy, or a bank asking for confirmation. The answer arrives
          // through Transaction.updates whenever it arrives.
          setError(
            "Your purchase needs approval before it can finish. We'll unlock Pro as soon as it comes through."
          )
          return null
        }
        if (outcome.status !== "purchased") {
          setError("The App Store couldn't complete that purchase.")
          return null
        }

        const redemption = await redeem(outcome)
        if (!redemption.redeemed) {
          // The money moved and the entitlement did not. Say so plainly, and
          // leave the transaction unfinished so the next launch retries it.
          setError(
            "The App Store took your purchase but we couldn't confirm it. It'll finish on its own shortly — contact support if it doesn't."
          )
          return null
        }

        trackUmami("checkout_completed", { store: "app_store" })
        return redemption.status ?? null
      } catch (cause) {
        trackUmami("checkout_start_failed", { source, store: "app_store" })
        if (mounted.current) {
          setError(
            billingErrorMessage(cause, "Could not complete the purchase")
          )
        }
        return null
      } finally {
        if (mounted.current) setIsBusy(false)
      }
    },
    [monthlyProductId, redeem, storeIdentity]
  )

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
        if (redemption.redeemed) {
          restored += 1
          status = redemption.status ?? status
        }
      }
      if (restored === 0) {
        setError("No previous purchases were found on this Apple Account.")
      }
      return { restored, status }
    } catch (cause) {
      if (mounted.current) {
        setError(billingErrorMessage(cause, "Could not restore purchases"))
      }
      return { restored: 0, status: null }
    } finally {
      if (mounted.current) setIsBusy(false)
    }
  }, [redeem, storeKit])

  /**
   * Start Stripe Checkout, which navigates away.
   *
   * Web only. On native the call is routed to StoreKit before it gets here;
   * the guard stays because a Stripe redirect inside the app would be a
   * guideline 3.1.1 violation wearing a bug's clothes.
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
          setError(billingErrorMessage(cause, "Could not start checkout"))
        }
        return null
      } finally {
        if (mounted.current) setIsBusy(false)
      }
    },
    [createCheckout, isNative]
  )

  const purchaseMonthly = useCallback(
    async (source = "unknown") =>
      isNative ? await purchaseNative(source) : await purchaseWeb(source),
    [isNative, purchaseNative, purchaseWeb]
  )

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
      trackUmami("billing_portal_opened")
      await openExternally(result.url)
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
      // Native can buy once the device allows purchases, the server can verify
      // one, and StoreKit has returned the product with its localized price.
      // A purchase surface without that price fails both users and App Review;
      // an empty catalogue is therefore unavailable, not a usable checkout.
      canPurchase: isNative
        ? storeReady && appleProvider && storeProduct !== null
        : isWeb && subscriptionQuery?.webProvider === "stripe",
      canRestore: storeKit,
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
          ? `${storeProduct.displayPrice} / ${storeProduct.period}`
          : storeProduct.displayPrice
        : isNative
          ? null
          : (subscriptionQuery?.monthlyPriceLabel ?? null),
      purchaseMonthly,
      restorePurchases,
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
      appleProvider,
      cancelSubscription,
      openBillingManagement,
      customerInfo,
      error,
      isConfigured,
      isNative,
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
