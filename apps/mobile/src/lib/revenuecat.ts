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

type RevenueCatStatus = "idle" | "loading" | "ready" | "unsupported" | "error"
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
  source: "revenuecat_api" | "manual"
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

export function useRevenueCat(options: UseRevenueCatOptions) {
  const isNative = isNativePurchasesAvailable()
  const isWeb = isWebPurchasesAvailable()
  const listenerIdRef = useRef<PurchasesCallbackId | null>(null)
  const subscriptionQuery = useQuery(api.subscriptions.getStatus)
  const createCheckout = useAction(api.subscriptions.createCheckout)
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
        const status = await refreshFromRevenueCat({})
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
      const customerInfoPromise = isNative ? refreshFromRevenueCat({}) : null
      const offeringsPromise = isNative ? Purchases.getOfferings() : null
      if (!customerInfoPromise || !offeringsPromise) {
        setState((current) => ({
          ...current,
          error: "Subscription service is not ready. Try again in a moment.",
          status: "error",
        }))
        return null
      }
      const [customerInfo, offerings] = await Promise.all([
        withRevenueCatTimeout(
          customerInfoPromise as Promise<AnyCustomerInfo>,
          "Subscription status"
        ),
        withRevenueCatTimeout(
          offeringsPromise as Promise<{
            all: Record<string, AnyOffering>
            current: AnyOffering | null
          }>,
          "Subscription products"
        ),
      ])
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
  }, [isNative, isWeb, refreshFromRevenueCat])

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
      if (!options.userId) {
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
            configureRevenueCat(options.userId, nativeSdkKey),
            "Subscription setup"
          )
          await syncCustomerAttributes(options)
          if (canceled) return
          const listenerId = await Purchases.addCustomerInfoUpdateListener(
            () => {
              void refresh()
              setState((current) => ({
                ...current,
                error: null,
                status: "ready",
              }))
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
    options.email,
    options.name,
    options.userId,
    refresh,
    subscriptionQuery,
  ])

  const restorePurchases = useCallback(async () => {
    if (!isNative) {
      const customerInfo = isWeb ? await refresh() : null
      if (customerInfo) return customerInfo
      throw new Error("Could not refresh desktop subscription status")
    }
    await Purchases.restorePurchases()
    return await refresh()
  }, [isNative, isWeb, refresh])

  const purchaseMonthly = useCallback(async () => {
    const monthlyPackage = state.monthlyPackage
    if (!isNative) {
      if (!options.userId) {
        throw new Error("Sign in before starting checkout")
      }
      if (typeof window === "undefined") {
        throw new Error("Checkout is only available in the browser")
      }
      const checkout = await createCheckout({})
      window.location.assign(checkout.url)
      return state.customerInfo
    }
    if (!monthlyPackage) throw new Error("Monthly package is not configured")
    await Purchases.purchasePackage({
      aPackage: monthlyPackage as PurchasesPackage,
    })
    return await refresh()
  }, [
    createCheckout,
    isNative,
    options.userId,
    refresh,
    state.customerInfo,
    state.monthlyPackage,
  ])

  return useMemo(
    () => ({
      ...state,
      canPurchase:
        state.status !== "loading" &&
        state.status !== "unsupported" &&
        (isNative ? Boolean(state.monthlyPackage) : isWeb && !!options.userId),
      hasActiveSubscription: hasActiveSubscription(state.customerInfo),
      hasOneRepPro: hasOneRepPro(state.customerInfo),
      monthlyPrice:
        monthlyPriceString(state.monthlyPackage) ??
        (isWeb ? (subscriptionQuery?.monthlyPriceLabel ?? null) : null),
      purchaseMonthly,
      refresh,
      restorePurchases,
      subscriptionManagementUrl:
        (state.customerInfo as EntitlementContainer | null)?.managementURL ??
        (state.customerInfo as EntitlementContainer | null)?.managementUrl ??
        null,
    }),
    [
      isNative,
      isWeb,
      options.userId,
      purchaseMonthly,
      refresh,
      restorePurchases,
      state,
      subscriptionQuery?.monthlyPriceLabel,
    ]
  )
}

export { hasActiveSubscription, hasOneRepPro, revenueCatErrorMessage }
