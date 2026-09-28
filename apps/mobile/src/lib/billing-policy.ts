import { Capacitor } from "@capacitor/core"

/** Pro upgrades use StoreKit on iOS and web checkout in the browser. */
export function canOfferProUpgrade(
  isNative: boolean,
  platform: string = Capacitor.getPlatform()
): boolean {
  return !isNative || platform === "ios"
}
