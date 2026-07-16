import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import {
  LOG_LEVEL,
  Purchases,
  type CustomerInfo,
  type PurchasesCallbackId,
  type PurchasesOffering,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor"
import { useAction, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"

export const ONEREP_PRO_ENTITLEMENT = "OneRep Pro"
export const MONTHLY_PACKAGE_IDENTIFIER = "monthly"
export const REVENUECAT_OFFERING_IDENTIFIER = "default"
const REVENUECAT_REQUEST_TIMEOUT_MS = 8000

export type RevenueCatStatus =
  "idle" | "loading" | "ready" | "unsupported" | "error"

export type SubscriptionDiagnosticTone =
  "success" | "pending" | "attention" | "muted"

export type SubscriptionDiagnostic = {
  title: string
  detail: string
  tone: SubscriptionDiagnosticTone
  canRetry: boolean
}
type AnyCustomerInfo = CustomerInfo | ConvexSubscriptionStatus
type AnyOffering = PurchasesOffering
type AnyPackage = PurchasesPackage

type ConvexSubscriptionStatus = {
  activeSubscriptions: string[]
  expiresAt: string | null
  fetchedAt: number
  hasActiveSubscription: boolean
  isActive: boolean
  managementUrl: string | null
  productIdentifier: string | null
  source: "revenuecat_api" | "revenuecat_webhook" | "manual"
  store: string | null
  updatedAt?: number
}

type RevenueCatState = {
  customerInfo: AnyCustomerInfo | null
  currentOffering: AnyOffering | null
  error: string | null
  isConfigured: boolean
  isNative: boolean
  isWeb: boolean
  monthlyPackage: AnyPackage | null
  status: RevenueCatStatus
}

type UseRevenueCatOptions = {
  email?: string | null
  name?: string | null
  userId?: string | null
}

let configuredAppUserId: string | null = null
let configurePromise: Promise<void> | null = null
let configuredNativeSdkKey: string | null = null
const inFlightStatusRefreshes = new Map<string, Promise<unknown>>()

function refreshServerStatus<T>(
  userId: string | null | undefined,
  request: () => Promise<T>
) {
  const key = userId ?? "anonymous"
  const existing = inFlightStatusRefreshes.get(key) as Promise<T> | undefined
  if (existing) return existing

  const requestPromise = request().finally(() => {
    if (inFlightStatusRefreshes.get(key) === requestPromise) {
      inFlightStatusRefreshes.delete(key)
    }
  })
  inFlightStatusRefreshes.set(key, requestPromise)
  return requestPromise
}

function revenueCatErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      code?: unknown
      message?: unknown
      readableErrorCode?: unknown
      underlyingErrorMessage?: unknown
      userCancelled?: unknown
      userInfo?: { readableErrorCode?: unknown }
    }
    if (maybeError.userCancelled === true) return "Purchase canceled"
    const readable =
      maybeError.userInfo?.readableErrorCode ?? maybeError.readableErrorCode
    const message =
      maybeError.message ?? maybeError.underlyingErrorMessage ?? readable
    if (typeof message === "string" && message.trim().length > 0) {
      return message
    }
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
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

function getMonthlyPackage(offering: AnyOffering | null): AnyPackage | null {
  if (!offering) return null
  return (
    offering.monthly ??
    offering.availablePackages.find(
      (item) => item.identifier === MONTHLY_PACKAGE_IDENTIFIER
    ) ??
    null
  )
}

function getConfiguredOffering<
  T extends { all: Record<string, AnyOffering>; current: AnyOffering | null },
>(offerings: T) {
  return offerings.all[REVENUECAT_OFFERING_IDENTIFIER] ?? offerings.current
}

type EntitlementContainer = {
  entitlements?: {
    active?: Record<string, unknown>
    all?: Record<string, { isActive?: boolean } | undefined>
  }
  activeSubscriptions?: Set<string> | string[]
  isActive?: boolean
  hasActiveSubscription?: boolean
  managementUrl?: string | null
  managementURL?: string | null
  store?: string | null
  source?: ConvexSubscriptionStatus["source"]
}

function subscriptionManagementUrl(customerInfo: AnyCustomerInfo | null) {
  const info = customerInfo as EntitlementContainer | null
  return info?.managementURL ?? info?.managementUrl ?? null
}

function openSubscriptionManagement(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer")
  if (!opened) window.location.assign(url)
}

function isEntitlementActive(
  customerInfo: AnyCustomerInfo | null,
  entitlementIdentifier: string
) {
  const info = customerInfo as EntitlementContainer | null
  if (!info?.entitlements) return false

  if (info.entitlements.active?.[entitlementIdentifier]) return true
  return info.entitlements.all?.[entitlementIdentifier]?.isActive === true
}

function hasOneRepPro(customerInfo: AnyCustomerInfo | null) {
  if ((customerInfo as EntitlementContainer | null)?.isActive === true) {
    return true
  }
  return isEntitlementActive(customerInfo, ONEREP_PRO_ENTITLEMENT)
}

function hasActiveSubscription(customerInfo: AnyCustomerInfo | null) {
  if (hasOneRepPro(customerInfo)) return true
  if (
    (customerInfo as EntitlementContainer | null)?.hasActiveSubscription ===
    true
  ) {
    return true
  }
  const subscriptions = (customerInfo as EntitlementContainer | null)
    ?.activeSubscriptions
  if (subscriptions instanceof Set) return subscriptions.size > 0
  return Array.isArray(subscriptions) && subscriptions.length > 0
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
  if (
    /api.?key|sdk.?key|not configured|unauthorized|forbidden/i.test(message)
  ) {
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

function subscriptionSourceLabel(
  source: ConvexSubscriptionStatus["source"] | undefined,
  isNative: boolean
) {
  if (source === "revenuecat_webhook") return "RevenueCat sync"
  if (source === "revenuecat_api") return "RevenueCat"
  if (source === "manual") return "account record"
  return isNative ? "this device" : "RevenueCat"
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
  customerInfo: unknown
  error: string | null
  isConfigured: boolean
  isNative: boolean
  isWeb: boolean
  status: RevenueCatStatus
}): SubscriptionDiagnostic {
  const info = customerInfo as EntitlementContainer | null
  const canRetry = isNative || isWeb
  const store = subscriptionStoreLabel(info?.store)
  const source = subscriptionSourceLabel(info?.source, isNative)
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

  if (hasOneRepPro(customerInfo as AnyCustomerInfo | null)) {
    return {
      title: "Pro active",
      detail: `Status confirmed via ${origin}.`,
      tone: "success",
      canRetry: false,
    }
  }

  if (hasActiveSubscription(customerInfo as AnyCustomerInfo | null)) {
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

function monthlyPriceString(monthlyPackage: AnyPackage | null) {
  if (!monthlyPackage) return null
  if ("product" in monthlyPackage) {
    return monthlyPackage.product.priceString
  }
  return null
}

function withRevenueCatTimeout<T>(promise: Promise<T>, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} timed out`))
    }, REVENUECAT_REQUEST_TIMEOUT_MS)

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

async function configureRevenueCat(appUserId: string, apiKey: string) {
  if (
    configuredAppUserId === appUserId &&
    configuredNativeSdkKey === apiKey &&
    configurePromise
  ) {
    await configurePromise
    return
  }

  configuredAppUserId = appUserId
  configuredNativeSdkKey = apiKey
  configurePromise = (async () => {
    await Purchases.setLogLevel({
      level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO,
    })
    await Purchases.configure({
      apiKey,
      appUserID: appUserId,
    })
  })()

  await configurePromise
}

async function syncCustomerAttributes(options: UseRevenueCatOptions) {
  const tasks: Promise<unknown>[] = []
  if (options.email !== undefined) {
    tasks.push(Purchases.setEmail({ email: options.email ?? null }))
  }
  if (options.name !== undefined) {
    tasks.push(Purchases.setDisplayName({ displayName: options.name ?? null }))
  }
  await Promise.allSettled(tasks)
}

export function useRevenueCat({ email, name, userId }: UseRevenueCatOptions) {
  const isNative = isNativePurchasesAvailable()
  const isWeb = isWebPurchasesAvailable()
  const listenerIdRef = useRef<PurchasesCallbackId | null>(null)
  const subscriptionQuery = useQuery(api.subscriptions.getStatus)
  const createCheckout = useAction(api.subscriptions.createCheckout)
  const cancelFromRevenueCat = useAction(api.subscriptions.cancelFromRevenueCat)
  const refreshFromRevenueCat = useAction(
    api.subscriptions.refreshFromRevenueCat
  )
  const [state, setState] = useState<RevenueCatState>({
    customerInfo: null,
    currentOffering: null,
    error: null,
    isConfigured: false,
    isNative,
    isWeb,
    monthlyPackage: null,
    status: isNative || isWeb ? "idle" : "unsupported",
  })

  useEffect(() => {
    if (isNative || subscriptionQuery === undefined) return
    const status = subscriptionQuery.status
    setState((current) => ({
      ...current,
      customerInfo: status,
      currentOffering: null,
      error: null,
      isConfigured: Boolean(subscriptionQuery.appUserId),
      isNative,
      isWeb,
      monthlyPackage: null,
      status: isWeb ? "ready" : "unsupported",
    }))
  }, [isNative, isWeb, subscriptionQuery])

  const refresh = useCallback(async () => {
    if (!isNative && !isWeb) return null
    setState((current) => ({ ...current, error: null, status: "loading" }))
    try {
      if (!isNative) {
        const status = await withRevenueCatTimeout(
          refreshServerStatus(userId, () => refreshFromRevenueCat({})),
          "Subscription status"
        )
        setState((current) => ({
          ...current,
          customerInfo: status,
          currentOffering: null,
          error: null,
          isConfigured: true,
          isNative,
          isWeb,
          monthlyPackage: null,
          status: "ready",
        }))
        return status
      }
      const customerInfoPromise = isNative ? Purchases.getCustomerInfo() : null
      const offeringsPromise = isNative ? Purchases.getOfferings() : null
      if (!customerInfoPromise || !offeringsPromise) {
        setState((current) => ({
          ...current,
          error: "Subscription service is not ready. Try again in a moment.",
          status: "error",
        }))
        return null
      }
      const [customerInfoResult, offerings] = await Promise.all([
        withRevenueCatTimeout(customerInfoPromise, "Subscription status"),
        withRevenueCatTimeout(
          offeringsPromise as Promise<{
            all: Record<string, AnyOffering>
            current: AnyOffering | null
          }>,
          "Subscription products"
        ),
      ])
      const customerInfo = customerInfoResult.customerInfo
      const currentOffering = getConfiguredOffering(offerings)
      const monthlyPackage = getMonthlyPackage(currentOffering)
      setState((current) => ({
        ...current,
        customerInfo,
        currentOffering,
        error: null,
        isConfigured: true,
        isNative,
        isWeb,
        monthlyPackage,
        status: "ready",
      }))
      return customerInfo
    } catch (error) {
      const message = revenueCatErrorMessage(
        error,
        "Could not load subscription status"
      )
      setState((current) => ({
        ...current,
        error: message,
        status: "error",
      }))
      return null
    }
  }, [isNative, isWeb, refreshFromRevenueCat, userId])

  useEffect(() => {
    let canceled = false

    async function configure() {
      if (!isNative && !isWeb) {
        setState((current) => ({
          ...current,
          isNative,
          isWeb,
          status: "unsupported",
        }))
        return
      }
      if (!userId) {
        setState({
          customerInfo: null,
          currentOffering: null,
          error: null,
          isConfigured: false,
          isNative,
          isWeb,
          monthlyPackage: null,
          status: isNative || isWeb ? "idle" : "unsupported",
        })
        return
      }

      // Web state is already hydrated by the subscription query effect.
      // Do not replace a ready cached status with an idle loading state.
      if (hasHydratedWebSubscription(isNative, subscriptionQuery?.status))
        return

      setState((current) => ({ ...current, error: null, status: "loading" }))
      try {
        if (isNative) {
          const nativeSdkKey = subscriptionQuery?.nativeSdkKey
          if (!nativeSdkKey) {
            throw new Error(
              "RevenueCat native SDK key is not configured in Convex"
            )
          }
          await withRevenueCatTimeout(
            configureRevenueCat(userId, nativeSdkKey),
            "Subscription setup"
          )
          await syncCustomerAttributes({ email, name })
          if (canceled) return
          const listenerId = await Purchases.addCustomerInfoUpdateListener(
            (customerInfo) => {
              setState((current) => ({
                ...current,
                customerInfo,
                error: null,
                status: "ready",
              }))
              void refreshServerStatus(userId, () =>
                refreshFromRevenueCat({})
              ).catch(() => {
                // The SDK result is authoritative on-device; server sync is best effort.
              })
            }
          )
          listenerIdRef.current = listenerId
        } else if (!subscriptionQuery?.status) {
          await refresh()
        }
        if (isNative) await refresh()
      } catch (error) {
        if (canceled) return
        setState((current) => ({
          ...current,
          error: revenueCatErrorMessage(error, "Could not configure purchases"),
          status: "error",
        }))
      }
    }

    void configure()

    return () => {
      canceled = true
      const listenerId = listenerIdRef.current
      listenerIdRef.current = null
      if (listenerId) {
        void Purchases.removeCustomerInfoUpdateListener({
          listenerToRemove: listenerId,
        }).catch(() => {
          // Best-effort listener cleanup.
        })
      }
    }
  }, [
    isNative,
    isWeb,
    email,
    name,
    userId,
    refresh,
    refreshFromRevenueCat,
    subscriptionQuery,
  ])

  const restorePurchases = useCallback(async () => {
    if (!isNative) {
      const customerInfo = isWeb ? await refresh() : null
      if (customerInfo) return customerInfo
      throw new Error("Could not refresh desktop subscription status")
    }
    const { customerInfo } = await Purchases.restorePurchases()
    setState((current) => ({
      ...current,
      customerInfo,
      error: null,
      status: "ready",
    }))
    void refreshServerStatus(userId, () => refreshFromRevenueCat({})).catch(
      () => {
        // Webhook/server status can catch up without hiding a restored entitlement.
      }
    )
    return customerInfo
  }, [isNative, isWeb, refresh, refreshFromRevenueCat, userId])

  const purchaseMonthly = useCallback(async () => {
    const monthlyPackage = state.monthlyPackage
    if (!isNative) {
      if (typeof window === "undefined") {
        throw new Error("Checkout is only available in the browser")
      }
      const checkoutUrl = subscriptionQuery?.checkoutUrl
      if (checkoutUrl) {
        window.location.assign(checkoutUrl)
        return state.customerInfo
      }
      const checkout = await createCheckout({})
      window.location.assign(checkout.url)
      return state.customerInfo
    }
    if (!monthlyPackage) throw new Error("Monthly package is not configured")
    const { customerInfo } = await Purchases.purchasePackage({
      aPackage: monthlyPackage as PurchasesPackage,
    })
    setState((current) => ({
      ...current,
      customerInfo,
      error: null,
      status: "ready",
    }))
    void refreshServerStatus(userId, () => refreshFromRevenueCat({})).catch(
      () => {
        // Preserve the successful SDK purchase while server state catches up.
      }
    )
    return customerInfo
  }, [
    createCheckout,
    isNative,
    refreshFromRevenueCat,
    state.customerInfo,
    state.monthlyPackage,
    subscriptionQuery?.checkoutUrl,
    userId,
  ])

  const cancelSubscription = useCallback(async () => {
    const managementUrl = subscriptionManagementUrl(state.customerInfo)
    const store = (
      state.customerInfo as EntitlementContainer | null
    )?.store?.toLowerCase()
    const requiresWebCancellation =
      store === "rc_billing" || store?.includes("stripe") === true
    if (isNative && requiresWebCancellation) {
      throw new Error(
        "This subscription was purchased on the web. Open the OneRep web app to manage it."
      )
    }
    if (managementUrl && store !== "rc_billing") {
      openSubscriptionManagement(managementUrl)
      return state.customerInfo
    }
    if (isNative) {
      throw new Error(
        "Subscription management is not available yet. Refresh and try again."
      )
    }
    const status = await cancelFromRevenueCat({})
    setState((current) => ({
      ...current,
      customerInfo: status,
      currentOffering: null,
      error: null,
      isConfigured: true,
      isNative,
      isWeb,
      monthlyPackage: null,
      status: "ready",
    }))
    return status
  }, [cancelFromRevenueCat, isNative, isWeb, state.customerInfo])

  const managementUrl = subscriptionManagementUrl(state.customerInfo)
  const subscriptionStore = (
    state.customerInfo as EntitlementContainer | null
  )?.store?.toLowerCase()
  const requiresWebCancellation =
    isNative &&
    (subscriptionStore === "rc_billing" ||
      subscriptionStore?.includes("stripe") === true)
  const cancelOpensManagement =
    !requiresWebCancellation &&
    Boolean(managementUrl) &&
    subscriptionStore !== "rc_billing"

  return useMemo(
    () => ({
      ...state,
      cancelOpensManagement,
      cancelSubscription,
      requiresWebCancellation,
      canPurchase: isNative
        ? state.status !== "loading" &&
          state.status !== "unsupported" &&
          Boolean(state.monthlyPackage)
        : isWeb,
      hasActiveSubscription: hasActiveSubscription(state.customerInfo),
      hasOneRepPro: hasOneRepPro(state.customerInfo),
      monthlyPrice:
        monthlyPriceString(state.monthlyPackage) ??
        (isWeb ? (subscriptionQuery?.monthlyPriceLabel ?? null) : null),
      purchaseMonthly,
      refresh,
      restorePurchases,
      subscriptionDiagnostic: subscriptionDiagnosticCopy({
        customerInfo: state.customerInfo,
        error: state.error,
        isConfigured: state.isConfigured,
        isNative,
        isWeb,
        status: state.status,
      }),
      subscriptionManagementUrl: managementUrl,
    }),
    [
      isNative,
      isWeb,
      cancelOpensManagement,
      cancelSubscription,
      requiresWebCancellation,
      managementUrl,
      purchaseMonthly,
      refresh,
      restorePurchases,
      state,
      subscriptionQuery?.monthlyPriceLabel,
    ]
  )
}

export { hasActiveSubscription, hasOneRepPro, revenueCatErrorMessage }
