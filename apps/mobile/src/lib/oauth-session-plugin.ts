import { registerPlugin } from "@capacitor/core"

/**
 * The JS face of `ios/App/App/OAuthSessionPlugin.swift`.
 *
 * One call, one round trip: hand it the provider URL and the scheme our
 * callback comes back on, and it resolves with the full redirect URL once
 * iOS intercepts it. `cancelled` covers the user swiping the sheet away,
 * which is not an error and must not be shown as one.
 */
export type OAuthSessionResult = {
  cancelled: boolean
  url?: string
}

export type OAuthSessionPlugin = {
  start(options: {
    url: string
    callbackScheme: string
  }): Promise<OAuthSessionResult>
}

export const OAuthSession = registerPlugin<OAuthSessionPlugin>("OAuthSession")
