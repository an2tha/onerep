/** Native upgrades are paused until the App Store purchase setup is ready. */
export function canOfferProUpgrade(isNative: boolean): boolean {
  return !isNative
}
