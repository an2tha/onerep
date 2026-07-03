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
import type {
  CustomerInfo as WebCustomerInfo,
  Offering as WebOffering,
  Package as WebPackage,
  Purchases as WebPurchases,
  PaywallPurchaseResult,
} from "@revenuecat/purchases-js"

export const REVENUECAT_API_KEY =
  (import.meta.env.VITE_REVENUECAT_API_KEY as string | undefined) ||
  "test_ZtFaeAWMEPSMwTZvghYNfBcMBvP"
export const ONEREP_PRO_ENTITLEMENT = "OneRep Pro"
export const MONTHLY_PACKAGE_IDENTIFIER = "monthly"
export const REVENUECAT_OFFERING_IDENTIFIER = "default"

type RevenueCatStatus = "idle" | "loading" | "ready" | "unsupported" | "error"
type AnyCustomerInfo = CustomerInfo | WebCustomerInfo
type AnyOffering = PurchasesOffering | WebOffering
type AnyPackage = PurchasesPackage | WebPackage

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
let configuredWebAppUserId: string | null = null
let configureWebPromise: Promise<WebPurchases> | null = null

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

function getConfiguredOffering<T extends { all: Record<string, AnyOffering>; current: AnyOffering | null }>(
  offerings: T
) {
  return offerings.all[REVENUECAT_OFFERING_IDENTIFIER] ?? offerings.current
}

function hasOneRepPro(customerInfo: AnyCustomerInfo | null) {
  return Boolean(customerInfo?.entitlements.active[ONEREP_PRO_ENTITLEMENT])
}

function monthlyPriceString(monthlyPackage: AnyPackage | null) {
  if (!monthlyPackage) return null
  if ("product" in monthlyPackage) {
    return monthlyPackage.product.priceString
  }
  return monthlyPackage.webBillingProduct.currentPrice.formattedPrice
}

function createWebPaywallHost() {
  let close: (() => void) | null = null
  const closed = new Promise<never>((_, reject) => {
    close = () => reject(new Error("Purchase canceled"))
  })
  const overlay = document.createElement("div")
  overlay.className = "onerep-revenuecat-paywall-overlay"
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-modal", "true")

  const panel = document.createElement("div")
  panel.className = "onerep-revenuecat-paywall-panel"

  const closeButton = document.createElement("button")
  closeButton.type = "button"
  closeButton.className = "onerep-revenuecat-paywall-close"
  closeButton.setAttribute("aria-label", "Close paywall")
  closeButton.textContent = "×"
  closeButton.addEventListener("click", () => close?.())

  const target = document.createElement("div")
  target.className = "onerep-revenuecat-paywall-target"

  panel.appendChild(closeButton)
  panel.appendChild(target)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)
  document.body.style.overflow = "hidden"

  return {
    closed,
    target,
    remove() {
      overlay.remove()
      document.body.style.overflow = ""
    },
  }
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

async function configureWebRevenueCat(appUserId: string) {
  if (configuredWebAppUserId === appUserId && configureWebPromise) {
    return await configureWebPromise
  }

  configuredWebAppUserId = appUserId
  configureWebPromise = (async () => {
    const { LogLevel, Purchases: WebPurchasesSdk } = await import(
      "@revenuecat/purchases-js"
    )
    WebPurchasesSdk.setLogLevel(import.meta.env.DEV ? LogLevel.Debug : LogLevel.Warn)
    const purchases = WebPurchasesSdk.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserId,
    })
    await purchases.preload().catch(() => {
      // Best-effort preload; normal refresh will surface actionable errors.
    })
    return purchases
  })()

  return await configureWebPromise
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
  const webPurchasesRef = useRef<WebPurchases | null>(null)
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

  const refresh = useCallback(async () => {
    if (!isNative && !isWeb) return null
    setState((current) => ({ ...current, error: null, status: "loading" }))
    try {
      const customerInfoPromise = isNative
        ? Purchases.getCustomerInfo().then((result) => result.customerInfo)
        : webPurchasesRef.current?.getCustomerInfo()
      const offeringsPromise = isNative
        ? Purchases.getOfferings()
        : webPurchasesRef.current?.getOfferings()
      if (!customerInfoPromise || !offeringsPromise) return null
      const [customerInfo, offerings] = await Promise.all([
        customerInfoPromise,
        offeringsPromise,
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
  }, [isNative, isWeb])

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
      if (!options.userId) return

      setState((current) => ({ ...current, error: null, status: "loading" }))
      try {
        if (isNative) {
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
        } else {
          webPurchasesRef.current = await configureWebRevenueCat(options.userId)
        }
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
  }, [isNative, isWeb, options.email, options.name, options.userId, refresh])

  const restorePurchases = useCallback(async () => {
    if (!isNative) {
      if (isWeb) await refresh()
      throw new Error(
        "Restore is handled through RevenueCat web checkout on desktop"
      )
    }
    const { customerInfo } = await Purchases.restorePurchases()
    setState((current) => ({
      ...current,
      customerInfo,
      error: null,
      status: "ready",
    }))
    return customerInfo
  }, [isNative, isWeb, refresh])

  const purchaseMonthly = useCallback(async () => {
    const monthlyPackage = state.monthlyPackage
    if (!monthlyPackage) throw new Error("Monthly package is not configured")
    if (!isNative) {
      await webPurchasesRef.current?.purchasePackage(
        monthlyPackage as WebPackage,
        options.email ?? undefined
      )
      const customerInfo = await refresh()
      return customerInfo
    }
    const { customerInfo } = await Purchases.purchasePackage({
      aPackage: monthlyPackage as PurchasesPackage,
    })
    setState((current) => ({
      ...current,
      customerInfo,
      error: null,
      status: "ready",
    }))
    return customerInfo
  }, [isNative, options.email, refresh, state.monthlyPackage])

  const presentPaywall = useCallback(async (): Promise<
    PaywallResult | PaywallPurchaseResult
  > => {
    if (isNative) {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: ONEREP_PRO_ENTITLEMENT,
        offering: (state.currentOffering as PurchasesOffering | null) ?? undefined,
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
    }

    const purchases = webPurchasesRef.current
    if (!purchases) throw new Error("Paywall is not ready yet")
    const host = createWebPaywallHost()
    try {
      const result = await Promise.race([
        purchases.presentPaywall({
          offering: (state.currentOffering as WebOffering | null) ?? undefined,
          customerEmail: options.email ?? undefined,
          htmlTarget: host.target,
          purchaseHtmlTarget: host.target,
          onBack: (closePaywall) => {
            closePaywall()
          },
        }),
        host.closed,
      ])
      setState((current) => ({
        ...current,
        customerInfo: result.customerInfo,
        error: null,
        status: "ready",
      }))
      await refresh()
      return result
    } finally {
      host.remove()
    }
  }, [isNative, options.email, refresh, state.currentOffering])

  const presentCustomerCenter = useCallback(async () => {
    if (isNative) {
      await RevenueCatUI.presentCustomerCenter()
      await refresh()
      return
    }
    const url = state.customerInfo?.managementURL
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer")
      return
    }
    throw new Error("No subscription management link is available yet")
  }, [isNative, refresh, state.customerInfo?.managementURL])

  return useMemo(
    () => ({
      ...state,
      hasOneRepPro: hasOneRepPro(state.customerInfo),
      monthlyPrice: monthlyPriceString(state.monthlyPackage),
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
