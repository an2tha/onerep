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
import {
  PaywallPresentationConfiguration,
  RevenueCatUI,
  type PaywallResult,
} from "@revenuecat/purchases-capacitor-ui"

export const REVENUECAT_API_KEY =
  (import.meta.env.VITE_REVENUECAT_API_KEY as string | undefined) ||
  "test_ZtFaeAWMEPSMwTZvghYNfBcMBvP"
export const ONEREP_PRO_ENTITLEMENT = "OneRep Pro"
export const MONTHLY_PACKAGE_IDENTIFIER = "monthly"

type RevenueCatStatus = "idle" | "loading" | "ready" | "unsupported" | "error"

type RevenueCatState = {
  customerInfo: CustomerInfo | null
  currentOffering: PurchasesOffering | null
  error: string | null
  isConfigured: boolean
  isNative: boolean
  monthlyPackage: PurchasesPackage | null
  status: RevenueCatStatus
}

type UseRevenueCatOptions = {
  email?: string | null
  name?: string | null
  userId?: string | null
}

let configuredAppUserId: string | null = null
let configurePromise: Promise<void> | null = null

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

function getMonthlyPackage(offering: PurchasesOffering | null) {
  if (!offering) return null
  return (
    offering.monthly ??
    offering.availablePackages.find(
      (item) => item.identifier === MONTHLY_PACKAGE_IDENTIFIER
    ) ??
    null
  )
}

function hasOneRepPro(customerInfo: CustomerInfo | null) {
  return Boolean(customerInfo?.entitlements.active[ONEREP_PRO_ENTITLEMENT])
}

async function configureRevenueCat(appUserId: string) {
  if (configuredAppUserId === appUserId && configurePromise) {
    await configurePromise
    return
  }

  configuredAppUserId = appUserId
  configurePromise = (async () => {
    await Purchases.setLogLevel({
      level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO,
    })
    await Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
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
  const listenerIdRef = useRef<PurchasesCallbackId | null>(null)
  const [state, setState] = useState<RevenueCatState>({
    customerInfo: null,
    currentOffering: null,
    error: null,
    isConfigured: false,
    isNative,
    monthlyPackage: null,
    status: isNative ? "idle" : "unsupported",
  })

  const refresh = useCallback(async () => {
    if (!isNative) return null
    setState((current) => ({ ...current, error: null, status: "loading" }))
    try {
      const [{ customerInfo }, offerings] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ])
      const currentOffering = offerings.current
      const monthlyPackage = getMonthlyPackage(currentOffering)
      setState((current) => ({
        ...current,
        customerInfo,
        currentOffering,
        error: null,
        isConfigured: true,
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
  }, [isNative])

  useEffect(() => {
    let canceled = false

    async function configure() {
      if (!isNative) {
        setState((current) => ({
          ...current,
          isNative,
          status: "unsupported",
        }))
        return
      }
      if (!options.userId) return

      setState((current) => ({ ...current, error: null, status: "loading" }))
      try {
        await configureRevenueCat(options.userId)
        await syncCustomerAttributes(options)
        if (canceled) return
        const listenerId = await Purchases.addCustomerInfoUpdateListener(
          (customerInfo) => {
            setState((current) => ({
              ...current,
              customerInfo,
              error: null,
              status: "ready",
            }))
          }
        )
        listenerIdRef.current = listenerId
        await refresh()
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
  }, [isNative, options.email, options.name, options.userId, refresh])

  const restorePurchases = useCallback(async () => {
    if (!isNative) throw new Error("Purchases are available in the mobile app")
    const { customerInfo } = await Purchases.restorePurchases()
    setState((current) => ({
      ...current,
      customerInfo,
      error: null,
      status: "ready",
    }))
    return customerInfo
  }, [isNative])

  const purchaseMonthly = useCallback(async () => {
    if (!isNative) throw new Error("Purchases are available in the mobile app")
    const monthlyPackage = state.monthlyPackage
    if (!monthlyPackage) throw new Error("Monthly package is not configured")
    const { customerInfo } = await Purchases.purchasePackage({
      aPackage: monthlyPackage,
    })
    setState((current) => ({
      ...current,
      customerInfo,
      error: null,
      status: "ready",
    }))
    return customerInfo
  }, [isNative, state.monthlyPackage])

  const presentPaywall = useCallback(async (): Promise<PaywallResult> => {
    if (!isNative) throw new Error("Paywalls are available in the mobile app")
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ONEREP_PRO_ENTITLEMENT,
      offering: state.currentOffering ?? undefined,
      presentationConfiguration: PaywallPresentationConfiguration.DEFAULT,
      displayCloseButton: true,
      listener: {
        onPurchaseCompleted({ customerInfo }) {
          setState((current) => ({
            ...current,
            customerInfo,
            error: null,
            status: "ready",
          }))
        },
        onRestoreCompleted({ customerInfo }) {
          setState((current) => ({
            ...current,
            customerInfo,
            error: null,
            status: "ready",
          }))
        },
      },
    })
    await refresh()
    return result
  }, [isNative, refresh, state.currentOffering])

  const presentCustomerCenter = useCallback(async () => {
    if (!isNative) {
      throw new Error("Customer Center is available in the mobile app")
    }
    await RevenueCatUI.presentCustomerCenter()
    await refresh()
  }, [isNative, refresh])

  return useMemo(
    () => ({
      ...state,
      hasOneRepPro: hasOneRepPro(state.customerInfo),
      monthlyPrice: state.monthlyPackage?.product.priceString ?? null,
      presentCustomerCenter,
      presentPaywall,
      purchaseMonthly,
      refresh,
      restorePurchases,
      subscriptionManagementUrl: state.customerInfo?.managementURL ?? null,
    }),
    [
      presentCustomerCenter,
      presentPaywall,
      purchaseMonthly,
      refresh,
      restorePurchases,
      state,
    ]
  )
}

export { hasOneRepPro, revenueCatErrorMessage }
