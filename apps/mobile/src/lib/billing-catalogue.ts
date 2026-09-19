import { fetchStoreProducts, storeKitAvailable } from "./billing-plugin"

function withTimeout<T>(
  operation: Promise<T>,
  milliseconds: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The App Store took too long to respond.")),
      milliseconds
    )
    operation.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

/** Retry transient StoreKit errors and empty responses, but never a purchase. */
export async function loadStoreProduct(
  productId: string,
  { retryDelayMs = 750, timeoutMs = 10000 } = {}
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const available = await withTimeout(storeKitAvailable(), timeoutMs)
      if (!available)
        throw new Error(
          "Purchases are unavailable on this device. Check your App Store connection and purchase restrictions, then retry."
        )
      const products = await withTimeout(
        fetchStoreProducts([productId]),
        timeoutMs
      )
      const product = products.find((candidate) => candidate.id === productId)
      if (!product)
        throw new Error(
          "The App Store couldn’t load this subscription. Please retry in a moment."
        )
      return product
    } catch (cause) {
      if (attempt === 2) throw cause
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * (attempt + 1))
      )
    }
  }
  throw new Error("The App Store couldn’t load this subscription.")
}
